---
date: 2026-11-12
state: 待 fresh FULL-8（v8 修订，FULL-7 台账消解——spike 生命周期修正轮 4/4 最后一轮）
dispatch: P1 拆分裁决（2026-11-12）→ 三轮 FAIL 触发飞轮硬停 → Human 裁决 spike 先行（2026-11-12）→ spike 落地：capture 脚本双锚端到端演示、归因四层穿线实测（multi-profile 全非零；FULL-3 F-5 color 结构零被证伪）、配对合同类型化挂载 + RI 公式修正（-d/b）、per-sample carrier 解法。事实清单：.tmp/p1/spike-facts.md。v7 → FULL-7 FAIL（1F/4M/1m，轨迹 5→5→6→3→1→2→1）→ v8：manifest 补 node/负载 provenance（F-1）、lockfile/paired provenance 绑定深化（M-1/M-2）、globalRuleChecks 独立字段（M-3）、阈值预注册落稿（Human 裁决 2026-11-12）、文案残留清理
---

# Wave P1b Token 统计与测量 Plan

## Problem Statement

P1a 交付的进程内 memo 仅有等价证明，无性能测量。路线图原则「每个计划只有在相对基线有明确收益且质量门不退化时才保留性能机制」要求实测分布支撑保留/撤回裁决。当前测量面缺口：`BenchmarkStats` 无 p50；`benchmarks/compare.ts` 为非配对均值比较（15% 静态阈值），无逐样本配对；memo 逐层归因无处落盘；域报告只保留末次迭代为 primary，逐样本归因被丢弃。P1a 已并入 main，pre-memo 状态只能在前置提交上重建。

## Solution

在 P1a 交付机制上建立统计与测量，**以 spike 演示实现为冻结基线**：capture 协议脚本（双锚端到端已演示）、归因四层穿线（runner 每-迭代 cache → 全部 cache 接受调用点 → 逐样本 trace → 域级 SUM）、配对合同类型化挂载（compare 输出只增 paired 字段；RI = median{-d/b : pre>0}，偶数基数中位数 = 中间两值均值；fallback 全函数）、冻结判定规则（命中条件仅 multi-profile——编排事实经实测确认）。Task 增量 = stats.p50Ms、statistics.json 组装脚本（固定谓词 + 有效性断言）、脚本 evidence 覆盖守卫、单元测试锁定。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = `block:01a1c9ca-50a8-72ce-8e76-8282f5b74480`（max，派遣前 /clear 校准）；CODER-PLUS = `block:01a1c843-56aa-7330-ab49-085f434e9c99`（high，派遣前 /clear 校准）。规则同 Q0 SPEC。

## User Stories

1. 作为项目维护者，我希望 memo 收益以配对实测分布证明，以便保留/撤回有据可裁。
2. 作为项目维护者，我希望逐层归因落盘，以便后续优化知道重复工作消除发生在哪一层。

## Constraints

- Q0 M2 契约（`benchmarks/shared/types.ts`）**只增扩展**：既有 interface 上的新增字段一律可选（`?:`）；新形状一律新增 interface；union 只追加成员；既有字段/union 成员/比较输出形状零修改零删除（Human 裁决授权）。
- **生产 `src/**` 零改动**（FULL-1 F-4 修正：generateTheme 不在被测路径，归因接线全部落在 benchmark 层）。
- 写边界：spike 已实现并演示的文件（`benchmarks/shared/types.ts`、`benchmarks/shared/compare.ts`、`benchmarks/design-token/runner.ts`、`benchmarks/domains/token.ts`、`scripts/capture-p1b-statistics.sh`——以提交 29a5d2e/863c73d 现状为冻结基线，仅允许下述 Task 增量）＋ `benchmarks/shared/stats.ts`（p50Ms）、`scripts/compose-p1b-statistics.ts`（新，statistics 组装）、`tests/p1b-*.test.ts`。**legacy 比较行为零修改**（既有字段/状态机/阈值逻辑不动——spike 已验证只增不破坏）。禁动：`benchmarks/run.ts`（旗标面已满足，零改动）、`benchmarks/domains/suite.ts`、`benchmarks/design-token/{cases,equivalence,synthetic,workspace}.ts`、`benchmarks/shared/report.ts`、compress/manual/cold-start 域、`src/**`。
- 捕获协议（冻结，字面命令见 Implementation Decisions 7）：pre 锚 = `432453f`（pre-memo main tip，主代理临时 worktree）；post 锚 = P1b 交付 HEAD；`--iterations 30 --warmup 3`；`mise exec bun@1.3.6` 全程；run-id 命名 `p1b-pre-432453f` / `p1b-post-<head8>`；每锚附一次 equivalence-on smoke（exit 0 断言）；捕获全程主机无并行负载，负载注记与 bun/node/lockfile 哈希入 manifest。
- 证据（pre/post 报告 + statistics.json + manifest）由主代理创建持有（基线 v2 同款），施工方只读消费。
- 判定规则（冻结，Decisions 6）不因实测结果调整；规则触发 ESCALATE 时逐层撤回裁决提交 Human。

## Implementation Decisions

1. **契约（已实现，29a5d2e）**：`CacheAttributionTrace`（layer/hits/misses/degraded 全 typed）＋ `BenchmarkCaseResult.cacheAttribution?`；`PairedComparisonContract`（key: string, metric: 'p50Ms', unit: 'ms', pairedDeltasMs: number[], medianRelativeImprovement: number | null, p95RelativeRegression: number | null, baselineSampleCount/currentSampleCount/positiveBaselineCount/winCount/lossCount/tieCount/excludedNonPositiveBaseline: number, method: 'paired-index' | 'aggregate-fallback'）＋ **`BenchmarkComparisonCase.paired?` 类型化挂载**。`benchmarks/shared/stats.ts` 增补 `p50Ms?: number | null`（nearest-rank，与 p95 同口径；Task-1 增量）。
2. **归因接线（已实现，29a5d2e，双锚实测）**：runner 每-调用创建 `createTokenCache()` 穿线至全部 cache 接受调用点（loadDesignTokenWorkspace / parseProfileDocument×2 / collectDependencyDictionary / prepareBuildPass(input.cache)）；成功返回前 `stats()` 快照 → 四层 trace。domains 层 SUM 聚合（Map 跨迭代累加；**warmup 后与 samples 同点 `traceSums.clear()`——FULL-4 F-1 修复，聚合口径 = 纯测量迭代**）。实测：multi-profile 四层全非零；night = parse/color 命中（dictionary/loadResource 恒零——编排事实）；single 全零。
3. **配对比较（已实现，29a5d2e/863c73d）**：`buildPairedComparisonContract(key, base, current)`——样本取 `stats.samplesMs`；等长且全部有限值 → paired-index（`pairedDeltasMs[i] = post_i - pre_i`；win = d<0 / loss = d>0 / tie = d=0；`RI = median{-d/b : pre_i>0}`（**修正后公式**），pre_i ≤ 0 计入 excludedNonPositiveBaseline；偶数基数中位数 = 中间两值算术平均；`PR = (postP95 - preP95)/preP95`，仅 preP95>0 且 postP95≠null 时非 null）；不等长/空/非有限值 → aggregate-fallback（空数组、零计数、null 量值、positiveBaselineCount=0）。compare 输出每 case 附 paired（只增，实测 legacy 行为不破坏）。
4. **协议脚本（已实现并双锚演示，29a5d2e）**：`scripts/capture-p1b-statistics.sh`（set -euo pipefail）——参数 `--anchor <commit|HEAD> --run-id <id> --evidence-dir <dir> [--iterations N] [--warmup N]`；pre 锚 worktree 化（已存在即 FAIL——stale 防护实测）；install --frozen-lockfile；lockfile 哈希**显式比较**（实际 vs `git show <anchor>:pnpm-lock.yaml`，不匹配 exit 1）；build；三域 run（--results-dir /private/tmp/p1b-capture-<run-id>/reports）；**每锚 equivalence-on smoke**（FULL-4 F-2 修复：pre 锚同样执行——432453f 已有 Q0 交付的 design-token harness）；报告落盘 evidence 目录；**evidence 覆盖守卫**（目标已存在即 FAIL）；**写 capture manifest**（结构化，schema = 脚本实现为准——FULL-6 F-2 对齐：`{ runId, anchorArg, anchorCommit, headCommit, iterations, warmup, lockfileHash, sourceDir, runtime: { bun: '1.3.6', node, platform, arch }, hostLoad: { load1mAtStart, note: 'no parallel agents during capture' }, report }`——compose 的 lockfileHashes/runtime 与 provenance 绑定源）。**冻结协议调用**：pre = `--anchor 432453f --run-id p1b-pre-432453f`；post = `--anchor HEAD --run-id p1b-post-<head8>`；`--iterations 30 --warmup 3`。Task-2 增量：evidence 目标文件已存在时 FAIL（覆盖守卫）。
5. **lockfileHash 来源（F-6 闭环）**：`statistics.json` 的 `protocol.lockfileHashes` 以**脚本输出/断言值**为源（非报告 environment 块——pre 锚报告无该字段）；脚本已在断言中持有双锚哈希。
6. **判定规则（预注册定版，Human 裁决 2026-11-12——先于 30 迭代捕获封版；「memo 价值超越速度」立场）**：记 `RI = medianRelativeImprovement`、`PR = p95RelativeRegression`（分数或 null）。`token-multi-profile`：`RI ≥ 0` 且 `PR ≠ null 且 PR ≤ 0.10` 且聚合 `dictionary.hits > 0` 且聚合 `loadResource.hits > 0`；`night`：`RI ≥ 0`；`token-single-profile`：`RI ≥ −0.03`。**全局安全地板：任一域 `RI < −0.10` → escalate**（价值立场不豁免灾难回归）。三域条件全部满足且全部 `RI ≠ null` → retained；任一不满足或 null → escalate（提交 Human 逐层撤回裁决，不自动撤回）。
7. **statistics.json 组装（Task-2 增量，`scripts/compose-p1b-statistics.ts`；字面调用冻结——FULL-7 M-4）**：`mise exec bun@1.3.6 -- bun scripts/compose-p1b-statistics.ts --evidence-dir docs/island/plans/2026-11-12-p1b-statistics --pre-report p1b-pre-432453f.json --post-report p1b-post-<head8>.json --comparison comparison.json --out statistics.json`——所有路径相对 evidence 根目录解析；输出写 `--out` 指定路径；输入 = 双锚报告 + capture manifest×2 + comparison 输出。schema（全 typed）：`{ schemaVersion: 1, anchors: { pre: string(40-hex), post: string(40-hex) }, protocol: { iterations: 30, warmup: 3, bun: string, lockfileHashes: { pre: string(64-hex), post: string(64-hex) }, manifests: { pre: string, post: string } /* capture manifest 相对路径——FULL-6 M-1 */ }, cases: Array<{ key: string, domain: 'token-single-profile' | 'token-multi-profile' | 'night', baselineStatsRef: { report: string /* 相对 evidence 目录路径 */, runId: string, caseId: string, reportSha256: string, manifestRef: string }, currentStatsRef: { report: string, runId: string, caseId: string, reportSha256: string, manifestRef: string }, comparisonRef: { path: string, sha256: string, baseRunId: string, currentRunId: string } /* FULL-6 M-2 + FULL-7 M-1 */, paired: PairedComparisonContract, ruleChecks: Array<{ rule: string, threshold: string, measured: number | null, pass: boolean }> }, globalRuleChecks: Array<{ rule: string, threshold: string, measured: number | null, pass: boolean }> /* 顶层字段固定两行，语义见 Decisions 7——不进 cases[]，FULL-6 M-3 */ }, validity: { domainsComplete: boolean, sampleCountsExact: boolean, lockfileHashesPresent: boolean, reportsExist: boolean }, verdict: 'retained' | 'escalate' | 'invalid' }`。**ruleChecks 固定谓词集（M-2，按预注册阈值更新）**：multi 域 4 行（RI ≥ 0 / PR ≤ 0.10 / dictionary.hits > 0 / loadResource.hits > 0）；night 与 single 各 1 行（RI 阈值）；`globalRuleChecks` 固定 2 行（FULL-7 M-2 语义冻结）：`{ rule: 'RI-non-null', threshold: 'null RI count = 0', measured: <三域中 RI 为 null 的计数>, pass: measured === 0 }`；`{ rule: 'safety-floor', threshold: 'min(RI) >= -0.10', measured: <三域 RI 的最小值；任一 null 则 measured = null>, pass: measured !== null && measured >= -0.10 }`——safety-floor fail 直接致 verdict escalate。**有效性断言（M-3 + FULL-4 F-3 + FULL-7 M-3）**：恰三域、每域 `samplesMs.length === 30` 且全部有限值、**每 case `status === 'success'`**、**两份报告与两份 capture manifest 的 `iterations === 30` 且 `warmup === 3` 逐字相等**、manifest 的 `runtime.node`/`hostLoad.load1mStart/load1mEnd` 非空且 manifest `bun` 与报告 environment.bun 一致、双锚 lockfileHash 非空、双报告文件存在且 caseId 与 domain 一致——任一不满足 → `validity` 对应 false 且 `verdict: 'invalid'`（重捕，不产生裁决）。**引用与内容校验（FULL-7 M-1 闭环）**：组装时逐项校验——①引用文件存在 + caseId 命中；②`reportSha256` 与引用报告文件实际 SHA256 一致、`comparisonRef.sha256` 与比较输出文件实际 SHA256 一致；③manifest 绑定：`manifestRef` 指向的 manifest 的 runId 与 statsRef.runId 及报告 runId 三方一致、report 字段与其 manifest.report 一致；④`protocol.lockfileHashes[锚]` 与对应 manifest `lockfileHash` 逐字相等且 manifest `anchorCommit` 与 `anchors[锚]` 一致；⑤`comparisonRef` runId 对与两份报告 runId 一致；⑥**statistics 中每个 case 的 `paired` 对象与 comparison 输出中同 key 的 `paired` 全量 JSON 相等**——任一失败 → invalid。
8. **legacy 比较零修改（F-2 消解）**：token 域 `comparison.metric` **保持 meanMs 不迁移**；决策走 paired 合同（其 metric 字段独立标 'p50Ms'）；五 metric 分发承诺撤销（legacy compare 行为不动，p50 经 `stats.p50Ms` 与 paired 承载）。

## Testing Decisions

- 单元锁定（对已实现代码）：配对公式向量（等长对齐/win-loss-tie/RI 修正公式/偶数基数中位数/空正基线集 → null/非有限值 → fallback/excluded 计数）；fallback 字段填充；legacy compare 只增断言（paired 存在且既有字段不动）。
- 归因单元：multi-profile 场景四层非零断言（实测基准）；night 的 parse/color 命中与 dictionary/loadResource 零断言（编排事实锁定）；SUM 聚合跨迭代正确性。
- stats 单元：p50 nearest-rank 向量（奇偶/重复/空样本语义不变）。
- 组装单元：statistics schema 形状、ruleChecks 固定行数与谓词、有效性断言（缺域/样本数≠30/lockfileHash 空 → invalid）、引用存在性校验。
- 脚本行为：干跑参数解析；stale worktree 拒绝；脏树拒绝；lockfile 不匹配拒绝（已有实测）；evidence 覆盖守卫；每锚 smoke 执行；capture manifest 落盘断言（含 node 与负载注记——FULL-5 F-1）。
- 有效性补充（FULL-4 F-3）：失败报告（任一 case status ≠ success）即使样本数合规也必须 invalid——测试含该反例。
- 质量门：`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。

## Out of Scope

- 不改 P1a 缓存机制；**生产 `src/**` 零改动**；不引入持久/跨进程缓存。
- 不新增 benchmark case 定义；不做 compress/manual/cold-start 域测量。
- 不做撤回执行（触发 ESCALATE 后由 Human 裁决，撤回另立）。
- 不做 CI 门禁阈值固化；不做五 metric 分发改造（legacy compare 不动——v4 裁定）。
- 不实施性能优化（本计划只测量与裁决；3 迭代冒烟的时序观察不构成结论）。

## Draft Plan

- 结构总览：契约层（types 只增，全部可选/新 interface）→ 聚合层（stats p50 + lockfileHash）→ 比较层（metric 分发 + 配对模式）→ 归因层（runner 每-迭代 cache 穿线 + 域级 SUM 聚合）→ 证据层（主代理字面协议捕获 + statistics.json 裁决）。
- 关键契约：Decisions 1 五类只增形状；Decisions 3 配对公式与回退；Decisions 4 测量语义声明；Decisions 6 判定规则；Decisions 7 字面协议与 statistics.json 合同。
- 文件结构：见 Constraints 写边界。
- 风险与未决：30 迭代实测可能给出 RI 不达标 → 规则如实 escalate（系统设计行为，非风险）；spike 种子代码即为交付基线（已过 tsc 与双锚实测）。无阻塞未决。
- 里程碑草案：单一 Milestone（机制 + 归因 + 裁决）。

## Implement Plan

worktree `p1-token-performance`（分支 `p1b-token-statistics`，基于 main @ f83196c）。顺序：Task-1 stats p50 与单元锁定 → Task-2 statistics 组装与协议守卫 → 主代理按冻结协议捕获 pre/post → 闸门（statistics.json 裁决复核）→ pruner → 集成。SPEC 通过 fresh FULL-6 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

统计机制、归因接线与配对裁决

- 验证主题：契约只增扩展无破坏；p50/配对/metric 分发按冻结口径可测；归因接线可达且聚合口径锁定；pre/post 捕获在冻结协议下产出 statistics.json 并按判定规则逐条裁决。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/p1b-contract.test.ts tests/p1b-paired-compare.test.ts tests/p1b-attribution.test.ts`（mise bun 1.3.6，`--timeout 15000`）；主代理执行 `scripts/capture-p1b-statistics.sh`（pre 锚 `432453f` / post 锚交付 HEAD）完成捕获；statistics.json 含 ruleChecks 逐条结果。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

stats p50 与单元锁定（来源：User Story 1；Decisions 1/3；Testing Decisions 前四项）

- 验收标准：`stats.ts` p50Ms（nearest-rank）就位；配对公式/归因/只增单元测试全绿（对 spike 已实现代码锁定——公式向量含修正后 RI、偶数中位数、null 分支、fallback 填充、excluded 计数；归因含 multi 四层非零 + night 编排事实 + SUM 聚合）。
- 可动文件范围：`benchmarks/shared/stats.ts`、`tests/p1b-contract.test.ts`、`tests/p1b-paired-compare.test.ts`、`tests/p1b-attribution.test.ts`。
- 依赖：无（spike 种子已入库）。
- 固有风险：对已演示行为写测试须以实测数据为准（spike 报告为参照），不得臆造断言值。

- [ ] p50Ms 实现。
- [ ] 三组单元测试锁定。

### Task-2

statistics 组装与协议守卫（来源：User Story 2；Decisions 4/5/7；Testing Decisions 组装/脚本）

- 验收标准：`compose-p1b-statistics.ts` 实现（全 typed schema + 固定谓词 ruleChecks + 有效性断言 + 引用校验）；capture 脚本 evidence 覆盖守卫；组装单元测试全绿；脚本干跑断言（stale/脏树/覆盖）复验。
- 可动文件范围：`scripts/compose-p1b-statistics.ts`、`scripts/capture-p1b-statistics.sh`（覆盖守卫增量）、`tests/p1b-contract.test.ts`（组装部分）。
- 依赖：Task-1。
- 固有风险：组装器对 spike 报告形状的容错（缺 paired 字段的旧报告 → 显式 invalid，不静默）。

- [ ] 组装脚本 + 有效性（含 status 反例）/谓词/provenance 绑定/引用测试。
- [ ] 脚本覆盖守卫 + manifest 断言 + 干跑复验。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理在冻结协议下捕获 pre（`432453f`）与 post（交付 HEAD），生成 statistics.json，按判定规则逐条复核裁决；通过后 pruner 收尾、按路线图集成。规则触发 ESCALATE 时整体升级 Human，不自动撤回。
