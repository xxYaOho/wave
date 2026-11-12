---
date: 2026-11-12
state: 待 STRICT FULL（P1b 首轮）
dispatch: P1 拆分裁决（2026-11-12）：统计与测量移入 P1b，在 P1a 交付机制上建立；P1a 已交付集成（main @ f83196c，基线 v2 证据齐备）；pre 样本锚点钉在 pre-memo main tip 432453f
---

# Wave P1b Token 统计与测量 Plan

## Problem Statement

P1a 交付的进程内 memo 仅有等价证明，无性能测量。路线图原则「每个计划只有在相对基线有明确收益且质量门不退化时才保留性能机制」与 Q0 的观测承诺要求实测分布支撑保留/撤回裁决。当前测量面缺口：`BenchmarkStats` 无 p50（判定规则无法落在中位数上）；`benchmarks/compare.ts` 为非配对均值比较（15% 静态阈值），无逐样本配对；memo 的逐层归因（loadResource/dictionary/parse/color 命中证据）无处落盘；默认 `bench` 仅 5 迭代，不可判定。P1a 已并入 main，pre-memo 状态只能在前置提交上重建。

## Solution

在 P1a 交付机制上建立统计与测量：Q0 M2 契约**只增扩展**（p50Ms、配对比较合同、缓存归因 trace、lockfileHash 环境字段）；`generateTheme` 结果只增 `cacheStats` 快照；配对比较实现与 p50 聚合；捕获协议冻结（pre 锚 `432453f`、post 锚交付 HEAD，≥30 迭代，mise bun 1.3.6 全程，主代理持有证据）；产出台账式 `statistics.json` 并按冻结判定规则裁决 memo 保留。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480`（max，派遣前 /clear 校准）；CODER-PLUS = `block:01a1c843-56aa-7330-ab49-085f434e9c99`（high，派遣前 /clear 校准）。规则同 Q0 SPEC。

## User Stories

1. 作为项目维护者，我希望 memo 收益以配对实测分布证明，以便保留/撤回有据可裁。
2. 作为项目维护者，我希望逐层归因落盘，以便后续优化知道重复工作消除发生在哪一层。

## Constraints

- Q0 M2 契约（`benchmarks/shared/types.ts`）**只增扩展**：不修改、不删除既有字段与 union 成员；新增字段全部可选或新增 interface（Human 裁决授权）。
- 不改生产 `src/**` 行为语义；唯一生产接触点 = `generateTheme` 结果类型只增 `cacheStats` 快照字段（内部实例 `stats()` 只读读出，不改机制）。
- 写边界：`benchmarks/shared/types.ts`、`stats.ts`、`compare.ts`、`report.ts`、`benchmarks/compare.ts`、`benchmarks/domains/token.ts`、`benchmarks/design-token/runner.ts`（归因透传）、`benchmarks/design-token/run.ts`（协议旗标）、`tests/p1b-*.test.ts`。禁动：`benchmarks/design-token/cases.ts`、`equivalence.ts`、`synthetic.ts`、`workspace.ts`、compress/manual/cold-start 域。
- 捕获协议（冻结）：pre 锚 = `432453f`（pre-memo main tip，主代理临时 worktree 捕获）；post 锚 = P1b 交付 HEAD；`--iterations 30 --warmup 3 --no-equivalence`（样本纯度）+ 每次捕获一次 equivalence-on smoke 验证输出完整性；`mise exec bun@1.3.6` 全程；run-id 命名 `p1b-pre-432453f` / `p1b-post-<head8>`；捕获时主机无并行负载，负载状态记入证据 manifest。
- 证据（pre/post 报告 + statistics.json + manifest）由主代理创建持有（基线 v2 同款），施工方只读消费。
- 判定规则（冻结，见 Implementation Decisions 6）不因实测结果调整；规则触发 ESCALATE 时逐层撤回裁决提交给 Human。

## Implementation Decisions

1. `benchmarks/shared/types.ts` 只增扩展：`BenchmarkStats += p50Ms: number | null`；`BenchmarkComparisonContract.metric` union += `'p50Ms'`；新增 `PairedComparisonContract { key, metric, unit, pairedDeltasMs, baselineSampleCount, currentSampleCount, winCount, lossCount, tieCount, method: 'paired-index' | 'aggregate-fallback' }`；新增 `CacheAttributionTrace { layer: 'loadResource' | 'dictionary' | 'parse' | 'color', hits, misses, degraded }`；`BenchmarkCaseResult += cacheAttribution?: CacheAttributionTrace[]`；`EnvironmentMetadata += lockfileHash: string`（pnpm-lock.yaml SHA256）。
2. `benchmarks/shared/stats.ts`：`calculateStats` 增补 p50（nearest-rank，与既有 p95 口径一致）；`EnvironmentMetadata` 收集补 lockfileHash。
3. `generateTheme` 结果类型（`ThemeGenerationResult`）只增 `cacheStats?: TokenCacheStatsMap`：入口内部实例在返回前快照 `stats()`；不做签名变更、不改机制（施工方核对返回类型所有构造点）。
4. 归因接线：`design-token/runner.ts` 透传 `result.cacheStats` → `BenchmarkCaseResult.cacheAttribution`（四个 trace 按层）；`domains/token.ts` 无逻辑变更（只承接字段）。
5. 配对比较：`shared/compare.ts` 增配对模式——pre/post 同 case 样本数相等时按下标对齐计算 `pairedDeltasMs` 与 win/loss/tie（win = post < pre）；样本数不等回退聚合模式（`method: 'aggregate-fallback'`，行为与现状等价）；`benchmarks/compare.ts` 输出含配对合同与 p50；既有输出字段不变（只增）。
6. **判定规则（冻结）**：对 `token-multi-profile` 与 `night` 两域——配对 p50 改进 ≥ 5%（即 pairedDeltas 中位 ≤ -5%）且 p95 回归 ≤ 5%，且归因 trace 显示 dictionary/loadResource 层 hits > 0；同时 `token-single-profile` p50 回归 ≤ 3%。全部满足 → memo 保留结论成立；任一不满足 → `STATUS: ESCALATE` 提交 Human 逐层撤回裁决（不自动撤回）。
7. 证据布局：`docs/island/plans/2026-11-12-p1b-statistics/`——`pre/p1b-pre-432453f.json`、`post/p1b-post-<head8>.json`、`statistics.json`（配对裁决汇总 + 判定规则逐条核验结果）、`manifest.json`（schemaVersion 2 同款：两端锚点提交哈希、bun 版本、lockfileHash、逐命令 tracked-clean 断言、主机负载注记）。

## Testing Decisions

- p50 单元：已知向量（奇偶长度、重复值）断言 nearest-rank 语义。
- 配对比较单元：等长样本逐对对齐（win/loss/tie 计数）、不等长回退聚合、既有输出兼容（只增断言）。
- 归因单元：构造两 profile 场景断言 `cacheAttribution` 存在且 dictionary/loadResource hits > 0；单 profile 场景 trace 合法。
- 协议旗标：`--iterations/--warmup/--run-id/--no-equivalence` 行为不回归；equivalence-on smoke 通过。
- 质量门：`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。
- 契约只增：类型级测试断言既有字段仍在（快照或结构断言）。

## Out of Scope

- 不改 P1a 缓存机制与任何 `src/**` 行为；不引入持久/跨进程缓存。
- 不新增 benchmark case 定义（三域既有）；不做 compress/manual 域测量。
- 不做撤回执行（触发 ESCALATE 后由 Human 裁决，撤回另立）。
- 不做 CI 门禁阈值固化（bench:compare 静态阈值维持现状；门禁化属后续计划）。
- 性能优化的实施（本计划只测量与裁决，不优化）。

## Draft Plan

- 结构总览：契约层（types 只增）→ 聚合层（stats p50）→ 比较层（配对）→ 归因层（generateTheme 结果快照 + runner 透传）→ 协议层（run.ts 旗标）→ 证据层（主代理捕获 + statistics.json 裁决）。
- 关键契约：Implementation Decisions 1 的五个只增形状；判定规则六条；捕获协议五要素（锚点/迭代/运行时/命名/负载注记）。
- 文件结构：见 Constraints 写边界。
- 风险与未决：pre 锚捕获需在旧提交上装依赖（临时 worktree，pnpm install 可能与 lockfile 一致性相关——若 lockfile 在 432453f 与 HEAD 间有差异，捕获须用各锚点自身 lockfile，manifest 记录）；`--iterations 30` 的时长约 minutes 级（可接受，不并行）；nearest-rank p50 与未来插值口径的兼容（只增，不回改）。无阻塞未决。
- 里程碑草案：单一 Milestone（机制 + 捕获 + 裁决）。

## Implement Plan

worktree `p1-token-performance`（分支 `p1b-token-statistics`，基于 main @ f83196c）。顺序：Task-1 契约与配对机制 → Task-2 归因接线与协议 → 主代理冻结协议下捕获 pre/post → 闸门（statistics.json 裁决复核）→ pruner → 集成。SPEC 通过 fresh FULL 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

统计机制、归因接线与配对裁决

- 验证主题：契约只增扩展无破坏；p50/配对/归因按冻结口径可测；pre/post 捕获在冻结协议下产出 statistics.json 并按判定规则六条裁决。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/p1b-contract.test.ts tests/p1b-paired-compare.test.ts tests/p1b-attribution.test.ts`（mise bun 1.3.6，`--timeout 15000`）；主代理按协议执行捕获命令（字面，见 Decisions 7 布局）；statistics.json 含判定规则逐条核验结果。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

契约只增与配对机制（来源：User Story 1；Decisions 1/2/5；Testing Decisions p50/配对/只增）

- 验收标准：types 只增扩展就位；`calculateStats` p50 nearest-rank；配对模式等长对齐 + 不等长回退 + 既有输出兼容；p50 进入比较契约；单元测试全绿；契约只增断言存在。
- 可动文件范围：`benchmarks/shared/types.ts`、`stats.ts`、`compare.ts`、`benchmarks/compare.ts`、`tests/p1b-contract.test.ts`、`tests/p1b-paired-compare.test.ts`。
- 依赖：无（P1a 已集成）。
- 固有风险：nearest-rank 口径与 p95 既有实现的一致性需逐行核对；只增约束下 union 扩展不得影响既有 discriminated 分支。

- [ ] types/stats/compare 三层只增实现。
- [ ] p50 与配对单元测试（含回退与兼容断言）。

### Task-2

归因接线与捕获协议（来源：User Story 2；Decisions 3/4/7；Testing Decisions 归因/协议）

- 验收标准：`ThemeGenerationResult.cacheStats` 快照就位（所有构造点核对）；runner 透传 → `cacheAttribution`；协议旗标行为不回归；两 profile 归因单元（hits > 0）通过；主代理捕获前置条件（run-id 命名、`--iterations 30 --warmup 3 --no-equivalence`、equivalence-on smoke）在 run.ts 可用。
- 可动文件范围：`src/core/pipeline/theme-service.ts`（仅返回类型与快照赋值）、`benchmarks/design-token/runner.ts`、`benchmarks/domains/token.ts`（字段承接）、`benchmarks/design-token/run.ts`、`tests/p1b-attribution.test.ts`。
- 依赖：Task-1。
- 固有风险：`ThemeGenerationResult` 构造点遍历遗漏会静默缺字段（须全量 grep 核对）；归因快照不得改变计时路径（快照在计时区间外）。

- [ ] cacheStats 快照 + runner 透传 + 归因单元。
- [ ] 协议旗标与 equivalence-on smoke 路径。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理在冻结协议下捕获 pre（`432453f`）与 post（交付 HEAD），生成 statistics.json，按判定规则六条复核裁决；通过后 pruner 收尾、按路线图集成。规则触发 ESCALATE 时整体升级 Human，不自动撤回。
