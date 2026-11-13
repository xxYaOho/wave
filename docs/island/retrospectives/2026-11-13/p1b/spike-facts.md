# P1b Spike 事实清单（2026-11-12，Human spike 先行裁决落地）

代码种子：提交 29a5d2e + 后续修正（runner 穿线 / compare 配对 / 协议脚本）。演示运行：`/tmp/p1b-spike-evidence/{p1b-pre-spike,p1b-post-spike}.json`（各 3 迭代冒烟）+ comparison-spike.json。

## 已演示事实（SPEC v4 冻结依据）

1. **协议脚本可端到端运行**：`scripts/capture-p1b-statistics.sh` 双锚验证——pre 锚 432453f（worktree 化 → install --frozen-lockfile → lockfile 哈希显式断言匹配 → 旧提交构建 → 三域运行 → smoke → 落盘）与 HEAD 同链路；脏树拒绝运行（实测 "FAIL: tracked files dirty"）；已存在 worktree 拒绝（stale 防护实测）。
2. **归因四层实测**（multi-profile，每迭代新缓存）：loadResource 8 hits/8 misses、dictionary 4/4、**parse 8/20、color 8/8——四层全非零**；night = parse 8/16 + color 8/8 命中但 dictionary/loadResource 0（证实命中条件仅 multi-profile 的修正方向）；single 全零。**FULL-3 F-5「color 结构性零」被实测证伪**（hex 透传不绕过 convertColorSpace 调用链）。
3. **per-sample carrier 解法**：每次 runDesignTokenBenchmarkCase 调用 = 一个样本 = 一个缓存实例；result.cacheAttribution（case 级新字段）承载该样本 trace；domains 层 SUM 聚合跨迭代。
4. **配对合同类型化挂载**：`BenchmarkComparisonCase.paired?: PairedComparisonContract`（只增）——paired-index 与 aggregate-fallback 双路径实测；RI 公式（`median{-d/b : pre_i>0}`）初版写错（双重扣减）**在 spike 内发现并修正**——SPEC v4 直接冻结修正后公式；偶数基数中位数 = 中间两值均值已实现。
5. **legacy compare 零破坏**：compare 输出仅增 paired 字段，既有字段/状态机不动（实测 exit 0 / cases ok）；**token 域 comparison.metric 保持 meanMs 不迁移**（F-2 消解：决策走 paired 合同——其 metric 字段独立标 'p50Ms'，与 legacy operation.comparison 解耦，'comparison contract changed' note 不再出现）。
6. **lockfileHash 来源闭环（F-6）**：脚本显式计算并断言双锚哈希 → statistics.json 的 protocol.lockfileHashes 以**脚本输出**为源（非报告 environment 块——pre 锚报告无该字段）。
7. **3 迭代冒烟时序观察**（非结论）：multi-profile RI ≈ -1%，single/night 噪声占优；缓存 deep-freeze 开销在小 fixture 上可能抵消收益——30 迭代冻结局由判定规则裁决（可能 ESCALATE，即系统如实工作）。

## v4 消解映射输入

FULL-3 F-1→(5)(6)；F-2→(5) 不迁移 metric；F-3→(4) paired 已类型化 + fallback/全函数已实现；F-4→(3) carrier 已解；F-5→(2) 证伪；F-6→(6)；M-1→ 类型以实现为准；M-2→ ruleChecks 固定谓词（multi: RI/PR/dictHits/loadHits；night/single: RI）；M-3→ 有效性断言 samplesMs.length===30+有限值+恰三域+lockfileHashes 非空（脚本源）；M-4→ 放弃五 metric 分发承诺（legacy compare 不动，p50 经 stats.p50Ms + paired 承载）；M-5→ 脚本 stale 防护已实测 + evidence 覆盖检查入脚本；m-1→ null 条件归为全局有效性检查（statistics 层）而非逐域规则行；m-2→ 引用校验 = 相对 evidence 目录存在性 + caseId∈报告。

## v5 清洁重测（2026-11-12，FULL-4 F-1 修复后）

证据：`/tmp/p1b-spike-evidence-v5/`（p1b-{pre,post}-v5.json + capture-manifest×2）。修正：warmup 后 traceSums.clear() → 聚合为纯测量口径（3 迭代）。清洁归因：multi-profile = loadResource 6/6、dictionary 3/3、parse 6/15、color 6/6（四层非零维持）；night = parse 6/12 + color 6/6、dictionary/loadResource 0（编排事实维持）；single 全零。脚本新增：每锚 smoke（pre 锚 432453f 实测执行）、evidence 覆盖守卫、capture manifest（lockfileHash 3d05941e… 与基线 manifest 交叉一致）。脏树/stale worktree 拒绝均实测触发。
