---
date: 2026-11-12
state: 待 fresh FULL-3（v3 修订）
dispatch: P1 拆分裁决（2026-11-12）：统计与测量移入 P1b；P1a 已交付集成（main @ f83196c）；FULL-1 FAIL（5F/3M）→ v2；FULL-2 FAIL（5F/3M）→ v3：判定规则按编排可满足性重设计（hits 条件仅 multi-profile 域——night 单字典收集即复用、结构零命中）、协议升级为可执行脚本交付物（set -euo、显式断言、零占位符）、environment.ts 入写边界、配对合同在 compare 输出类型化挂载、RI 全函数化（空正基线集→null→ESCALATE 分支）、metric 分发补全（token 域 comparison.metric 改 p50Ms）、归因接线覆盖全部 cache 接受调用点、statistics.json 完整 TS schema
---

# Wave P1b Token 统计与测量 Plan

## Problem Statement

P1a 交付的进程内 memo 仅有等价证明，无性能测量。路线图原则「每个计划只有在相对基线有明确收益且质量门不退化时才保留性能机制」要求实测分布支撑保留/撤回裁决。当前测量面缺口：`BenchmarkStats` 无 p50；`benchmarks/compare.ts` 为非配对均值比较（15% 静态阈值），无逐样本配对；memo 逐层归因无处落盘；域报告只保留末次迭代为 primary，逐样本归因被丢弃。P1a 已并入 main，pre-memo 状态只能在前置提交上重建。

## Solution

在 P1a 交付机制上建立统计与测量：Q0 M2 契约**只增扩展**（可选字段 + 新增 interface）；配对比较实现与 p50 聚合（含 metric 分发）；归因接线在 benchmark runner 层达成（每次迭代创建 cache 并传入 runner 既有的低层调用——P1a 已交付的可选尾参，**生产 `src/**` 零改动**）；捕获协议冻结并给出字面命令（pre 锚 `432453f`、post 锚交付 HEAD，30 迭代，mise bun 1.3.6）；主代理持有证据，`statistics.json` 按冻结判定规则（相对 delta 公式化）裁决 memo 保留。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480`（max，派遣前 /clear 校准）；CODER-PLUS = `block:01a1c843-56aa-7330-ab49-085f434e9c99`（high，派遣前 /clear 校准）。规则同 Q0 SPEC。

## User Stories

1. 作为项目维护者，我希望 memo 收益以配对实测分布证明，以便保留/撤回有据可裁。
2. 作为项目维护者，我希望逐层归因落盘，以便后续优化知道重复工作消除发生在哪一层。

## Constraints

- Q0 M2 契约（`benchmarks/shared/types.ts`）**只增扩展**：既有 interface 上的新增字段一律可选（`?:`）；新形状一律新增 interface；union 只追加成员；既有字段/union 成员/比较输出形状零修改零删除（Human 裁决授权）。
- **生产 `src/**` 零改动**（FULL-1 F-4 修正：generateTheme 不在被测路径，归因接线全部落在 benchmark 层）。
- 写边界：`benchmarks/shared/types.ts`、`benchmarks/shared/stats.ts`、`benchmarks/shared/environment.ts`（lockfileHash 收集，FULL-2 F-3）、`benchmarks/shared/compare.ts`、`benchmarks/compare.ts`、`benchmarks/design-token/runner.ts`（归因穿线）、`benchmarks/domains/token.ts`（归因聚合 + comparison.metric 切 p50Ms）、`scripts/capture-p1b-statistics.sh`（新，协议脚本）、`tests/p1b-*.test.ts`。禁动：`benchmarks/run.ts`（旗标面已满足，零改动）、`benchmarks/domains/suite.ts`、`benchmarks/design-token/{cases,equivalence,synthetic,workspace}.ts`、`benchmarks/shared/report.ts`、compress/manual/cold-start 域、`src/**`。
- 捕获协议（冻结，字面命令见 Implementation Decisions 7）：pre 锚 = `432453f`（pre-memo main tip，主代理临时 worktree）；post 锚 = P1b 交付 HEAD；`--iterations 30 --warmup 3`；`mise exec bun@1.3.6` 全程；run-id 命名 `p1b-pre-432453f` / `p1b-post-<head8>`；每锚附一次 equivalence-on smoke（exit 0 断言）；捕获全程主机无并行负载，负载注记与 bun/node/lockfile 哈希入 manifest。
- 证据（pre/post 报告 + statistics.json + manifest）由主代理创建持有（基线 v2 同款），施工方只读消费。
- 判定规则（冻结，Decisions 6）不因实测结果调整；规则触发 ESCALATE 时逐层撤回裁决提交 Human。

## Implementation Decisions

1. `benchmarks/shared/types.ts` 只增扩展：`BenchmarkStats` 增**可选** `p50Ms?: number | null`；`BenchmarkComparisonContract.metric` union 追加 `'p50Ms'`；新增 interface `PairedComparisonContract { key, metric: 'p50Ms', unit: 'ms', pairedDeltasMs: number[], medianRelativeImprovement: number | null, p95RelativeRegression: number | null, baselineSampleCount, currentSampleCount, positiveBaselineCount, winCount, lossCount, tieCount, excludedNonPositiveBaseline: number, method: 'paired-index' | 'aggregate-fallback' }`；比较输出类型 `BenchmarkComparisonCase` 增**可选** `paired?: PairedComparisonContract`（配对成功时由 compare 发出——类型化挂载点，FULL-2 F-5）；新增 interface `CacheAttributionTrace { layer: 'loadResource' | 'dictionary' | 'parse' | 'color', hits, misses, degraded }`；`BenchmarkCaseResult` 增**可选** `cacheAttribution?: CacheAttributionTrace[]`；`EnvironmentMetadata` 增**可选** `lockfileHash?: string`。
2. `benchmarks/shared/stats.ts`：`calculateStats` 增补 p50（nearest-rank，与既有 p95 同口径；空样本 undefined 语义不变）。`benchmarks/shared/environment.ts`（收集器真实所在——FULL-2 F-3 事实修正）：`collectEnvironmentMetadata` 补收 `lockfileHash`（pnpm-lock.yaml SHA256，缺失容错为 undefined 可选字段）。
3. 配对比较与 metric 分发（`benchmarks/shared/compare.ts` + `benchmarks/compare.ts`）：比较用例按其 comparison contract 的 `metric` 分发读取（meanMs/p95Ms/minMs/maxMs/p50Ms；FULL-1 M-1：不再固定 meanMs），比较输出用例增**可选** `p50DeltaMs?: number | null` 字段（既有字段零修改）；新增配对模式——pre/post 同 case 样本数相等且双方 `samplesMs` 均存在时按下标对齐：`pairedDeltasMs[i] = current[i] - pre[i]`，win = delta < 0、loss = delta > 0、tie = delta === 0；样本数不等或任一方缺 `samplesMs` → 回退聚合模式（`pairedDeltasMs: []`、win/loss/tie = 0、`medianRelativeImprovement = null`、`p95RelativeRegression = null`、`excludedNonPositiveBaseline = 0`、`method: 'aggregate-fallback'`）。相对量公式（全函数，FULL-2 F-4）：正基线集 `P = { i : pre_i > 0 }`、`positiveBaselineCount = |P|`；`|P| = 0` → `medianRelativeImprovement = null`（判定规则走 null → ESCALATE 分支，不产生数值）；`|P| > 0` → `medianRelativeImprovement = median{ (pre_i − post_i) / pre_i : i ∈ P }`（pre_i ≤ 0 的对不计入并计入 `excludedNonPositiveBaseline`；**偶数基数中位数 = 中间两值算术平均**，与奇数取中值同为一法定义）；`p95RelativeRegression = (postP95 − preP95) / preP95`（preP95 > 0 时，否则 null）。
4. 归因接线（runner 层，FULL-1 F-4 修正）：`design-token/runner.ts` 每次**测量**迭代创建 `createTokenCache()` 实例并传入其**全部** cache 接受调用点——`loadDesignTokenWorkspace(..., cache)`、`collectDependencyDictionary(..., cache)`、`parseProfileDocument(..., cache)`（:225 与 :235 两处）、`prepareBuildPass(..., cache)`（P1a 可选尾参，签名零改动；FULL-2 M-1 要求四层可达）；迭代结束后读取 `cache.stats()` 产出该样本的 `CacheAttributionTrace[]`（快照在计时区间外）；单元测试断言四层在 multi-profile 场景均可产生非零计数。**测量语义声明**：post 路径 = 基准编排（与生产同层的核心函数）+ memo 启用；pre 路径（432453f）= 同一编排、无 cache 可传（memo 不存在）；被测对象 = 层级 memo 效应，非 generateTheme 编排逐字节复刻。生产 `src/**` 零改动。
5. 归因聚合（FULL-1 M-2）：`domains/token.ts` 将逐样本 trace 按层求和（SUM(hits/misses/degraded)，仅统计 post-warmup 测量迭代，warmup 样本的 trace 丢弃），写入 case 级 `cacheAttribution`（四层 trace 各一条）。判定规则的 hits 条件消费该聚合值。
6. **判定规则（冻结；按编排可满足性重设计，FULL-2 F-1）**：记 `RI = medianRelativeImprovement`、`PR = p95RelativeRegression`（分数或 null）。可满足性依据：multi-profile 域在单次迭代内 profile 循环复用首收集字典（N−1 次命中）——**命中证据仅在该域结构性可得**；night/single 域单字典收集即复用、资源单次加载，命中恒零（编排事实，非缺陷）。规则：`token-multi-profile`：`RI ≥ 0.05` 且 `PR ≠ null 且 PR ≤ 0.05` 且聚合 `dictionary.hits > 0` 且聚合 `loadResource.hits > 0`；`night` 与 `token-single-profile`：`RI ≥ 0.05`（night）/ `RI ≥ −0.03`（single），无命中条件。三域条件全部满足且全部 `RI ≠ null` → memo 保留结论成立；任一域 `RI = null` 或 `PR = null` 或规则不满足 → `STATUS: ESCALATE` 提交 Human 逐层撤回裁决（不自动撤回）。规则行逐条落 `statistics.json` 的 `ruleChecks`。
7. 捕获协议（**可执行脚本交付物**，FULL-2 F-2）与证据布局：新增 `scripts/capture-p1b-statistics.sh`（写边界内，`set -euo pipefail`）——脚本内含全部步骤命令与显式断言：锚点参数化（`--anchor <commit>`，head8 = `git rev-parse --short=8`，无 `<head8>` 占位）；lockfile 断言为显式比较命令（`[ "$(shasum -a 256 pnpm-lock.yaml | cut -d' ' -f1)" = "$(git show <anchor>:pnpm-lock.yaml | shasum -a 256 | cut -d' ' -f1)" ]`，不等即 exit 1，非注释）；results-dir 显式绝对路径（`/private/tmp/p1b-{pre,post}-reports`）；每场景前置 tracked-clean 显式断言命令；场景失败即 `exit 1`（`benchmarks/run.ts` 非零透传）；smoke 断言 exit 0 并校验报告存在；`evidence` 输出目录由脚本末段 `cp` 到 `docs/island/plans/2026-11-12-p1b-statistics/{pre,post}/`（脚本参数 `--evidence-dir`，非字面占位）。SPEC 不再承载散文命令序列——协议真源 = 该脚本（施工方实现，主代理执行）。
   - **pre 捕获（锚 432453f）**：
     ```sh
     git worktree add /private/tmp/p1b-pre-anchor 432453f
     cd /private/tmp/p1b-pre-anchor
     mise exec bun@1.3.6 -- pnpm install --frozen-lockfile
     shasum -a 256 pnpm-lock.yaml   # 必须等于 git show 432453f:pnpm-lock.yaml 的哈希，否则停
     mise exec bun@1.3.6 -- pnpm build
     mise exec bun@1.3.6 -- bun benchmarks/run.ts --iterations 30 --warmup 3 \
       --run-id p1b-pre-432453f \
       --domain token-single-profile --domain token-multi-profile --domain night \
       --results-dir /private/tmp/p1b-pre-reports
     # equivalence-on smoke（exit 0 断言）：
     mise exec bun@1.3.6 -- bun benchmarks/design-token/run.ts --mode default --iterations 1 --warmup 0
     cp /private/tmp/p1b-pre-reports/p1b-pre-432453f.json <evidence>/pre/
     ```
   - **post 捕获（交付 HEAD，在 p1b worktree）**：同上，免 worktree add（直接在 worktree 根），run-id 换 `p1b-post-<head8>`，results-dir `/private/tmp/p1b-post-reports`，smoke 同款。
   - 每条场景命令前置 tracked-clean 断言（manifest 记录 4/4）；`benchmarks/run.ts` 任一 case 失败即 exit 1 → 捕获无效，修复后重捕。
   - **证据布局** `docs/island/plans/2026-11-12-p1b-statistics/`：`pre/p1b-pre-432453f.json`、`post/p1b-post-<head8>.json`、`statistics.json`、`manifest.json`（schemaVersion 2 同款：双锚点提交哈希、bun/node 版本、双锚 lockfileHash、逐命令 tracked-clean 断言、主机负载注记、smoke 结果）。
   - **`statistics.json` 消费合同（完整 TS 形状，FULL-2 M-3/F-5）**：`{ schemaVersion: 1, anchors: { pre: string /* 40-hex commit */, post: string /* 40-hex commit */ }, protocol: { iterations: 30, warmup: 3, bun: string, lockfileHashes: { pre: string /* 64-hex，非 null 强制 */, post: string /* 64-hex，非 null 强制 */ } }, cases: [ { key: string, domain: 'token-single-profile' | 'token-multi-profile' | 'night', baselineStatsRef: { report: string, caseId: string }, currentStatsRef: { report: string, caseId: string }, paired: PairedComparisonContract, ruleChecks: Array<{ rule: string, threshold: string, measured: number | null, pass: boolean }> } ] /* 恰好三域，缺一即捕获无效 */, verdict: 'retained' | 'escalate' }`——paired 对象即 compare 输出的类型化挂载（同一 interface，无第二形状）；生成 = 主代理以 compare `--paired` 输出组合（生成方式记 manifest）；**捕获有效性规则**：任一域 status ≠ success 或缺 `samplesMs`，或任一锚 lockfileHash 为空，或域集 ≠ 三域 → 捕获无效、重捕；`statistics.json` 仅由完整有效捕获构建；**捕获有效性规则（FULL-1 M-3）**：任一域 status ≠ success 或 `samplesMs` 缺失 → 该捕获无效、重捕，`statistics.json` 仅由完整成功捕获构建（stats 为空/`p50Ms` null 只会出现在无效捕获中，由该规则排除）。

## Testing Decisions

- p50 单元：已知向量（奇偶长度、重复值）断言 nearest-rank 语义；空样本 undefined 语义不回归。
- 配对单元：等长对齐（win/loss/tie 与 pairedDeltasMs 逐值断言）；不等长回退（fallback 字段填充断言）；缺 `samplesMs` 回退；`excludedNonPositiveBaseline` 分母守卫；`medianRelativeImprovement` 公式向量验证；既有比较输出兼容（只增断言）。
- metric 分发单元：五 metric（meanMs/p95Ms/p50Ms/minMs/maxMs）读取全部正确；token 域 comparison.metric = p50Ms 断言；p50 缺失时既有 mean 通道行为不回归（FULL-2 M-2）。
- RI 全函数单元：`|P| = 0` → `medianRelativeImprovement = null`；偶数基数中位数 = 中间两值均值（向量验证）；`excludedNonPositiveBaseline` 计数（FULL-2 F-4）。
- 归因单元：runner 场景构造两 profile 迭代，断言 case 级 `cacheAttribution` 为四层 SUM 且 **parse 与 color 层亦非零**（全部 cache 接受调用点已穿线，FULL-2 M-1）；dictionary/loadResource hits > 0；warmup 样本 trace 不计入（FULL-1 M-2 口径锁定）。
- 质量门：`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。
- 契约只增：类型级测试断言既有字段仍在。

## Out of Scope

- 不改 P1a 缓存机制；**生产 `src/**` 零改动**；不引入持久/跨进程缓存。
- 不新增 benchmark case 定义；不做 compress/manual/cold-start 域测量。
- 不做撤回执行（触发 ESCALATE 后由 Human 裁决，撤回另立）。
- 不做 CI 门禁阈值固化（bench:compare 静态阈值维持现状）。
- 不实施性能优化（本计划只测量与裁决）。

## Draft Plan

- 结构总览：契约层（types 只增，全部可选/新 interface）→ 聚合层（stats p50 + lockfileHash）→ 比较层（metric 分发 + 配对模式）→ 归因层（runner 每-迭代 cache 穿线 + 域级 SUM 聚合）→ 证据层（主代理字面协议捕获 + statistics.json 裁决）。
- 关键契约：Decisions 1 五类只增形状；Decisions 3 配对公式与回退；Decisions 4 测量语义声明；Decisions 6 判定规则；Decisions 7 字面协议与 statistics.json 合同。
- 文件结构：见 Constraints 写边界。
- 风险与未决：pre 锚在旧提交装依赖——`pnpm install --frozen-lockfile` + lockfile 哈希断言闭环（若该锚 lockfile 与现 node_modules 结构不兼容则停机报告，不静默换源）；`--iterations 30` 三域时长 minutes 级（串行，可接受）；nearest-rank p50 与未来插值口径兼容（只增，不回改）。无阻塞未决。
- 里程碑草案：单一 Milestone（机制 + 归因 + 裁决）。

## Implement Plan

worktree `p1-token-performance`（分支 `p1b-token-statistics`，基于 main @ f83196c）。顺序：Task-1 契约与配对机制 → Task-2 归因接线与聚合 → 主代理按冻结协议捕获 pre/post → 闸门（statistics.json 裁决复核）→ pruner → 集成。SPEC 通过 fresh FULL-2 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

统计机制、归因接线与配对裁决

- 验证主题：契约只增扩展无破坏；p50/配对/metric 分发按冻结口径可测；归因接线可达且聚合口径锁定；pre/post 捕获在冻结协议下产出 statistics.json 并按判定规则逐条裁决。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/p1b-contract.test.ts tests/p1b-paired-compare.test.ts tests/p1b-attribution.test.ts`（mise bun 1.3.6，`--timeout 15000`）；主代理执行 `scripts/capture-p1b-statistics.sh`（pre 锚 `432453f` / post 锚交付 HEAD）完成捕获；statistics.json 含 ruleChecks 逐条结果。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

契约只增与配对机制（来源：User Story 1；Decisions 1/2/3；Testing Decisions p50/配对/分发/只增）

- 验收标准：types 只增扩展就位（全部可选/新 interface）；`calculateStats` p50 nearest-rank 且空样本语义不回归；metric 分发（meanMs/p95Ms/p50Ms）替换固定 meanMs 读取且既有输出零修改；配对模式（等长对齐公式、回退填充、分母守卫）实现；比较输出增可选 `p50DeltaMs`；单元测试全绿含只增断言。
- 验收标准（增补）：`environment.ts` lockfileHash 可选收集就位；token 域 `comparison.metric` 切换为 `'p50Ms'`（`domains/token.ts:170-174` 区域，单行）。
- 可动文件范围：`benchmarks/shared/types.ts`、`benchmarks/shared/stats.ts`、`benchmarks/shared/environment.ts`、`benchmarks/shared/compare.ts`、`benchmarks/compare.ts`、`benchmarks/domains/token.ts`（仅 comparison.metric 一行）、`tests/p1b-contract.test.ts`、`tests/p1b-paired-compare.test.ts`。
- 依赖：无（P1a 已集成）。
- 固有风险：nearest-rank 口径与既有 p95 逐行核对；union 追加不得影响既有 discriminated 分支；token 域 metric 切换后 bench:compare 的既有 mean 阈值比较行为需核不回归。

- [ ] types/stats/environment 只增实现与 metric 分发（五 metric + token 域 p50Ms 切换）。
- [ ] p50、配对（含回退与守卫）、RI 全函数、分发、只增单元测试。

### Task-2

归因接线与聚合（来源：User Story 2；Decisions 4/5；Testing Decisions 归因）

- 验收标准：runner 每-测量迭代 cache 穿线至**全部** cache 接受调用点（loadDesignTokenWorkspace / collectDependencyDictionary / parseProfileDocument×2 / prepareBuildPass；生产零改动）；逐样本 trace 在计时区间外读取；域级 SUM 聚合（warmup 排除）写入 `cacheAttribution`；两 profile 归因单元四层非零断言通过；`scripts/capture-p1b-statistics.sh` 实现并干跑验证（参数解析、断言路径、失败透传）；计时路径除 memo 启用外无其他变更。
- 可动文件范围：`benchmarks/design-token/runner.ts`、`benchmarks/domains/token.ts`、`scripts/capture-p1b-statistics.sh`、`tests/p1b-attribution.test.ts`。
- 依赖：Task-1。
- 固有风险：调用点遗漏 = 对应层归因恒零（闸门查四层非零断言兜底）；trace 读取必须在计时 stop 之后；脚本在 pre 锚旧提交上执行时的目录假设需相对 repo root 可移植。

- [ ] runner 全调用点 cache 穿线与逐样本 trace + 域级聚合。
- [ ] 协议脚本实现与干跑验证 + 归因单元测试。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理在冻结协议下捕获 pre（`432453f`）与 post（交付 HEAD），生成 statistics.json，按判定规则逐条复核裁决；通过后 pruner 收尾、按路线图集成。规则触发 ESCALATE 时整体升级 Human，不自动撤回。
