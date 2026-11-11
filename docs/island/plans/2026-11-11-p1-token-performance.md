---
date: 2026-11-11
state: 草案（STRICT R1 待派遣）
dispatch: ~
---

# Wave P1 Token 性能 Plan

## Problem Statement

单次 token build 进程内存在系统性重复计算：main.yaml/base 内容被解析 ≥3 次（`workspace-loader.ts:328,339,400` 读+load+再序列化，`theme-service.ts:232` 第 3 次 load）；`parseThemeYaml` 每 pass 重复执行（`theme-pipeline.ts:146`，调用点 `theme-service.ts:284/354`，多 parameterGroup 时同内容解析 N 次，`theme-pipeline.ts:333`）；依赖字典 `collectDependencyDictionary`（`theme-pipeline.ts:72-125`）在 per-profile 循环内重复调用（`theme-service.ts:265`）且 5 个调用点（含 `core/night/emit.ts:132`、`doctor/resource-validator.ts:54`、`cli/commands/doctor.ts:291`、`benchmarks/design-token/runner.ts:209`）全部无 memo；`loadResource`（`resolver/resource-loader.ts:76-158`）每次执行 exists+read+load+validate+交叉依赖检查，profile 继承 base resources 导致 N profile 重复加载同一资源 N 次（`profile-resolver.ts:598-601`）；颜色转换无缓存（`color-space.ts:23`，`theme-transformer.ts:209,307` 每 token 调用）。`--profiles all` 循环（`theme-service.ts:243-385`）仅共享 baseDocument/baseDayTree，其余全部逐 profile 重做。Q0 前的测量缺口（runner 复刻管线未测整链、无 Night-only 场景）已由 Q0 M2 观测基座承接。

## Solution

以「进程内 memo + 缓存上下文指纹」消除重复：`loadResource` 与依赖字典进程内缓存（key 含规范化路径与影响结果的配置/状态指纹，防 profile 污染）、base workspace 解析结果循环外单次共享、同文档重复解析消除、颜色转换按值 memo。**等价优先**：每步优化先证明输出字节级一致，再以 Q0 M2 token 域基线比较性能分布，真实 Orca 全 profile canary 验证。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。

| 角色 | Rex block | Agent | 职责 |
| --- | --- | --- | --- |
| STRICT | `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480` | Codex GPT-6.1-Sol (max) | SPEC 审查（通过后 strict 不进入施工期） |
| CODER-PLUS | `block:01a1c843-56aa-7330-ab49-085f434e9c99` | Codex GPT-6.1-Sol (high) | Milestone 施工 |

- 派遣/回读/fresh/通知规则与 Q0 SPEC「Rex 对话协议」一致；施工包 = `split.sh` 切片 + 角色合同副本薄壳，gate 在 Milestone 边界由主代理执行。

## User Stories

1. 作为设计师，我希望多 profile 与重复资源场景的构建不重复解析相同内容，以便大批量主题构建更快。
2. 作为项目维护者，我希望每项优化先证明输出等价再证明性能收益，以便性能机制不引入行为漂移。
3. 作为后续计划（C2/P1 的消费方），我希望解析与缓存的语义边界清晰，以便服务下沉时不与缓存层冲突。

## Constraints

- 输出内容不变：单 profile、`--profiles all`、Night 三种场景的产物与优化前字节级一致。
- 不引入持久缓存与跨进程缓存；进程内缓存生命周期 = 单次命令执行。
- 缓存 key 必须包含影响解析结果的配置与路径（路线图 Decision 5：防 profile 污染）——不同解析上下文不得共享缓存条目。
- 不改变解析语义与错误行为：资源缺失/校验失败的报错路径、时机、消息不变（缓存命中不得绕过校验合同）。
- 写边界：`src/core/pipeline/*`、`src/core/resolver/*` 只读路径、`src/core/transformer/*` 的颜色转换、`benchmarks/design-token/*` 新增 case。不改 CLI 层、不改 Night 规则语义（`core/night/emit.ts` 的调用点收益来自共享字典层，不修改 Night 实现文件——若需 import 级接入，仅限调用参数传递）。
- 优化机制若无实测收益则撤回（路线图 Testing Decision）。

## Implementation Decisions

1. 只读资源缓存层：`loadResource` 增加进程内 memo——key = 规范化绝对路径 + 读取状态指纹；解析上下文（校验合同等影响结果的输入）纳入缓存上下文，上下文不同即 miss；readOnly 既有缓存路径语义不变，memo 层叠加其上。
2. 依赖字典 memo：`collectDependencyDictionary` 结果按（workspace 入口 + 资源集指纹）缓存；`theme-service` per-profile 循环、`night/emit`、`doctor` 三个调用点共享同一实现，不改各调用方语义。
3. base 解析单次化：`theme-service` 的 `--profiles all` 循环将 base 文档、tokenContent、main 分组 pass 提升到循环外单次构建，profile 仅消费（现状仅共享 baseDocument/baseDayTree，扩展到全部 base 级产物）。
4. 同文档解析消除：`parseThemeYaml` 按（来源 + 内容指纹）memo，pass/parameterGroup 重复解析同一内容时复用。
5. 颜色转换 memo：`convertColorSpace` 按（输入值 + 目标空间）memo；纯函数性质使其无污染风险。
6. 缓存失效语义：进程内缓存无 TTL；文件内容变化在单次进程内不重读（既有行为即如此——同一进程两次 build 不存在；进程内一次 build 中同一文件被外部修改不可观测），缓存安全前提记录于实现注释。
7. 撤回机制：任一 memo 若在收益分布中无统计意义收益，撤回该层并记录。

## Testing Decisions

- 等价性优先：每个 Milestone 先产出输出等价证据（单 profile / `--profiles all` / Night 三场景，产物字节对照），再谈性能。
- 污染防护：构造两 profile 同路径不同配置上下文的用例，断言缓存不跨上下文命中。
- 错误路径：资源缺失、校验失败在缓存存在下仍按原时机与消息报错。
- 真实 Orca：全 profile canary（`--profiles all` + `--night`、mktemp 隔离）通过，与 Q0 交付基线输出一致。
- 性能证据：Q0 M2 token 域 runner（多 profile 场景）为比较对象，输出收益分布（p50/p95），不只单样本。
- 质量门：`pnpm check:ci` 不退化；bench 等价检查（`--mode default` 自带等价断言）通过。

## Out of Scope

- 不引入持久缓存、跨进程缓存或守护进程。
- 不改输出格式、引用解析语义、DTCG 类型合同（C3/Q0 范围）。
- 不改 CLI 层参数与行为；不做并行构建（profile 间并行属未测收益的新机制，本计划只消除串行重复）。
- 不修改 Night 色彩规则与 doctor 校验合同（其调用点收益来自共享层）。
- 不重写 benchmarks 契约（Q0 M2 产物）；仅按其契约新增 case。

## Draft Plan

- 结构总览：`resolver/resource-loader.ts` 加 memo 层（第 1 条）；`theme-pipeline.ts` 字典构建 memo（第 2 条）；`theme-service.ts` base 产物提升（第 3 条）与解析 memo 接入（第 4 条）；`transformer/color-space.ts` 值 memo（第 5 条）；`benchmarks/design-token/cases.ts` 新增整链与 Night-only case（消费 M2 契约）。
- 关键契约：memo key 结构（路径 + 状态指纹 + 上下文指纹）是防污染核心，作为类型定义在 pipeline 内共享；各调用方 API 签名不变。
- 文件结构：`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`src/core/pipeline/theme-service.ts`、`src/core/pipeline/pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts`、`benchmarks/design-token/cases.ts`、新增污染防护/等价/错误路径测试（`tests/` 对应域文件）。
- 风险与未决：缓存上下文指纹的构成（哪些配置影响解析结果）需在实现时逐一枚举并测试锁定；`loadResource` 的 readOnly 子路径与 memo 的叠加顺序需保证既有 cachePath 行为不变；等价对照的基线产物需在优化前固定（先取基线再动代码，顺序由施工保证）。无阻塞拆分的未决项。
- 里程碑草案：M1 只读缓存与字典 memo（污染防护 + 等价 + canary）；M2 解析消除与颜色 memo（+ bench case 扩展与收益分布）。

## Implement Plan

worktree `p1-token-performance` 已建（基点 b245c71），SPEC 与施工均在分支交付，开工前 rebase 到 Q0 已集成的 main 并 `mise install && pnpm install`。**基线先行**：M1 开工第一步先在未修改的 main 基点固定三场景基线产物与 Q0 M2 runner 基线分布（优化前取证）。顺序：M1（Task-1 资源/字典 memo + 污染防护，Task-2 等价与 canary）→ M1 闸门 → M2（Task-3 解析消除与颜色 memo，Task-4 bench case 与收益分布）→ M2 闸门 → pruner → 集成。SPEC 通过 STRICT 审查后冻结；strict 不进施工期；gate 为 Milestone 粒度、主代理全程；一次派遣一个 Milestone 切片 + 合同副本薄壳。

## Milestone-1

只读缓存与依赖字典 memo

- 验证主题：缓存层等价且无 profile 污染；错误路径语义不变；真实 Orca canary 不退化。
- 核验基线：三场景输出等价对照；污染防护与错误路径测试；`pnpm check:ci`；真实 Orca canary；Q0 M2 token runner 可运行。
- 来源：User Stories 1–2；Implementation Decisions 1–2、6；Testing Decisions 1–4。

### Task-1

memo 层实现（来源：User Story 1；Implementation Decisions 1–2、6）

- 验收标准：`loadResource` 与 `collectDependencyDictionary` 进程内 memo 生效，key 含路径 + 状态指纹 + 解析上下文指纹；5 个调用点共享且 API 签名不变；缓存上下文构成有测试锁定。
- 可动文件范围：`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、memo 单元测试。
- 依赖：Q0 已集成 main；基线产物已固定。
- 固有风险：上下文指纹遗漏导致跨上下文错误命中（污染）；readOnly 子路径叠加顺序破坏既有 cachePath 行为。

- [ ] 固定基线产物与 runner 基线分布（优化前）。
- [ ] memo 层实现与上下文指纹测试锁定。

### Task-2

等价与污染防护验证（来源：User Story 2；Testing Decisions 1–4）

- 验收标准：单 profile / `--profiles all` / Night 三场景产物与基线字节级一致；两 profile 同路径不同上下文不互相命中；资源缺失/校验失败路径与消息不变；真实 Orca canary 通过。
- 可动文件范围：等价与污染防护测试文件、必要的测试 fixture。
- 依赖：Task-1。
- 固有风险：等价对照若发现差异必须停机归因（缓存 bug 或基线取证缺陷），不得以调整断言掩盖。

- [ ] 三场景等价对照与污染防护、错误路径测试。
- [ ] 真实 Orca 全 profile canary。

> [!IMPORTANT]
> Milestone-1 闸门：主代理复核等价证据与污染防护测试，任一未过不得进入 M2。

## Milestone-2

解析消除与收益分布

- 验证主题：base 产物循环外单次构建；同文档重复解析消除；颜色值 memo；新增 bench case 落地并产出收益分布。
- 核验基线：三场景等价复验；Q0 M2 token runner（多 profile）收益分布（p50/p95）；`pnpm check:ci`；bench 等价断言。
- 来源：User Stories 1–2；Implementation Decisions 3–5、7；Testing Decisions 5–6。

### Task-3

解析消除与颜色 memo（来源：User Story 1；Implementation Decisions 3–5）

- 验收标准：`--profiles all` 循环中 base 级产物（文档/tokenContent/main 分组 pass）单次构建；`parseThemeYaml` 同内容不重复解析（多 parameterGroup 场景断言解析次数）；颜色转换按值命中；三场景等价复验通过。
- 可动文件范围：`src/core/pipeline/theme-service.ts`、`theme-pipeline.ts`、`pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts`、对应测试。
- 依赖：M1 闸门。
- 固有风险：分组 pass 与 profile 的组合矩阵下共享产物的正确性（共享过度 = profile 污染，共享不足 = 无收益）；解析次数断言需可观测手段。

- [ ] base 产物提升与解析 memo。
- [ ] 颜色转换 memo 与等价复验。

### Task-4

bench case 扩展与收益分布（来源：User Story 2；Testing Decision 5；Implementation Decision 7）

- 验收标准：按 M2 契约新增整链（generateTheme 入口）与 Night-only case；优化前后收益分布（p50/p95）记录；无收益 memo 撤回并记录；`bench` 等价断言通过。
- 可动文件范围：`benchmarks/design-token/cases.ts`、收益记录文档（本计划目录内）。
- 依赖：Task-3。
- 固有风险：新增 case 不得修改 Q0 M2 契约类型；收益归因需与 M1 memo 层分开度量。

- [ ] 新增 case 与前后对比运行。
- [ ] 收益分布记录与撤回裁决。

> [!IMPORTANT]
> Milestone-2 闸门：主代理核验收益分布与等价复验，重跑完整 `pnpm check:ci`。通过后 pruner 收尾，按路线图集成 main（C2 的前置之一）。
