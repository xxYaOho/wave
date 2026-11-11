---
date: 2026-11-11
state: 已批准（STRICT DELTA R2 PASS，2026-11-11）
dispatch: R1 FAIL 4F/5M → Human 裁决 DELTA → F2/F3/F4 R1-DELTA PASS、F1 DELTA R2 PASS；MAJOR M1–M5 台账 carry forward，见 .tmp/p2/strict-major-ledger.md
---

# Wave P2 Compress 性能 Plan

## Problem Statement

compress 链路当前完全串行：`runCompress()` 的编码+写入是单 `for` 循环逐文件执行（`src/core/compress/index.ts:164-233`），扫描同样串行递归（`index.ts:257-290`）；工具发现每次任务全量重来——`runCompress` 每次 `new DefaultToolResolver()`（`index.ts:111`），每个能力实测 1-2 个 `--version` 子进程且无任何缓存（`src/core/tools/resolver.ts:50-77`）。同一 CLI 调用内 preview 与 run 还会重复扫描一次（`index.ts:78`）。行为侧缺口：工具中途失败直接冒泡中止整批、已处理 items 结果全丢（`index.ts:438-442`）；无取消机制（无 AbortSignal/SIGINT，子进程无超时、无 kill）；无资源上限概念。性能测量为零（`benchmarks/` 仅 design-token 域）。大批量素材下耗时线性放大且不可中断。

## Solution

在行为等价（成功路径输出不变）前提下重构压缩编排：有界并发的编码阶段、单次进程内扫描复用、工具发现进程内复用、逐项失败聚合（不中止整批）、SIGINT 取消与子进程超时终止、并发上限与子进程超时构成资源边界；性能收益以 Q0 M2 compress 域基线的实测分布证明，无收益机制撤回。

## Rex 对话协议

与 Q0 计划相同的三方结构：主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；本计划专用 block：

| 角色 | Rex block | Agent | 职责 |
| --- | --- | --- | --- |
| STRICT | `block:01a1c9cb-24c5-74f1-80a9-599a67db4f09` | Codex GPT-6.1-Sol (max) | 本 SPEC 与交付的独立审查（SPEC 通过后 strict 不进入施工期） |
| CODER-PLUS | `block:01a1c9ca-3f36-72f9-a222-a01f4d48c776` | Codex GPT-6.1-Sol (high) | Milestone 施工 |

- 会话：`session:01a1ac63-3359-7305-a46f-01905fa5fd4b`
- 派遣/回读/fresh agent 规则同 Q0 SPEC「Rex 对话协议」节（`/clear` 取 fresh、长工单落 `.tmp/` 文件给路径）
- 完成通知（工单必带，字面命令）：`rex send -s <会话> -b block:01a1c840-368d-74ed-a73a-ff1e89c91557 '<Milestone> STATUS/HEAD'` 后接 `rex send-key -s <会话> -b block:01a1c840-368d-74ed-a73a-ff1e89c91557 enter`；沙箱拒绝 socket 提权重试一次，仍失败留报告在本 block
- 施工包与 gate 粒度：遵循 workflow/coding.md——一次派遣一个 Milestone 切片（`split.sh` 生成）+ 角色合同副本薄壳；gate 在 Milestone 边界由主代理执行

## User Stories

1. 作为设计师，我希望批量压缩利用机器并行能力且进程内有界，以便大批量素材在可预期时间内完成。
2. 作为设计师，我希望压缩可被 Ctrl-C 取消且已完成的文件保留，以便中断长任务不丢失已完成工作。
3. 作为项目维护者，我希望失败逐项聚合报告而非整批丢弃，以便定位个别问题素材后重跑剩余项。
4. 作为项目维护者，我希望压缩性能相对 Q0 基线有实测收益分布，以便只保留真实收益的机制。

## Constraints

- 压缩算法与编码器实现不变（路线图 Out of Scope）。
- 成功路径的公共 CLI 行为与输出内容不变：dry-run 语义、`--yes`/prompt 交互、`--force` 覆盖、输出冲突 `WCP_OUTPUT_EXISTS` 防护与「校验后写入」安全语义不变。
- **声明式行为变更（本计划交付项）**：工具硬失败的处理从「首错冒泡中止整批」改为「逐项失败聚合、其余项继续、退出码反映聚合结果」。`WCP_TOOL_MISSING` 的 preflight 语义不变——默认路径任一工具缺失即整批零写入（`index.ts:117-136,373-385`：items=[]、written=false），不做「缺工具部分落盘」变更。此项是路线图 Decision 6 明确交付，其余失败场景语义不变。
- 并发必须有界且以子进程为并行单位；不引入 worker 线程、原生模块或复杂调度（路线图约束）。
- 不引入持久缓存与跨进程缓存协议；工具发现复用限于单次进程内。
- 不新增公共 CLI 参数；并发上限与超时为内部常量，初值依 CPU 核数设定，终值依 Q0 M2 compress 基线与实测分布校准并记录依据。
- 取消时不改变写入安全合同：已通过校验并写入的文件保留，未写入项不再写入，退出码与逐项状态如实报告（输出合同统一语义属 C3）。

## Implementation Decisions

1. 编排重构：`runCompress` 拆分为扫描、解析、校验、编码调度、聚合报告五阶段；编码阶段以任务队列 + 有界并发执行，单文件 `compressFile` 保持原子（临时目录产物 → 大小比较 → 拷贝），并发不改变单文件流程；检测到源/目标重叠的批次回退串行（见决策 8）。
2. 工具发现复用（实证驱动）：先实测确认重复探测的真实路径与计数基线；仅当存在可复用探测且缓存有实测收益时引入进程内缓存，缓存 key 按 capability + mode + preferred 隔离、不缓存完整 resolution（避免改变候选诊断信息）；无收益即撤回本机制（撤回合同见决策 7）。
3. 扫描复用：同一次 CLI 调用内 preview 与 run 共享一次扫描结果。
4. 失败聚合：逐项捕获工具失败，结果结构按「结果与退出码合同（冻结）」执行——per-item 处理态与既有结果态共存、issues 汇总与计数、聚合退出码；`WCP_TOOL_MISSING` 的 preflight 语义不变（任一工具缺失即整批零写入）。
5. 取消：`AbortSignal` 贯穿扫描与编码调度；SIGINT 停止派发、终止运行中子进程并等待**有界终止**完成（进程树与 stdout/stderr 流关闭）；取消检查点位于提交发起前，提交发起后 await settle 不中断；已写入文件保留，退出码按合同。
6. 子进程超时：超时常量**仅 compress 链路启用**，`tools/command-runner` 对既有 Motion / install 消费者行为不变；超时为有界终止（等待进程树与流关闭，必要时升级 kill），记该项硬失败；超时值记录校准依据。
7. 资源边界与撤回合同：并发上限 + 子进程超时构成边界；资源验收口径**含编码器子进程树的 CPU / 内存峰值**（非仅父进程 RSS），与同 case 串行基线同口径比较，由实测分布记录可接受边界与撤回条件，并核验实际最大在途任务数；任一机制无统计意义收益即撤回并记录。
8. 源/目标重叠合同：批次检测到任一输出路径属于输入集（含递归复跑 outputDir ⊆ inputDir）时，该批次**强制回退串行**按扫描顺序执行，行为与旧版逐字节一致；非重叠批次沿用 `validateOutputTargets` 既有校验时点与 `WCP_OUTPUT_EXISTS` / force 语义。

## Testing Decisions

- 等价性：同一文件集与工具集下，并发实现的输出字节与串行基线一致（含 unchanged 回退原始字节语义）。
- 失败聚合：构造单个工具中途失败，断言其余项完成、逐项状态正确、聚合退出码；**preflight 基线回归**——混合工具集缺一工具（如 PNG 可用、SVG 缺失）断言整批零写入、items=[]、written=false、退出码与现状一致。
- 结果合同：按「结果与退出码合同（冻结）」对 JSON 字段、计数、退出码与取消终态逐项断言（含既有字段不变）。
- 取消：模拟 SIGINT 断言停止派发、子进程**有界终止**（进程树与流关闭）、已写入保留、未写入不存在、退出码 130、汇总含 `cancelled: true`；覆盖提交发起期间取消的 settle 语义。
- 超时：构造挂起工具断言有界终止与逐项硬失败，覆盖忽略终止信号与后代持有管道场景。
- 冲突与安全：既有 `WCP_OUTPUT_EXISTS`/force/dry-run 测试不回归；并发下无重复写入；递归复跑（outputDir ⊆ inputDir）场景输出与串行旧版逐字节一致。
- 性能证据：以 Q0 M2 compress 域基线为比较对象，输出收益分布（不只成功耗时）；资源观测含编码器子进程树峰值，与同 case 基线同口径，记录可接受边界、撤回条件与实际最大在途任务数。
- 质量门：`pnpm check:ci` 不退化；干净检出可重复。

## Out of Scope

- 不修改压缩算法、编码器实现或工具目录（`tools/catalog.ts` 候选表内容不增删）。
- 不新增公共 CLI 参数、alias 或持久缓存协议。
- 不引入 worker 线程、原生模块或任务级进度 UI。
- 不统一输出写入合同（C3 范围）；不改变预览输出的信息结构。
- 不做 Motion 场景的并发（路线图：Motion 不为单一编码任务引入无收益并发）。

## Draft Plan

- 结构总览：`compress/index.ts` 从单循环编排改为五阶段编排（扫描/解析/校验/调度/聚合）；`tools/resolver.ts` 增加进程内缓存层；`tools/command-runner.ts` 增加超时与信号终止；CLI 层 `compress.ts` 保持参数解析与渲染，消费聚合结果。
- 关键契约：并发上限与超时为 `src/core/tools/` 内常量；逐项结果结构含 per-item 状态枚举；取消通过 AbortSignal 传播，无全局可变状态。
- 文件结构：`src/core/compress/index.ts`（编排重构）、`src/core/tools/resolver.ts`（缓存）、`src/core/tools/command-runner.ts`（超时/终止）、`src/cli/commands/compress.ts`（聚合结果渲染，仅消费）、`tests/cli-compress.test.ts` 与新增 `tests/compress-*.test.ts`（失败/取消/超时/等价）、`benchmarks/` compress 域消费（M2 既有 runner，不改契约）。
- 风险与未决：并发上限与超时初值需 M2 基线校准（SPEC 已声明校准义务）；SIGINT 模拟测试的跨平台行为（本仓库仅 macOS 开发环境，测试以进程信号 API 为准）；preview 与 run 共享扫描在 dry-run-only 路径的收益有限，仍属顺带简化。无阻塞拆分的未决项。
- 里程碑草案：M1 等价输出的编排重构（并发 + 复用 + 失败聚合）；M2 取消、超时与性能证据。

## 结果与退出码合同（冻结）

- **逐项结果**：items 包含全部派发处理项；每项保留既有结果态字段（optimized / unchanged / cleaned 等，语义不变）并新增处理态 `result: 'success' | 'soft-failed' | 'hard-failed'`；处理态与结果态独立共存，不合并语义。**硬失败项字段定义**：仅保留既有标识字段（输入路径等）+ `result: 'hard-failed'` + WCP 分类码与错误消息（与 issues 同源）；产物派生字段（optimized / unchanged / cleaned 状态位、afterBytes 等字节数字段）**不存在、不设默认值**，消费方以 `result` 判定可读字段集。
- **汇总**：既有顶层字段全部不变（含 `written: boolean`，`core/compress/index.ts:51`）；新增 `summary` 对象承载计数 `{ total, succeeded, softFailed, hardFailed, writtenCount }` 与 `issues[]`（每项含路径 + WCP 分类码）；取消时附 `cancelled: true`。新增只增不改。
- **退出码**：沿用现状数值语义——成功 `0`；任何错误路径（聚合硬失败、preflight 缺工具、输出冲突等）`1`（`compress.ts:345-365` 现状，不变）；取消 `130`（SIGINT 惯例，新增）。WCP 分类码仅作为 `issues[]` 分类与进程内错误分类，**不映射退出码数值**。
- **取消终态**：停止派发、运行中任务等待提交点 settle；已写入文件保留、未写入不存在；JSON 汇总照常输出并携带 `cancelled: true`。
- **提交边界**：提交点 = 最终路径 `fs.copyFile` 发起；取消检查点位于提交发起前，提交发起后 await settle 不中断；不主张文件系统原子性，主张提交顺序性；copyFile 失败记该项 hard-failed 并如实报告（force 覆盖中断后的目标状态由该顺序语义唯一决定）。
- **源/目标重叠**：批次检测到任一输出路径 ∈ 输入集时强制串行回退（按扫描顺序），与旧版逐字节一致；检测逻辑有测试锁定。

## Implement Plan

worktree `p2-compress-performance` 已建（基点 b245c71），SPEC 与施工均在分支上交付，开工前 rebase 到 Q0 已集成的 main 并跑 `mise install && pnpm install`。执行顺序：M1（Task-1 编排与并发、Task-2 失败聚合与复用）→ M1 闸门（主代理）→ M2（Task-3 取消与超时、Task-4 性能证据）→ M2 闸门 → pruner → 按路线图集成。SPEC 通过 STRICT 审查后冻结进入施工；strict 不进入施工期；gate 为 Milestone 粒度、主代理全程担任；一次派遣消费一个 Milestone 切片（split.sh + 合同副本薄壳）。

## Milestone-1

等价输出的有界并发编排

- 验证主题：并发实现在同输入下输出字节与串行一致；失败逐项聚合；扫描与工具发现进程内复用；既有 CLI 测试全量不回归。
- 核验基线：`pnpm check:ci`；`tests/cli-compress.test.ts` 全量；新增失败聚合与等价测试；Q0 M2 compress 域 runner 跑通。
- 来源：User Stories 1、3；Implementation Decisions 1–4、8；Testing Decisions 1–2、5。

### Task-1

编排重构与有界并发（来源：User Story 1；Implementation Decisions 1、8）

- 验收标准：编码阶段有界并发执行，输出字节与串行基线一致（含 unchanged 回退）；单文件原子性保持；并发上限为常量并记录取值依据；dry-run/`--yes`/`--force`/冲突防护行为不变。
- 可动文件范围：`src/core/compress/index.ts`、并发与等价新增测试。
- 依赖：Q0 已集成 main。
- 固有风险：并发引入的写入顺序差异不得影响输出内容；校验-写入窗口在并发下不得扩大（校验仍在派发前完成）。

- [x] 编排五阶段重构与有界信号量实现。（5f316f5；并发常量 2，permit 覆盖编码/分类/写入 settle，结果按扫描顺序）
- [x] 并发/串行输出等价测试与既有 CLI 测试回归。（六场景 SHA256 等价含 unchanged/quality/SVG/dry-run/递归复跑/冲突；16 项编排回归 + 3 项 CLI 聚合回归）

### Task-2

工具发现与扫描复用、失败聚合（来源：User Story 3；Implementation Decisions 2–4）

- 验收标准：先实测重复探测的真实路径与计数基线并记录；仅当实证存在收益时引入进程内 resolver 缓存（key 按 capability + mode + preferred 隔离，不缓存完整 resolution），否则记录撤回依据；preview+run 共享扫描；单个工具硬失败时其余项完成、逐项状态与聚合退出码正确；preflight 缺工具语义不变（整批零写入）并新增混合缺工具回归。
- 可动文件范围：`src/core/tools/resolver.ts`、`src/core/compress/index.ts`、`src/cli/commands/compress.ts`（渲染消费）、失败聚合测试。
- 依赖：Task-1。
- 固有风险：失败聚合的退出码语义需与既有 CLI 约定一致；聚合报告不得破坏 JSON 输出结构（既有测试覆盖）。

- [x] resolver 进程内缓存与扫描复用。（实证裁决：基线 preview=0 probes / run=4 resolutions 全去重，缓存按撤回合同撤回；扫描复用以 WeakMap 快照 + 匹配校验 + 执行前整批重校验实现）
- [x] 逐项失败聚合与退出码、渲染、测试。（结果冻结合同字面落地：summary.issues 增量、written:boolean 保留、硬失败项仅标识+result+code+message、WCP_COMPRESS_FAILED/WCP_WRITE_FAILED）

> [!IMPORTANT]
> Milestone-1 闸门：主代理核对等价性证据与全量回归，任一未过不得进入 M2。
>
> 闸门结果（2026-11-12，通过）：交付 HEAD `5f316f5`（单笔提交，4 个授权文件，工作区冻结）。六场景等价（含递归复跑串行回退）、preflight 缺工具整批零写入回归、结果冻结合同字面落地；resolver 缓存实证撤回（M3 关闭）；1206 pass / 0 fail、typecheck/build/style 全 0。已接受偏差（主代理裁决）：`bun test --timeout 15000` 替代默认 5s 作为本宿主验证命令——既有 help 遍历测试在原始未修改基线上同样超 5s（独立归档证据），属宿主并发负载环境事实，非代码或断言变更；是否制度化调整默认时限待 Human 检查点裁决。

## Milestone-2

取消、超时与性能证据

- 验证主题：SIGINT 取消端到端行为正确；子进程超时终止；资源峰值有观测；相对 Q0 基线的收益分布成立。
- 核验基线：取消/超时新增测试；Q0 M2 compress 域 runner 双场景对比（串行基线记录 vs 并行交付）；`pnpm check:ci` 不退化。
- 来源：User Stories 2、4；Implementation Decisions 5–7；Testing Decisions 3–4、6–7。

### Task-3

取消与子进程超时（来源：User Story 2；Implementation Decisions 5–6）

- 验收标准：SIGINT 停止派发并**有界终止**子进程（等待进程树与 stdout/stderr 关闭），已写入保留、未写入不存在、退出码 130、汇总含 `cancelled: true`；子进程超时记为逐项硬失败；取消与超时**仅 compress 链路启用**（Motion / install 消费者行为不变，含针对性回归）；忽略终止信号与后代持有管道样本下终止完成有测试；提交发起期间取消的 settle 语义有固定测试。
- 可动文件范围：`src/core/compress/index.ts`、`src/core/tools/command-runner.ts`、`src/cli/commands/compress.ts` 的**取消消费层**（SIGINT 生命周期处理、cancelled 渲染、退出码 130 落定——不新增公共参数）、取消与超时测试。
- 依赖：M1 闸门。
- 固有风险：有界终止的主要风险源是信号忽略与后代进程持管道；提交发起后的中断语义由合同顺序性唯一决定（不主张文件系统原子性）。

- [x] AbortSignal 贯穿与 SIGINT 处理。（0dde4fe；信号贯穿、停止派发、提交前检查 + 发起后 settle；CLI 消费层 SIGINT 生命周期 / cancelled 渲染 / 退出码 130）
- [x] command-runner 超时与测试。（opt-in 作用域仅 compress，Motion/install 原实现 + 回归；TERM→200ms→KILL 有界终止，等待进程树与流关闭，进程组消失有界核验；18 项生命周期/终止/边界回归）

### Task-4

性能证据与校准（来源：User Story 4；Implementation Decision 7）

- 验收标准：以 Q0 M2 compress 域基线为比较对象输出收益分布与资源峰值观测（口径含编码器子进程树，与同 case 基线同口径）；并发上限与超时终值校准并记录依据；实际最大在途任务数有核验证据；无收益机制按撤回合同撤回并记录。
- 可动文件范围：`benchmarks/` compress 域消费脚本（不改 M2 契约）、校准记录，以及为落实校准 / 撤回裁决而调整 Task-1 / Task-3 引入的常量与机制（仅限该两类改动，gate 逐项核对最终源码与记录一致）。
- 依赖：Task-3。
- 固有风险：基线可比性要求同域同入口同 case（M4 契约字段）；素材 fixture 必须 hermetic。

- [x] 基线对比运行与收益分布记录。（Q0 基线配对中位加速 1.20x；真实 oxipng/SVGO 中位加速 1.90x（CI 1.89–1.91）、p95 比 0.52；树 RSS 峰值 136/205MiB、CPU 40/78%、最大在途 2——全部在拒绝条件内）
- [x] 常量终值校准与文档记录。（采样前固定拒绝条件：中位加速 95% 下界 >1.05、p95 比 ≤1.10、树 RSS p95 比 ≤2、RSS ≤512MiB、CPU ≤350%、零失败；calibration.json + CALIBRATION.md 入库）

> [!IMPORTANT]
> Milestone-2 闸门：主代理核验收益分布与资源峰值证据，重跑完整 `pnpm check:ci`。通过后 pruner 收尾，按路线图集成 main。
>
> 闸门结果（2026-11-12，通过）：交付 HEAD `0dde4fe`（8 文件，含测量消费脚本与校准记录，工作区冻结，主代理 Task-3 范围扩编为唯一 dirty 项）。1224 pass / 0 fail（独立复跑）、typecheck/build/style 全 0；18 项生命周期/终止/边界回归；性能真实收益：oxipng/SVGO 配对中位加速 1.90x（95% CI 1.89–1.91）、Q0 基线 1.20x，树 RSS 峰值 136/205MiB、CPU 40/78%、最大在途 2——全部在拒绝条件内；拒绝条件采样前固定（M4 关闭）；超时作用域限 compress + 非 compress 回归（M1 关闭）；有界终止含进程组消失核验（M2 关闭）；Task-4 限定源码边界闭环（M5 关闭）——**P2 台账全清，计划交付完成**。平台披露：进程组终止依赖 POSIX（Windows 显式拒绝），验证平台 macOS。
