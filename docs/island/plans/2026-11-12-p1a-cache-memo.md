---
date: 2026-11-12
state: 待 fresh FULL（P1a 首轮）
dispatch: P1 四轮未收敛（5→6→4→5 FATAL）→ Human 裁决拆分 P1a/P1b（2026-11-12）；本 SPEC 为 P1a（缓存 memo），统计与测量全部移入 P1b
---

# Wave P1a 缓存 Memo Plan

## Problem Statement

单次 token build 进程内重复解析与加载：main.yaml/base 内容解析 ≥3 次（`workspace-loader.ts:328,339,400`、`theme-service.ts:232`）；`parseThemeYaml` 每 pass 重复（`theme-pipeline.ts:146`、`theme-service.ts:284/354`）；依赖字典 5 个调用点无 memo（`theme-service.ts:265` per-profile、`core/night/emit.ts:132`、`doctor/resource-validator.ts:54`、`cli/commands/doctor.ts:291`、`benchmarks/design-token/runner.ts:209`）；`loadResource`（`resolver/resource-loader.ts:76-158`）每次全量校验加载，profile 继承致同资源 N 次加载（`profile-resolver.ts:598-601`）；颜色转换无缓存（`color-space.ts:23`）。`--profiles all` 仅共享 baseDocument/baseDayTree（`theme-service.ts:243-385`）。

## Solution

进程内 memo：`token-cache.ts`（`createTokenCache()`）按顶层操作创建实例并沿四个入口穿线；完整上下文轴 key、成功才缓存、冻结快照、容量降级、逐层计数。验收只含输出等价、污染/错误防护与 canary——**性能统计与测量归 P1b（拆分裁决），本计划不作性能声明**。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480`（max）；CODER-PLUS = `block:01a1c843-56aa-7330-ab49-085f434e9c99`（high，派遣前 /clear 校准）。规则同 Q0 SPEC。

## User Stories

1. 作为设计师，我希望多 profile 与重复资源场景不重复解析相同内容，以便构建更快。
2. 作为项目维护者，我希望每项优化以不可变基线证明输出等价，以便机制不引入行为漂移。

## Constraints

- 输出不变：单 profile、`--profiles all`、Night 三场景产物与基线副本字节一致。
- 无持久/跨进程缓存；缓存实例作用域 = 顶层操作。
- key 含「缓存与 key 政策（冻结）」全部轴；错误不缓存。
- 解析语义与错误行为不变（路径、时机、消息、tokenPath 归属）。
- 写边界：`src/core/pipeline/*`、`src/core/resolver/*` 只读路径、`src/core/transformer/color-space.ts`、`tests/p1a-*.test.ts`。不改 CLI、Night 规则语义、**不触碰 `benchmarks/shared/types.ts`（归 P1b）**。
- 机制如引发不可接受的容量/内存问题（见冻结第 4 条）则撤回。

## Implementation Decisions

1. `src/core/pipeline/token-cache.ts` 导出 `createTokenCache()` 与 `TokenCache`；`loadResource`、`collectDependencyDictionary`、`parseThemeYaml` 增加可选尾参 `cache?`（缺省自建临时实例，既有调用点零改动）；四入口创建并穿线：`theme-service.ts` generateTheme、`night/emit.ts`、doctor 执行入口（`doctor/resource-validator.ts`）、`benchmarks/design-token/runner.ts` case 入口。
2. 颜色通道：`cache` 沿 `theme-pipeline → pass-preparer → theme-transformer → color-space` 调用链显式传参到达 `convertColorSpace`（四层调用链逐一加参，不接受模块级 map——FULL-3 F-3）。
3. 依赖字典 memo：完全成功才缓存；返回冻结快照（`dict`/`data`/`loaded` 冻结，变更抛错）；部分失败 issues 不入缓存（FULL-2 M-2）。
4. `loadResource` 返回 `LoadedResource` 深冻结（嵌套 data 递归冻结），调用方需复制方可变更（FULL-2 M-2）。
5. `parseThemeYaml` 按（来源 + 内容指纹）memo，仅成功解析入缓存。
6. 颜色 memo 仅成功结果（输入值 + 目标空间）；错误不缓存，tokenPath 逐次归属。
7. 容量：每层 1024 条，超限该层降级直读并计数 `{ layer, hits, misses, degraded }`（计数器为实例内部仪表，仅用于撤回裁决证据，不入 M2 契约——归 P1b）。

## Testing Decisions

- 等价性：三场景 post 产物 vs 主代理基线副本（`docs/island/plans/2026-11-11-p1-baseline/`，提交 e9bd325）字节对照。
- 污染矩阵：两 profile 同路径不同上下文；readOnly 缺失↔可写恢复；非法色双 tokenPath；同文件 custom→palette 派生不串；profile 追加自定义资源引用完整。
- 错误路径：资源缺失/校验失败原时机与消息。
- 真实 Orca：`pnpm build && dist/wave token build -f /Users/teatao/Projects/my-color/orca/main.yaml --profiles all --night --output <实参绝对目录>` 退出 0 且与基线 night-pre 一致；fixture canary 通过。
- 质量门：`pnpm check:ci` 不退化（验证 bun 用 mise 固定 1.3.6，`bun test --timeout 15000`）。
- 容量行为：超限降级有测试。

## Out of Scope

- 性能统计、p50/配对样本、归因契约、case 接线、M2 契约扩展（**全部归 P1b**）。
- pre/post 性能样本与收益声明（P1a 不作性能结论；撤回裁决依据等价与容量证据，若容量代价不可接受即撤回）。
- 不改 CLI 层、Night 规则语义、输出格式合同、Q0 M2 契约（完全不动）。

## 缓存与 key 政策（冻结）

1. **key 轴（必含）**：规范化绝对路径；资源 kind ∈ {palette, dimension, custom}；source 角色 ∈ {builtin, cache, user}；readOnly 标志；资源状态指纹（沿用 `readResourceState` 现有字段：mtimeMs + size，读取时点）；声明顺序与重复语义版本；解析上下文指纹（影响校验的配置集）。错误不入缓存（FULL-3 M-1 全域枚举）。
2. **颜色特例**：仅成功结果；key = 输入值 + 目标空间；tokenPath 逐次归属。
3. **作用域**：实例按顶层操作创建（四入口），跨操作不复用；5 调用点共享实现；同实例内同路径内容视为不变。
4. **容量与撤回**：每层 1024 条上限，超限降级直读 + `degraded` 计数；若交付验证显示容量代价不可接受（内存峰值异常），主代理 gate 后逐层撤回（回滚点 = 各层独立提交）。

## Draft Plan

- 文件：`src/core/pipeline/token-cache.ts`（新）、`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`theme-service.ts`、`pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts` 及调用链穿线、`tests/p1a-cache-policy.test.ts`、`tests/p1a-equivalence.test.ts`。
- 风险与未决：颜色穿线经四层调用链的参数透传需逐层核对签名兼容；冻结快照对大资源的复制成本实测观察（不设阈值，异常时升级）。无阻塞未决项。
- 里程碑：单一 Milestone（memo 实现 + 等价/污染/canary 验证）。

## Implement Plan

worktree `p1-token-performance`（已 rebase 到 main；不可变基线已由主代理提交 e9bd325，施工方只读消费并核对 manifest）。顺序：Task-1 memo 实现 + 逐轴锁定 → Task-2 等价/污染/canary → 闸门 → pruner → 集成。本 SPEC 通过 fresh FULL 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

缓存 memo 与等价验证

- 验证主题：缓存按冻结政策实现无污染；三场景与基线副本字节一致；错误路径归属正确；Orca canary 不退化。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/p1a-cache-policy.test.ts tests/p1a-equivalence.test.ts`（mise bun 1.3.6，`--timeout 15000`）；`bun test tests/profile-orca-canary.test.ts`；真实 Orca 实参命令退出 0。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

memo 实现（来源：User Story 1；冻结节 1–4；Decisions 1–7）

- 验收标准：`token-cache.ts` 就位；`loadResource`/`collectDependencyDictionary`/`parseThemeYaml`/`convertColorSpace` 四层 memo 按冻结 key 轴实现（含 kind/source 轴与状态指纹）；颜色通道四层显式传参；冻结快照语义；容量降级 + 计数器；逐轴测试锁定；manifest 完整性核对（施工前）。
- 可动文件范围：`src/core/pipeline/token-cache.ts`（新）、`src/core/resolver/resource-loader.ts`、`src/core/pipeline/theme-pipeline.ts`、`theme-service.ts`、`pass-preparer.ts`（如涉及）、`src/core/transformer/color-space.ts` 及穿线调用链、`tests/p1a-cache-policy.test.ts`。
- 依赖：基线已交付（e9bd325）。
- 固有风险：穿线遗漏某调用链分支 = 该分支无收益（不属错误但需报告）；冻结对调用方变更抛错需与现有消费模式核对。

- [ ] token-cache 实现与四入口穿线（含颜色四层链路）。
- [ ] 逐轴锁定 / 污染矩阵 / 容量降级测试。

### Task-2

等价与防护验证（来源：User Story 2；Testing Decisions 全部）

- 验收标准：三场景与基线副本字节一致；全部污染矩阵通过；错误路径不变；真实 Orca canary 通过；`pnpm check:ci` exit 0。
- 可动文件范围：`tests/p1a-equivalence.test.ts`、必要 fixture。
- 依赖：Task-1。
- 固有风险：等价差异必须停机归因，不得调整断言。

- [ ] 三场景字节对照与全部防护测试。
- [ ] 真实 Orca 全 profile canary（实参命令）。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理复核等价证据与防护测试，通过后 pruner 收尾，按路线图集成 main。性能统计结论由 P1b 在本计划交付后另行建立。
