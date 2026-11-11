---
date: 2026-11-11
state: v3 修正稿（待 fresh FULL 重审，Human 两项裁决已落）
dispatch: R1 FAIL 5F/4M/3m → FULL FAIL 6F/4M/3m；台账 .tmp/p1/strict-major-ledger.md；Human 裁决（2026-11-12）：允许只增扩展 M2 契约 + 基线由主代理创建持有
---

# Wave P1 Token 性能 Plan

## Problem Statement

单次 token build 进程内存在系统性重复计算：main.yaml/base 内容被解析 ≥3 次（`workspace-loader.ts:328,339,400`、`theme-service.ts:232`）；`parseThemeYaml` 每 pass 重复（`theme-pipeline.ts:146`，`theme-service.ts:284/354`，多 parameterGroup 时 N 次）；依赖字典 `collectDependencyDictionary`（`theme-pipeline.ts:72-125`）per-profile 重复调用（`theme-service.ts:265`）且全部 5 个调用点（`core/night/emit.ts:132`、`doctor/resource-validator.ts:54`、`cli/commands/doctor.ts:291`、`benchmarks/design-token/runner.ts:209`）无 memo；`loadResource`（`resolver/resource-loader.ts:76-158`）每次 exists+read+load+validate+交叉依赖，profile 继承致同资源 N 次加载（`profile-resolver.ts:598-601`）；颜色转换无缓存（`color-space.ts:23`、`theme-transformer.ts:209,307`）；`--profiles all` 仅共享 baseDocument/baseDayTree（`theme-service.ts:243-385`）。

## Solution

以「进程内 memo + 冻结的缓存上下文政策（v3）」消除重复：完整上下文轴 key + 成功才缓存 + 顶层操作作用域 + 容量上限 + 计数器归因；base 解析中与 profile 无关的产物单次共享（分组 pass 保留 per-profile）；颜色转换仅成功结果按值 memo。**等价优先**：基线由主代理在开工前以固定命令创建并持有（不可变副本 + 全输入/输出 SHA256 manifest + dirty 断言），统计合同建立在**增量扩展后的 M2 契约**（p50 + 配对样本 + memo 归因字段，只增不改）之上，三段式判定无死区，真实 Orca 全 profile canary 验证。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。

| 角色 | Rex block | Agent | 职责 |
| --- | --- | --- | --- |
| STRICT | `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480` | Codex GPT-6.1-Sol (max) | v3 修正稿 fresh FULL 重审（通过后 strict 不进入施工期） |
| CODER-PLUS | `block:01a1c843-56aa-7330-ab49-085f434e9c99` | Codex GPT-6.1-Sol (high) | Milestone 施工（派遣前 /clear 并校准 high） |

- 派遣/回读/fresh/通知规则与 Q0 SPEC「Rex 对话协议」一致；施工包 = `split.sh` 切片 + 角色合同副本 + 冻结节/决策授权副本薄壳，gate 在 Milestone 边界由主代理执行。

## User Stories

1. 作为设计师，我希望多 profile 与重复资源场景的构建不重复解析相同内容，以便大批量主题构建更快。
2. 作为项目维护者，我希望每项优化先以不可变基线证明输出等价，再按无死区统计合同证明收益，以便性能机制不引入行为漂移。
3. 作为后续计划（C2）的执行者，我希望解析与缓存的语义边界清晰，以便服务下沉时不与缓存层冲突。

## Constraints

- 输出内容不变：单 profile、`--profiles all`、Night 三种场景产物与基线副本字节级一致。
- 不引入持久缓存与跨进程缓存；缓存实例作用域 = 顶层操作（见冻结政策第 3 条）。
- 缓存 key 必须包含「缓存与基线政策（冻结）」第 1–2 条枚举的全部上下文轴。
- 不改变解析语义与错误行为：报错路径、时机、消息、消息内 tokenPath 归属不变。
- 写边界：`src/core/pipeline/*`、`src/core/resolver/*` 只读路径、`src/core/transformer/*` 颜色转换、`benchmarks/design-token/*` 新增 case、`benchmarks/shared/types.ts`（**仅增量扩展**：p50、配对样本、memo 归因字段，只增不改既有——Human 裁决 2026-11-12）、`tests/p1-*.test.ts`。不改 CLI 层、不改 Night 规则语义。
- 优化机制不满足统计合同判定即撤回。

## Implementation Decisions

1. 只读资源缓存层：`loadResource` 进程内 memo，key 与错误政策按冻结节第 1–2 条；readOnly 既有路径语义不变，memo 叠加其上。
2. 依赖字典 memo：`collectDependencyDictionary` 按冻结节缓存（完全成功才缓存、返回冻结快照）；全部 5 个调用点消费同一缓存**实现**，缓存**实例**按顶层操作创建（决策 3 的作用域条款），API 签名不变。
3. base 解析单次化（收窄版）：循环外仅提升与 profile 无关的产物——base 文档解析、tokenContent、**仅被 base 引用的只读资源集**；分组 pass 保留 per-profile 构建；profile 追加资源一律 per-profile 加载，多 profile 引用完整性有 fixture 验收（R1 FULL M-1）。
4. 同文档解析消除：`parseThemeYaml` 按（来源 + 内容指纹）memo，仅缓存成功解析。
5. 颜色转换 memo：仅缓存成功结果（输入值 + 目标空间）；错误不缓存，tokenPath 逐次归属。
6. 归因计数器（冻结节第 5 条）：每 memo 层独立暴露 `{ layer, hits, misses }`，经 M2 契约新增归因字段进 case 结果；各层可独立停用（构造参数），支撑逐层回滚验收（R1 FULL F-6）。
7. 撤回机制：不满足统计合同三段判定任一撤回条件的机制，由主代理 gate 后逐层撤回并记录；回滚点 = 各 memo 层独立提交。

## Testing Decisions

- 等价性优先：三场景 post 产物 vs 主代理持有的不可变基线副本字节对照，先于一切性能结论。
- 污染防护：两 profile 同路径不同上下文不互hit；readOnly 缺失↔可写恢复交叉矩阵；非法色双 tokenPath 错误归属；**profile 追加自定义资源的引用完整性 fixture**（R1 FULL M-1）；同文件先 custom 后 palette 的 kind/source 派生不串（R1 FULL F-5）。
- 错误路径：资源缺失、校验失败按原时机与消息报错，缓存存在下不变。
- 真实 Orca：`pnpm build && dist/wave token build -f /Users/teatao/Projects/my-color/orca/main.yaml --profiles all --night --output <绝对目录>`（无占位符，目录由执行方实参给定）退出 0 且与基线 night-pre 副本一致；fixture canary `bun test tests/profile-orca-canary.test.ts`。
- 性能证据：按统计合同（冻结节第 6 条）配对采样 ≥30，p50 + p95 双指标三段判定；memo 归因计数器随 case 结果输出；容量上限行为有测试。
- 质量门：`pnpm check:ci` 不退化；`bench --mode default` 等价断言通过。

## Out of Scope

- 不引入持久缓存、跨进程缓存或守护进程。
- 不改输出格式、引用解析语义、DTCG 类型合同。
- 不改 CLI 层参数与行为；不做 profile 间并行构建。
- 不修改 Night 色彩规则与 doctor 校验合同。
- Q0 M2 契约**只增不改**：既有字段/案例语义零变更（Human 裁决边界）。

## 缓存与基线政策（冻结，v3）

1. **缓存上下文轴（key 必含）**：规范化绝对路径；资源 kind 与 source 角色（custom / palette / builtin × cache / user，防止同文件不同派生串用——FULL F-5）；readOnly 标志；资源状态/缓存环境指纹；声明顺序与重复语义版本；解析上下文指纹。**错误结果一律不进缓存。**
2. **颜色 memo 特例**：仅缓存成功转换，key = 输入值 + 目标空间；错误不缓存，tokenPath 逐次归属。
3. **作用域与生命周期**：缓存**实例**按顶层操作创建——每 CLI 命令调用、每 doctor 执行、每 runner case 各自独立实例，跨顶层操作不复用；同实例内同路径文件内容视为不变（实例内前提）。5 个调用点共享的是缓存**实现**，不是跨操作的缓存状态（消解 FULL F-4 的表述矛盾）。实例容量上限：每层 1024 条，超限后该层降级为直读（degrade to no-cache）并计数记录（FULL M-4）。
4. **不可变基线证据（主代理创建并持有——Human 裁决）**：M1 派遣前由主代理执行固定命令并落盘 `docs/island/plans/2026-11-11-p1-baseline/`：
   - `single-pre/`：`dist/wave token build -f tests/fixtures/themes/standard/main.yaml --output docs/island/plans/2026-11-11-p1-baseline/single-pre`
   - `multi-pre/`：`dist/wave token build -f /Users/teatao/Projects/my-color/orca/main.yaml --profiles all --output docs/island/plans/2026-11-11-p1-baseline/multi-pre`
   - `night-pre/`：`dist/wave token build -f /Users/teatao/Projects/my-color/orca/main.yaml --profiles all --night --output docs/island/plans/2026-11-11-p1-baseline/night-pre`
   - `manifest.json`：`{ head, gitDirty: false 断言, commands[]（上述三条实参命令）, env: { runtime, bun, node, platform, arch, cpuCount, memoryBytes, lockfileHash, orcaInputHash }, files: [{ path, sha256, role: 'input' | 'output' }] }`——input 含 fixture 与 orca 输入树全量哈希；副本与 manifest 随本计划分支提交，存续期内禁止重生成（R1 FULL F-3）。
   - 报告文件名模式：`reports/p1-<场景>-<runId>.json`（FULL m-2）。
5. **归因计数器合同**：每 memo 层输出 `{ layer: 'resource' | 'dict' | 'parse' | 'color', hits, misses }`；随 case 结果经 M2 契约新增字段输出，与 case id 关联；各层可经构造参数独立停用，逐层回滚验收 = 停用单层后等价复验 + 分布复测（R1 FULL F-6）。
6. **统计合同（三段判定，无死区）**：基于增量扩展后的契约（p50Ms、配对样本数组、归因字段——只增）；配对采样（同 case 基线副本运行 vs post 运行成对）≥30 样本；指标 p50 与 p95 双报。判定：**保留** = p50 改善 ≥5% 且 p95 回退 ≤2%；**观察保留** = 2% ≤ p50 改善 <5% 且 p95 回退 ≤2%（保留并在 M2 闸门记录分布，不撤回不升级）；**撤回** = p95 回退 >2%，或 p50 改善 <2%。每一结果组合恰好落入一段，无未定义区域（FULL F-1）。
7. **契约扩展边界**：`benchmarks/shared/types.ts` 允许新增类型/字段（p50Ms、配对样本、归因、环境扩展：bun/node 版本、lockfileHash、orcaInputHash——FULL M-3），既有字段与案例语义零变更；Task-4 固定命令为默认全量套件 `bun benchmarks/run.ts --run-id p1-eval --results-dir docs/island/plans/2026-11-11-p1-baseline/reports`，`p1-*` case 经 `cases.ts` 追加并纳入默认套件 include（FULL F-2）。

## Draft Plan

- 结构总览：`resolver/resource-loader.ts` memo 层（决策 1）；`theme-pipeline.ts` 字典 memo（决策 2）；`theme-service.ts` base 产物提升收窄版（决策 3）与解析 memo（决策 4）；`transformer/color-space.ts` 成功 memo（决策 5）；归因计数器贯穿各层（决策 6）；`benchmarks/shared/types.ts` 增量扩展 + `cases.ts` 追加 `p1-*` case（冻结节第 6–7 条）。
- 关键契约：memo key 轴与计数器形状（冻结节第 1/5 条）以类型定义共享于 `src/core/pipeline/`；M2 契约扩展只增不改；各调用方 API 签名不变。
- 文件结构：`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`src/core/pipeline/theme-service.ts`、`src/core/pipeline/pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts`、`benchmarks/shared/types.ts`（只增）、`benchmarks/design-token/cases.ts`、`tests/p1-cache-policy.test.ts`、`tests/p1-equivalence.test.ts`、`tests/p1-statistics.test.ts`、`docs/island/plans/2026-11-11-p1-baseline/`（主代理创建：三场景副本 + manifest + reports/）。
- 风险与未决：memo 与 readOnly 子路径叠加顺序需保持既有 cachePath 行为；`p1-*` case 运行时长需实测控制（计入统计合同采样设计）。无阻塞拆分的未决项。
- 里程碑草案：M1 只读缓存与字典 memo（污染防护 + 等价 + canary）；M2 解析消除与颜色 memo（+ bench case 扩展与统计结论）。

## Implement Plan

worktree `p1-token-performance`（已 rebase 到 main `3f14015`）。**基线由主代理在 M1 派遣前创建并持有**（冻结节第 4 条命令），施工方只读消费。顺序：M1（Task-1 memo 实现 + 逐轴锁定，Task-2 等价/污染/canary 验证）→ M1 闸门 → M2（Task-3 解析消除与颜色 memo，Task-4 契约扩展 + bench case + 统计结论）→ M2 闸门 → pruner → 集成。v3 通过 fresh FULL 后冻结；strict 不进施工期；gate 为 Milestone 粒度、主代理全程；一次派遣一个 Milestone 切片 + 合同副本 + 冻结节副本薄壳。

## Milestone-1

只读缓存与依赖字典 memo

- 验证主题：缓存政策按冻结节实现且无污染；三场景 post 产物与基线副本字节一致；错误路径归属正确；真实 Orca canary 不退化。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/p1-cache-policy.test.ts tests/p1-equivalence.test.ts`；`bun test tests/profile-orca-canary.test.ts`；真实 Orca 命令（Testing Decisions 实参形式）退出 0；等价对照报告写入 `docs/island/plans/2026-11-11-p1-baseline/reports/`（命名模式见冻结节第 4 条）。
- 来源：User Stories 1–2；Implementation Decisions 1–2、6；Testing Decisions 1–4；冻结节全部。

### Task-1

memo 实现（来源：User Story 1；冻结节第 1–3、5 条；Implementation Decisions 1–2、6）

- 验收标准：`loadResource` 与 `collectDependencyDictionary` memo 按冻结 key 轴实现（含 kind/source 角色轴）；5 个调用点消费同一实现、实例按顶层操作创建；仅完全成功结果入缓存且返回冻结快照；容量上限 1024/层 + 降级计数；归因计数器 `{layer, hits, misses}` 就位；缓存上下文轴逐轴测试锁定；**基线由主代理提供，施工方只读消费并核对 manifest 完整性**。
- 可动文件范围：`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`tests/p1-cache-policy.test.ts`。
- 依赖：主代理已完成不可变基线（Task-1 开工前置事实）。
- 固有风险：上下文轴遗漏即污染通道（逐轴测试是主防线）；readOnly 叠加顺序破坏既有 cachePath 行为。

- [ ] memo 层实现（含容量降级与计数器）。
- [ ] 逐轴锁定与污染矩阵测试。

### Task-2

等价与污染防护验证（来源：User Story 2；Testing Decisions 1–4）

- 验收标准：三场景 post 产物与基线副本字节一致；readOnly 缺失↔可写恢复交叉矩阵不互hit；非法色双 tokenPath 归属正确；同文件 custom→palette 的 kind/source 派生不串；profile 追加自定义资源引用完整（fixture）；资源缺失/校验失败路径不变；真实 Orca canary 通过。
- 可动文件范围：`tests/p1-equivalence.test.ts`、必要 fixture。
- 依赖：Task-1。
- 固有风险：等价差异必须停机归因，不得调整断言。

- [ ] 三场景字节对照 + 污染矩阵 + 双路径错误 + 追加资源 fixture 测试。
- [ ] 真实 Orca 全 profile canary（实参命令）。

> [!IMPORTANT]
> Milestone-1 闸门：主代理复核等价证据与污染防护，任一未过不得进入 M2。

## Milestone-2

解析消除与统计结论

- 验证主题：base 无关产物单次共享、分组 pass per-profile 正确、解析消除与颜色成功 memo；M2 契约只增扩展落地；`p1-*` case 纳入默认套件并按统计合同得出三段判定结论。
- 核验基线（固定命令）：M1 基线复验；`bun benchmarks/run.ts --run-id p1-eval --results-dir docs/island/plans/2026-11-11-p1-baseline/reports`（默认全量套件含 p1-* case）≥30 配对样本；memo 归因报告；`pnpm check:ci` exit 0。
- 来源：User Stories 1–2；Implementation Decisions 3–5、7；Testing Decisions 5–6；冻结节第 5–7 条。

### Task-3

解析消除与颜色成功 memo（来源：User Story 1；Implementation Decisions 3–5）

- 验收标准：循环外共享仅限 base 无关产物；分组 pass per-profile 构建且多 profile 输出目标逐一正确；`parseThemeYaml` 同内容不重复解析（解析计数可观测）；颜色仅成功 memo；三场景等价复验通过。
- 可动文件范围：`src/core/pipeline/theme-service.ts`、`theme-pipeline.ts`、`pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts`、对应测试。
- 依赖：M1 闸门。
- 固有风险：共享边界判错即输出目标污染（多 profile 输出路径/内容等价测试为主防线）。

- [ ] base 无关产物提升与分组 pass per-profile 保持。
- [ ] 解析 memo 与颜色成功 memo、等价复验。

### Task-4

契约扩展与统计结论（来源：User Story 2；冻结节第 5–7 条；Testing Decision 5）

- 验收标准：`benchmarks/shared/types.ts` 只增扩展（p50Ms、配对样本、归因、环境扩展字段）且有类型回归；`p1-*` case 追加并纳入默认套件；配对采样 ≥30；按统计合同输出三段判定结论与逐层归因证据；不满足保留条件的机制给出撤回建议清单（含逐层回滚验收结果）。
- 可动文件范围：`benchmarks/shared/types.ts`（只增）、`benchmarks/design-token/cases.ts`、`tests/p1-statistics.test.ts`、统计结论记录。
- 依赖：Task-3。
- 固有风险：契约扩展不得破坏 Q0 既有 runner/report 兼容（只增有类型回归主防线）；归因与收益分层度量。

- [ ] 契约只增扩展与 `p1-*` case。
- [ ] 配对采样运行与三段判定结论记录。

> [!IMPORTANT]
> Milestone-2 闸门：主代理核验统计结论与等价复验，重跑完整 `pnpm check:ci`。通过后 pruner 收尾，按路线图集成 main（C2 的前置之一）。
