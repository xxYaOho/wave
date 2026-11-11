---
date: 2026-11-11
state: R1 修正稿（待 fresh FULL 重审）
dispatch: R1 FAIL 5F/4M/3m（台账 .tmp/p1/strict-major-ledger.md）；Human 裁决：Q0 M2 集成后一次修正 + fresh FULL（2026-11-11）
---

# Wave P1 Token 性能 Plan

## Problem Statement

单次 token build 进程内存在系统性重复计算：main.yaml/base 内容被解析 ≥3 次（`workspace-loader.ts:328,339,400` 读+load+再序列化，`theme-service.ts:232` 第 3 次 load）；`parseThemeYaml` 每 pass 重复执行（`theme-pipeline.ts:146`，调用点 `theme-service.ts:284/354`，多 parameterGroup 时同内容解析 N 次，`theme-pipeline.ts:333`）；依赖字典 `collectDependencyDictionary`（`theme-pipeline.ts:72-125`）在 per-profile 循环内重复调用（`theme-service.ts:265`）且全部 5 个调用点（含 `core/night/emit.ts:132`、`doctor/resource-validator.ts:54`、`cli/commands/doctor.ts:291`、`benchmarks/design-token/runner.ts:209`）无 memo；`loadResource`（`resolver/resource-loader.ts:76-158`）每次执行 exists+read+load+validate+交叉依赖检查，profile 继承 base resources 导致 N profile 重复加载同一资源 N 次（`profile-resolver.ts:598-601`）；颜色转换无缓存（`color-space.ts:23`，`theme-transformer.ts:209,307` 每 token 调用）。`--profiles all` 循环（`theme-service.ts:243-385`）仅共享 baseDocument/baseDayTree，其余全部逐 profile 重做。

## Solution

以「进程内 memo + 冻结的缓存上下文政策」消除重复：`loadResource` 与依赖字典进程内缓存（完整缓存上下文 key + 成功才缓存错误不缓存）、base workspace 中与 profile 无关的解析产物单次共享（分组 pass 保留 per-profile）、同文档重复解析消除、颜色转换成功结果按值 memo。**等价优先**：每步优化先以不可变基线证据证明输出字节级一致，再以 Q0 M2 token 域基线按冻结的统计合同比较收益，真实 Orca 全 profile canary 验证。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。

| 角色 | Rex block | Agent | 职责 |
| --- | --- | --- | --- |
| STRICT | `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480` | Codex GPT-6.1-Sol (max) | 本修正稿 fresh FULL 重审（通过后 strict 不进入施工期） |
| CODER-PLUS | `block:01a1c843-56aa-7330-ab49-085f434e9c99` | Codex GPT-6.1-Sol (high) | Milestone 施工（派遣前 /clear 并校准 high） |

- 派遣/回读/fresh/通知规则与 Q0 SPEC「Rex 对话协议」一致；施工包 = `split.sh` 切片 + 角色合同副本薄壳，gate 在 Milestone 边界由主代理执行。

## User Stories

1. 作为设计师，我希望多 profile 与重复资源场景的构建不重复解析相同内容，以便大批量主题构建更快。
2. 作为项目维护者，我希望每项优化先证明输出等价再证明性能收益，以便性能机制不引入行为漂移。
3. 作为后续计划（C2）的执行者，我希望解析与缓存的语义边界清晰，以便服务下沉时不与缓存层冲突。

## Constraints

- 输出内容不变：单 profile、`--profiles all`、Night 三种场景的产物与优化前字节级一致。
- 不引入持久缓存与跨进程缓存；进程内缓存生命周期 = 单次命令执行（见缓存政策第 6 条）。
- 缓存 key 必须包含「缓存与基线政策（冻结）」节枚举的全部上下文轴（路线图 Decision 5）。
- 不改变解析语义与错误行为：资源缺失/校验失败的报错路径、时机、消息、错误消息中的 tokenPath 归属不变。
- 写边界：`src/core/pipeline/*`、`src/core/resolver/*` 只读路径、`src/core/transformer/*` 的颜色转换、`benchmarks/design-token/*` 新增 case、`tests/p1-*.test.ts`。不改 CLI 层、不改 Night 规则语义（`core/night/emit.ts` 仅限调用参数传递级接入）。
- 优化机制若不满足统计合同（见冻结节）则撤回。

## Implementation Decisions

1. 只读资源缓存层：`loadResource` 增加进程内 memo，key 与错误政策按「缓存与基线政策（冻结）」执行；readOnly 既有缓存路径语义不变，memo 层叠加其上。
2. 依赖字典 memo：`collectDependencyDictionary` 结果按冻结政策缓存；全部 5 个调用点（`theme-service` per-profile 循环、`night/emit`、`doctor/resource-validator`、`cli/commands/doctor`、`benchmarks/design-token/runner`）共享同一实现，各调用方 API 签名不变。
3. base 解析单次化（收窄后）：`theme-service` 的 `--profiles all` 循环仅提升**与 profile 无关**的产物到循环外单次构建——base 文档解析、tokenContent、base 级只读资源集；**分组 pass（buildGroupPasses 产物）保留 per-profile 构建**，因 parameter/parameterGroup 属 profile 有效配置，跨 profile 共享会造成输出目标污染（R1 F-3）。
4. 同文档解析消除：`parseThemeYaml` 按（来源 + 内容指纹）memo，pass/parameterGroup 重复解析同一内容时复用；memo 仅缓存成功解析。
5. 颜色转换 memo：`convertColorSpace` **仅缓存成功结果**（输入值 + 目标空间为 key）；错误结果一律不缓存（错误消息内嵌 tokenPath，缓存会把首次出现的路径泄漏给后续路径——R1 F-1），保证错误路径归属逐 token 正确。
6. 缓存生命周期与可观测变化前提：缓存生命周期 = 单次命令执行；同一进程内的重复调用（doctor 多轮检查、service 多次构建、runner 多 case）共享缓存的前提是「同命令执行内同路径文件内容不变」，该前提与其边界记录于实现注释；`loadResource` 既有每次 exists/read/parse 行为在缓存 miss 时保持（R1 M-2）。
7. 撤回机制：任一 memo 不满足统计合同（冻结节）即撤回该层并记录；撤回操作由主代理在 gate 后执行，施工方在交付报告中给出建议。

## Testing Decisions

- 等价性优先：每个 Milestone 先产出输出等价证据（单 profile / `--profiles all` / Night 三场景，post 产物 vs 不可变基线副本字节对照），再谈性能。
- 污染防护：两 profile 同路径不同上下文不互相命中；readOnly 缺失错误与可写恢复的交叉矩阵（R1 F-2）；非法颜色先后出现在两个不同 tokenPath，断言两次错误消息各自归属正确路径（R1 F-1）。
- 错误路径：资源缺失、校验失败在缓存存在下仍按原时机与消息报错。
- 真实 Orca：固定命令 `pnpm build && dist/wave token build -f ~/Projects/my-color/orca/main.yaml --profiles all --night --output <mktemp 目录>`，退出码 0 且与 Q0 交付基线输出一致；fixture canary `bun test tests/profile-orca-canary.test.ts` 通过。
- 性能证据：Q0 M2 token 域 runner（多 profile 场景）为比较对象，按冻结统计合同输出配对分布与保留/撤回结论；memo 命中/未命中计数器提供归因证据（R1 M-3）。
- 质量门：`pnpm check:ci` 不退化；`bench --mode default` 等价断言通过。

## Out of Scope

- 不引入持久缓存、跨进程缓存或守护进程。
- 不改输出格式、引用解析语义、DTCG 类型合同。
- 不改 CLI 层参数与行为；不做并行构建（profile 间并行属未测收益的新机制，本计划只消除串行重复）。
- 不修改 Night 色彩规则与 doctor 校验合同（其调用点收益来自共享层）。
- 不修改 Q0 M2 契约类型（`benchmarks/shared/types.ts`）；仅按其契约新增 case（新增 case 允许，修改/删除既有 case 不允许——路线图契约扩展裁决）。

## 缓存与基线政策（冻结）

1. **缓存上下文轴（key 必含，缺一即 miss）**：规范化绝对路径；readOnly 标志；资源状态/缓存环境指纹（含读取时 exists/read 的状态组合）；声明顺序与重复声明语义（同资源多次声明的合并规则版本）；解析上下文指纹（影响校验结果的配置集）。错误结果一律不进缓存。
2. **颜色 memo 特例**：仅缓存成功转换；key = 输入值 + 目标空间；错误（含非法值）不缓存，错误消息 tokenPath 逐次归属。
3. **生命周期**：单次命令执行；不跨进程、不跨命令。
4. **不可变基线证据**：M1 Task-1 在任何代码修改前固定基线——产物复制到只读副本目录 + 记录全部产物 SHA256 清单 + HEAD + 完整命令行 + 环境元数据（runtime/platform/cpu），以 JSON 记录入库本计划目录；等价判定 = post 产物与该不可变副本字节对照；基线副本在计划存续期内不得重新生成（R1 F-4）。
5. **统计合同**：配对比较（同 case 优化前后成对采样）；样本 ≥30（通过 runner `--iterations` 与重复运行达成）；指标同时含 p50 与 p95；**保留条件：p50 改善 ≥5% 且 p95 回退 ≤2%**；**撤回条件：p95 回退 >2%，或 p50 改善 <5% 且 p95 回退 >0**；归因证据 = memo 命中/未命中计数器；撤回责任方 = 主代理（gate 后执行），回滚点 = 各 memo 层独立提交（R1 F-5）。
6. **契约扩展边界**：`benchmarks/shared/types.ts` 只读；新增 case 通过 `cases.ts` 追加，case id 命名 `p1-*` 前缀。

## Draft Plan

- 结构总览：`resolver/resource-loader.ts` 加 memo 层（决策 1）；`theme-pipeline.ts` 字典构建 memo（决策 2）；`theme-service.ts` base 产物提升（决策 3，收窄版）与解析 memo 接入（决策 4）；`transformer/color-space.ts` 成功 memo（决策 5）；`benchmarks/design-token/cases.ts` 新增 `p1-*` case（整链 generateTheme 入口、Night-only）；`tests/p1-cache-policy.test.ts`、`tests/p1-equivalence.test.ts`、`tests/p1-statistics.test.ts`。
- 关键契约：memo key 结构（冻结节第 1–2 条）在 `src/core/pipeline/` 内以类型定义共享；各调用方 API 签名不变；基线证据 JSON 形状见冻结节第 4 条。
- 文件结构：`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`src/core/pipeline/theme-service.ts`、`src/core/pipeline/pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts`、`benchmarks/design-token/cases.ts`、`tests/p1-*.test.ts`（三个新文件）、基线证据目录 `docs/island/plans/2026-11-11-p1-baseline/`（不可变副本 + manifest.json）。
- 风险与未决：memo 层与 readOnly 子路径的叠加顺序需保证既有 cachePath 行为不变；`bench --mode default` 自带等价断言与新增 p1-* case 的运行时长需实测控制。无阻塞拆分的未决项。
- 里程碑草案：M1 只读缓存与字典 memo（污染防护 + 等价 + canary）；M2 解析消除与颜色 memo（+ bench case 扩展与统计结论）。

## Implement Plan

worktree `p1-token-performance`（已 rebase 到集成的 main `3f14015`），SPEC 与施工均在分支交付。**基线先行是 Task-1 第一步且先于任何代码修改**。顺序：M1（Task-1 memo 实现 + 基线固定，Task-2 等价/污染/canary 验证）→ M1 闸门 → M2（Task-3 解析消除与颜色 memo，Task-4 bench case 与统计结论）→ M2 闸门 → pruner → 集成。本修正稿通过 fresh FULL 审查后冻结进入施工；strict 不进施工期；gate 为 Milestone 粒度、主代理全程；一次派遣一个 Milestone 切片 + 合同副本薄壳。

## Milestone-1

只读缓存与依赖字典 memo

- 验证主题：缓存政策按冻结节实现且无污染；三场景输出与不可变基线副本字节一致；错误路径归属正确；真实 Orca canary 不退化。
- 核验基线（固定命令与环境）：`pnpm check:ci` exit 0；`bun test tests/p1-cache-policy.test.ts tests/p1-equivalence.test.ts`；`bun test tests/profile-orca-canary.test.ts`；真实 Orca 命令（见 Testing Decisions）退出 0；结果报告入 `docs/island/plans/2026-11-11-p1-baseline/` 同级 `reports/` 目录。
- 来源：User Stories 1–2；Implementation Decisions 1–2、6；Testing Decisions 1–4；冻结节全部。

### Task-1

基线固定与 memo 实现（来源：User Story 1；冻结节第 1–4 条；Implementation Decisions 1–2、6）

- 验收标准：在任何修改前完成不可变基线（只读副本 + SHA256 清单 + HEAD + 命令 + 环境元数据 manifest）；`loadResource` 与 `collectDependencyDictionary` memo 按冻结 key 轴实现，5 个调用点共享且 API 签名不变；缓存上下文轴有测试逐轴锁定；单次命令执行生命周期前提记录。
- 可动文件范围：`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`tests/p1-cache-policy.test.ts`、`docs/island/plans/2026-11-11-p1-baseline/`。
- 依赖：Q0 已集成 main。
- 固有风险：上下文轴遗漏即污染通道（逐轴测试是主防线）；readOnly 子路径叠加顺序破坏既有 cachePath 行为。

- [ ] 固定不可变基线（副本 + manifest）。
- [ ] memo 层实现与逐轴锁定测试。

### Task-2

等价与污染防护验证（来源：User Story 2；Testing Decisions 1–4）

- 验收标准：三场景 post 产物与不可变副本字节一致；readOnly 缺失↔可写恢复交叉矩阵不互相污染；非法色双 tokenPath 错误归属正确；资源缺失/校验失败路径与消息不变；真实 Orca canary 通过。
- 可动文件范围：`tests/p1-equivalence.test.ts`、必要 fixture。
- 依赖：Task-1。
- 固有风险：等价差异必须停机归因，不得调整断言。

- [ ] 三场景字节对照与污染矩阵、双路径错误测试。
- [ ] 真实 Orca 全 profile canary（固定命令）。

> [!IMPORTANT]
> Milestone-1 闸门：主代理复核等价证据与污染防护，任一未过不得进入 M2。

## Milestone-2

解析消除与统计结论

- 验证主题：base 无关产物单次共享且分组 pass per-profile 正确；解析消除与颜色成功 memo；`p1-*` bench case 落地并按统计合同得出保留/撤回结论。
- 核验基线（固定命令与环境）：M1 全部核验基线复验；`bun benchmarks/run.ts --domain token-multi-profile --iterations <按统计合同>` 配对分布；memo 计数器归因报告；`pnpm check:ci` exit 0。
- 来源：User Stories 1–2；Implementation Decisions 3–5、7；Testing Decisions 5–6；冻结节第 5–6 条。

### Task-3

解析消除与颜色成功 memo（来源：User Story 1；Implementation Decisions 3–5）

- 验收标准：循环外共享仅限 base 无关产物；分组 pass per-profile 构建且多 profile 输出目标逐一正确（R1 F-3 边界）；`parseThemeYaml` 同内容不重复解析（解析计数可观测）；颜色仅成功 memo、错误逐次归属；三场景等价复验通过。
- 可动文件范围：`src/core/pipeline/theme-service.ts`、`theme-pipeline.ts`、`pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts`、对应测试。
- 依赖：M1 闸门。
- 固有风险：共享边界判错即输出目标污染（以多 profile 输出路径/内容等价测试为主防线）。

- [ ] base 无关产物提升与分组 pass per-profile 保持。
- [ ] 解析 memo 与颜色成功 memo、等价复验。

### Task-4

bench case 与统计结论（来源：User Story 2；冻结节第 5–6 条；Testing Decision 5）

- 验收标准：`p1-*` case（整链 + Night-only）按契约追加；配对采样 ≥30 样本；按统计合同输出保留/撤回结论与 memo 归因证据；不满足保留条件的机制给出撤回建议清单。
- 可动文件范围：`benchmarks/design-token/cases.ts`、`tests/p1-statistics.test.ts`、统计结论记录（本计划目录内）。
- 依赖：Task-3。
- 固有风险：新增 case 不得修改 Q0 M2 契约类型；归因与收益需分层度量。

- [ ] `p1-*` case 与配对采样运行。
- [ ] 统计结论与撤回建议记录。

> [!IMPORTANT]
> Milestone-2 闸门：主代理核验统计结论与等价复验，重跑完整 `pnpm check:ci`。通过后 pruner 收尾，按路线图集成 main（C2 的前置之一）。
