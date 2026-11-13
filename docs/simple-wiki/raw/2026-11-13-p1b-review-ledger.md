---
class: evidence
ingested: true
integrated: true
metadata: ~
---

# STRICT R1 台账 — P1 SPEC

R1 结论：FAIL（FATAL 5 / MAJOR 4 / MINOR 3），基线 HEAD `a4c62c8`。UNVERIFIED：Q0 M2 未集成（p50 / 基线 schema / generateTheme 整链 / Night-only 契约无法确认）；未装依赖，未运行构建/测试；Orca canary 命令与产物未见于计划。

**Human 裁决（2026-11-11）**：全部修正**延后至 Q0 M2 集成后一次完成**（基线证据形式与统计阈值落在真实 M2 契约上），完成后交 **fresh reviewer FULL 重审**（reviewer ESCALATE：结构性修正需 FULL）。本表为 R1 发现的完整存档，修正时逐项消解。

## R1 发现存档

| ID | 级别 | 发现 |
| --- | --- | --- |
| F-1 | FATAL | 颜色 memo key 仅含输入值+目标空间，错误消息内嵌 tokenPath → 同一非法色先在 theme.a 后在 theme.b 会返回 theme.a 的错误路径；SPEC 缺 success-only memo 或 tokenPath 入 key，缺双路径错误测试（`color-space.ts:30-90`、`color-space.test.ts:260-267`） |
| F-2 | FATAL | 依赖字典 memo key 缺 readOnly、资源状态/缓存环境、声明顺序与重复语义——readOnly missing-cache 错误可污染后续可写恢复，或反之；污染/错误合同无保护（`night/emit.ts:132-143`、`resource-loader.ts:39-59`） |
| F-3 | FATAL | base 分组 pass 跨 profile 共享不安全：profile parameter/parameterGroup 改变有效输出，mobile 可能复用 main 的 pass 写入 css-dist 而非 mobile-css-dist；profile 污染仅列为风险、无验收边界（`profile-resolver.ts:631-653`） |
| F-4 | FATAL | 基线不可证伪：无不可变工件/哈希/HEAD/命令/环境元数据要求；现 equivalence 对比的是当前 runner vs 当前 generateTheme 而非 pre/post；改后基线可被覆盖（`benchmarks/design-token/equivalence.ts`） |
| F-5 | FATAL | 统计收益无样本数、阈值/CI、配对方法、p95 回归规则、归因、责任方、回滚点；契约缺 p50，默认 suite 仅 5 迭代——「p50 +1% 且 p95 -30%」无确定保留/撤回结论（`benchmarks/shared/types.ts:25-30`、`stats.ts:3-17`） |
| M-1 | MAJOR | 缓存上下文枚举推迟到实现期——key 安全合同未在施工真源冻结 |
| M-2 | MAJOR | 「文件变化单进程内不可观测」前提错误：loadResource 每次调用 exists/read/parse，同进程内重复的 service/doctor/runner 调用可观测变化；memo 化将冻结陈旧内容且无失效前提（`resource-loader.ts:91-110`） |
| M-3 | MAJOR | Task-4 要求按 M1 memo 层归因，但未定义 memo 命中/未命中计数或阶段级测量 |
| M-4 | MAJOR | check:ci 与真实 Orca canary 无固定命令、环境与报告位置 |
| m-1 | MINOR | frontmatter 仍为「草案/待派遣」（已随裁决更新） |
| m-2 | MINOR | 测试仅命名「对应域文件」，测试归属与审计范围不可直接追溯 |
| m-3 | MINOR | Problem Statement 称 5 个调用点，Decision 2 只列 3 个逻辑调用方，口径不一致 |

## 修正前须裁决的冻结项（reviewer ESCALATE，延后修正时逐项落合同）

1. 完整缓存上下文与错误结果政策（F-1/F-2/M-1）。
2. profile-pass 共享边界（F-3——预期撤回或收窄 Decision 3）。
3. 不可变基线证据形式（F-4）。
4. 收益/撤回统计阈值（F-5）。
5. Q0 benchmark 契约可否扩展（F-4/F-5 落点）。

## FULL 发现存档（R1 后 fresh FULL，FAIL 6F/4M/3m）

| ID | 级别 | 发现 |
| --- | --- | --- |
| F-1 | FATAL | 统计合同不可判定：契约无 p50、无逐样本配对；p50+3%/p95+0% 落入判定死区 |
| F-2 | FATAL | 固定统计命令硬编码 config-group-profiles，新增 p1-* case 不会被运行 |
| F-3 | FATAL | 基线命令含 <mktemp> 占位、无捕获命令、manifest 未锁输入与 dirty 状态、可被重生成覆盖 |
| F-4 | FATAL | 生命周期矛盾：单命令作用域 vs 同进程 service/doctor/runner 多次调用共享，无 reset 语义 |
| F-5 | FATAL | loadResource key 缺 kind/source 输出角色轴，同文件不同派生串用致 schema/receipt 污染 |
| F-6 | FATAL | 归因计数器与逐层回滚无可消费合同（字段/位置/case 关联未定义，多 memo 捆绑） |
| M-1 | MAJOR | base 只读资源集共享边界未锁定 profile 追加资源，无引用完整性 fixture |
| M-2 | MAJOR | 部分失败字典与可变返回对象缓存政策未闭合（issues 是否缓存、冻结或复制） |
| M-3 | MAJOR | 环境元数据不足（缺 bun/node 版本、lockfileHash、orcaInputHash 等），跨环境不可比 |
| M-4 | MAJOR | memo 容量上限与内存代价未定义 |
| m-1/m-2/m-3 | MINOR | 冻结节引用编号错误；基线 JSON 形状/命名未明确；frontmatter 状态滞后 |

→ Human 两项裁决后 v3 全文重写（HEAD 519c8e2），待 fresh FULL-2。

## P1a FULL-3 发现存档（P1a 首轮 FULL，FAIL 3F/6M/3m，2026-11-12）

对 P1a SPEC v4（提交 403523b）。拆分生效（FATAL 5→3），核心为**边界-机制矛盾**：守窄边界则穿线不可达，扩边界则违反禁改清单。两项 ESCALATE 经 Human 裁决（2026-11-12）：①**写边界扩至穿线面**（night/emit.ts 入口、cli/commands/doctor.ts 单行传参、theme-transformer/color-value 链、parser/theme-yaml）；②**benchmark 接线归 P1b + 基线以 mise bun 1.3.6 重捕**。发现类别与 v5 消解映射（蒸馏记录，原文随上下文压缩）：

| 类别 | 消解 |
| --- | --- |
| 边界矛盾（F-1/F-3 类）+ CLI 穿线缺口 | Constraints 写边界扩至穿线面；Decisions 1/2 三入口 + doctor 单行传参 + 颜色五层链 |
| 状态指纹不可靠（F-2/M-1/M-2 类） | 冻结节 1 改内容 SHA256 + canonical JSON 序列化（弃 mtime/size） |
| 基线程序与执行现实漂移（M-3/m-2/m-3 类） | 基线 v2 重捕（提交 d804841）：mise 1.3.6 全程、逐命令 dirty 断言、输出束缚守卫、cachePolicyVersion 序列化、orca 聚合哈希自描述方法 |
| 容量与计数器形状（M-4/m-1 类） | 1024/层 + `stats(layer?)` 访问器形状冻结 |
| benchmark 残留（M-5 类） | Decisions 1 benchmarks 调用点零改动，全部移出归 P1b |
| 解析覆盖缺口 | Decisions 5 覆盖全部 yaml 解析站点（theme-pipeline:146 / theme-service:33 / workspace-loader:249,339，行号已按实源校正） |

v5 全文修订后待 fresh FULL-4。

## P1a FULL-4 发现存档（FAIL 1F/1M/3m，2026-11-12）

对 P1a SPEC v5（97dde67，fresh reviewer max）。收敛显著（3F/6M/3m → 1F/1M/3m）。台账与消解：

| ID | 级别 | 发现 | 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | Doctor 穿线与硬写边界冲突：C1 懒加载重构后 `doctor.ts` 仅剩 action 壳，实际调用在 `doctor-action.ts:244`（collectDependencyDictionary）与 `:433`（validateDeclaredResources），未获白名单授权；守边界则穿线缺失，完成则越界（锚⑥） | 真缺陷（v5 基于旧布局撰写，rebase 换入 C1 版图）。主代理确认授权映射：扩边界裁决穿线面承接至 `doctor-action.ts`；v6 Constraints/Decisions/Task-1/Draft 全部改引，`doctor.ts` 壳零改动 |
| M-1 | MAJOR | 基线 orca 聚合哈希按声明方法不可复现（reviewer 得 f02fea16，记录 a58d0d5e）；32/32 产物哈希与 v1 对照均通过，不判不可证伪 | 证据缺陷。主代理根目录重算**精确复现 a58d0d5e**（含 .DS_Store 变体为另一值亦非 f02fea16）→ 差异归因非根目录调用；915364b 将方法升级为字面命令（cd 钉死）+ 27 逐文件哈希入库，诊断记入 provenance |
| m-1 | MINOR | 链路与覆盖表述不精确：颜色链实为 pass-preparer:45 → theme-pipeline:207 → …；四解析站点真实存在但非全部（另有 profile-resolver:543、night/emit:73、doctor/theme-context:139） | v6 按实源改引链路；Decision 5 改显式授权子集（6 站点，theme-context:139 显式排除归 P1b） |
| m-2 | MINOR | stats/容量口径空白：layer 合法值、溢出后命中行为、misses/degraded 重叠未定义 | 冻结节 4 补齐：四层枚举；溢出 = 保留条目但不再新增/命中、不可逆；互斥三分计数（hits/misses/degraded，misses+degraded=直读），测试锁定 |
| m-3 | MINOR | Task-2「必要 fixture」未映射白名单（与仅允许 tests/p1a-*.test.ts 冲突） | Task-2 明确：测试内嵌 / 运行时临时目录，不新建 tests/fixtures 文件；不可行则 BLOCKED 报主代理 |

UNVERIFIED（静态审查限界，施工 gate 验证）：历史 tracked-clean 断言、内存峰值、逐层撤回实际效果。ESCALATE 两项已由主代理处理（F-1 授权映射确认、M-1 哈希诊断+915364b）。v6 DELTA 后同 reviewer 复核。

## P1a DELTA 复核（PASS，2026-11-12，同 reviewer）

verdict：**PASS | FATAL 0 / MAJOR 1 / MINOR 1**。F-1 RESOLVED（doctor-action 承接映射六处统一，实源 :244/:433 吻合）；m-2/m-3 RESOLVED（容量口径 / fixture 政策）；m-1 PARTIAL→carry（Draft 清单缺 profile-resolver.ts）。M-1 保留 carry：reviewer 实证根因为 **sort locale**（LC_ALL=C → f02fea16 / LC_ALL=en_US.UTF-8 → a58d0d5e，27/27 文件哈希一致），主代理此前「非根目录调用」归因撤回。**生命周期闭环，SPEC 冻结。**

**Carry 关闭（Task-1 消费前）**：M-1 → `a3aee88`（方法钉 LC_ALL=en_US.UTF-8 + provenance 撤回误判，记录值不变，无需重捕）；m-1 → `d948ac0`（Draft 清单补 profile-resolver.ts，与 Constraints 授权对齐）。**台账全清，SPEC v6 冻结（d948ac0），Milestone-1 待施工派遣。**

## P1b FULL-1 发现存档（FAIL 5F/3M/0m，2026-11-12）

对 P1b SPEC v1（530c3a1，fresh reviewer max）。六项源码断言经主代理逐一核验全部属实。与 P1 早期同款失误：对未核实的内部结构立约（被测路径不走 generateTheme）。消解映射（v2）：

| ID | 级别 | 发现 | v2 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | p50Ms/lockfileHash 写成必填，违反只增（types.ts:65-90） | 全部改可选 `?:`（Decisions 1） |
| F-2 | FATAL | pairedDeltasMs 是 ms 却与 -5% 比较，无分母定义（DEC 6） | 公式化：`medianRelativeImprovement`/`p95RelativeRegression` 分数 + pre_i ≤ 0 分母守卫 + `excludedNonPositiveBaseline` 计数（Decisions 3/6） |
| F-3 | FATAL | 捕获无字面命令；`benchmarks/run.ts` 不解析 --no-equivalence 且三域由 domains/suite.ts 执行；smoke 无断言；pre 依赖无闭环 | 主代理核验 run.ts 旗标面（iterations/warmup/run-id/results-dir/domain 全有，零改动）；协议字面命令化（Decisions 7）；--no-equivalence 需求撤销（域路径无等价开销），smoke = design-token run default 模式 exit 0 断言；pre 锚 install --frozen-lockfile + lockfile 哈希断言闭环 |
| F-4 | FATAL | 归因接线不可达：被测路径 = runner 低层调用（runner.ts:204-243），不走 generateTheme；改走 generateTheme 则变更计时路径 | 接线改 runner 层：每-迭代 createTokenCache 传入 `loadDesignTokenWorkspace(..., cache)`/`collectDependencyDictionary(..., cache)`（P1a 可选尾参已核验存在）；生产 src/** 零改动；测量语义声明入 Decisions 4 |
| F-5 | FATAL | 回退未定义（pairedDeltas/win/loss/tie 填充）；PairedComparisonContract 挂载点缺失 | 回退显式填充（空数组/零/null）；挂载 = statistics.json cases[].paired + compare 输出可选 paired 字段（Decisions 3/7） |
| M-1 | MAJOR | compare.ts:161-175 固定读 meanMs，无 metric 分发/p50 字段/statistics.json 消费合同 | metric 分发（五 metric）+ 可选 p50DeltaMs + statistics.json schema 具体化（Decisions 3/7） |
| M-2 | MAJOR | suite/domain 只留末次迭代为 primary，单个 cacheAttribution 不代表 30 样本 | 域级 SUM 聚合口径冻结（仅测量迭代、warmup 排除；Decisions 5） |
| M-3 | MAJOR | ThemeGenerationResult 多失败早返，失败缺字段/部分失败行为未定义 | generateTheme 触点整体撤销（F-4 连带）→ 无构造点问题；残余 = 捕获有效性规则：任一域失败/缺 samplesMs → 捕获无效重捕，statistics.json 仅由完整成功捕获构建（Decisions 7） |

v2 后 fresh FULL-2（结构性修正）。

## P1b FULL-2 发现存档（FAIL 5F/3M/0m，2026-11-12）

对 P1b SPEC v2（2c2f3fc，fresh reviewer max）。收敛评估：v1-F1（必填违约）与 v1-M2（聚合口径）已消解；v1-F4（归因不可达）降级为 M-1（接线不全）——实质收窄但引入新 FATAL（早停警戒：若 v3 再引入且旧未清即硬停升级）。全部引用经主代理核验属实。消解映射（v3）：

| ID | 级别 | 发现 | v3 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | night 命中门槛不可达：night 域 includeProfiles=false，runner 单字典收集即复用（:222-243→:296-299），新缓存每迭代 → 命中恒零，retained 不可达 | 判定规则按可满足性重设计：命中条件仅 multi-profile 域（编排事实入 SPEC）；night/single 仅 RI 阈值（Decisions 6） |
| F-2 | FATAL | 协议仍含占位（`<evidence>`/同上/`<head8>`）、hash 注释无比较、无 set -e/显式断言 | 协议升级为脚本交付物 `scripts/capture-p1b-statistics.sh`（set -euo pipefail、显式比较命令、绝对路径、失败透传；SPEC 不再承载散文命令，Decisions 7） |
| F-3 | FATAL | lockfileHash 边界矛盾：收集器真身在 environment.ts（非 stats.ts），越写边界 | environment.ts 入写边界；Decisions 2 修正归属 |
| F-4 | FATAL | RI 非全函数：正基线集为空时无定义；偶数基数中位数未声明 | 全函数化：`positiveBaselineCount` + 空集 → null → 规则 null 分支 → ESCALATE；偶数基数 = 中间两值算术平均（Decisions 3/6） |
| F-5 | FATAL | PairedComparisonContract 无类型化挂载：compare.ts 实际输出无 paired 字段；statistics.json 生成不确定 | `BenchmarkComparisonCase` 增可选 `paired?: PairedComparisonContract` 类型化挂载；statistics.json paired 即同一 interface 无第二形状（Decisions 1/7） |
| M-1 | MAJOR | 归因只穿两调用点；parseProfileDocument（:225/:235）/prepareBuildPass 未接线 → parse/color 恒零 | 全部 cache 接受调用点穿线 + 四层非零单元断言（Decisions 4/Testing） |
| M-2 | MAJOR | token 域 comparison.metric 仍 meanMs（:170-174）；五 metric 只测三；缺 p50 遗留行为未定义 | token 域 metric 切 p50Ms（单行，Task-1）；五 metric 分发全测；p50 缺失走既有 mean 通道不回归（Decisions 3/Testing） |
| M-3 | MAJOR | statistics schema 无类型/引用格式；不要求三域齐/lockfileHash 非空 | 完整 TS 形状（40-hex/64-hex/引用/恰三域/lockfileHash 非空强制入有效性规则）（Decisions 7） |

v3 后 fresh FULL-3（修正轮 2——早停警戒轮）。

## P1b FULL-3 发现存档（FAIL 6F/5M/2m，2026-11-12）——早停

对 P1b SPEC v3（a0a307f，fresh reviewer max）。**两条早停判据同时点燃**：①协议实质 FATAL 三连未缩小（F-3→F-2→F-1：占位符/无断言/--paired 不存在）；②连续两轮旧 FATAL 未清且引入新 FATAL（v2 引入门槛类、v3 引入 metric 迁移/逐样本承接/color 门槛/lockfileHash 来源）。**飞轮硬停，升级 Human 裁决。**

发现类别（蒸馏）：F-1 协议仍占位且 compare.ts 无 --paired、smoke 无固定参数；F-2 pre（432453f）metric=meanMs 且无 p50 → post 切 p50Ms 的跨锚迁移使 compare 判「contract changed」；F-3 paired 挂载非全函数（fallback 挂载规则缺、postP95 null 未守）；F-4 逐样本 trace 无 per-sample carrier（types 只加 case 级字段，domains 只留 primary）；F-5 固定 fixture 无 colorSpace、targetFormat=hex 时 color-value 直接返回 → color 层结构性零查找，四层非零验收不可满足；F-6 pre 锚无 lockfileHash 字段来源（报告 or 脚本 manifest）→ 有效性不可判定；M-1 契约字段类型省略；M-2 ruleChecks 无固定谓词集；M-3 有效性未断言样本数=30/有限值；M-4 metric 分发输出形状未闭合；M-5 协议重跑无清理/唯一性/stale 防护；m-1 PR null 全局条件与逐域规则层次不一致；m-2 report 引用无存在性/一致性校验。

**根因判定**：与原 P1 四轮未收敛同源——统计测量契约与 benchmark 机械内部深度耦合，每轮修正确认一批事实又揭开一批未知。P1b 三轮轨迹 5→5→6。待 Human 裁决继续策略（spike 先行 / 更薄冻结 / 再拆分 / 授权放闸门）。
## 判定规则预注册（Human 裁决 2026-11-12，先于 30 迭代正式捕获封版）

Human 采纳修订阈值（「memo 价值超越速度」立场）：multi-profile **RI ≥ 0 且 PR ≤ +10% 且 dictionary/loadResource 命中佐证**；night **RI ≥ 0**；single **RI ≥ −3%**；全局安全地板 **任一域 RI < −10% → escalate**；RI-non-null 有效性维持。命中原阈值（v3–v5 文本：multi/night RI ≥ +5%、PR ≤ +5%、single ≥ −3%）作废。规则文本落 SPEC v6（FULL-5 verdict 后随其余修订一并）；30 迭代正式捕获以本记录为准——捕获开始后规则封版不可调整。FULL-5 已收 MAJOR-3（globalRuleChecks 归属字段缺失）——v6 一并落（schema 增 globalRuleChecks: Array，全局行从 cases[] 移出）。

## P1b FULL-5 发现存档（FAIL 1F/3M/3m，2026-11-12）——轨迹 5→5→6→3→1 单调收敛

F-1 manifest 缺 node/负载 provenance（SPEC:31 vs script:137-150 漂移）→ v6 manifest 补 runtime{bun/node/platform/arch} + hostLoad{load1mAtStart, note}；M-1 lockfileHashes 绑定深度 → compose 逐字取自 capture manifest；M-2 paired provenance 绑定 → runId/paired 一致性校验入 compose；M-3 RI-non-null 行归属 → globalRuleChecks 独立字段（固定两行）；m×3 文案/--repo-root 残留 → 清理。**Human 预注册裁决同期落稿**：阈值修订（multi RI≥0/PR≤0.10/命中、night RI≥0、single ≥−0.03、地板 −0.10）。v6（33241fc）后 fresh FULL-6（修正轮 2/新生命周期）。

## P1b FULL-8（FAIL 2F/1M/1m，2026-11-13）→ **Human 裁决闸门兜底收场（2026-11-13）——spike 生命周期闭案**

轨迹定案：5→5→6→3→1→2→1→2（八轮）。Human 确认三点方法论（精度承载于可执行工件/轮次封顶+预承诺兜底/审查导向实证可查项）并裁定不再起审查轮：**v8 冻结，FULL-8 四项转 gate 实证清单**——①manifest runtime.node = 报告 environment.node（版本源真实）②hostLoad 双平台探针非空且起测于捕获前（空值 = 捕获失败）③compose 字面调用零占位符（HEAD8 变量代入）④verdict 优先级封版（validity 先行 → invalid；safety-floor 仅 valid 时评估，fail → escalate）。闸门以实跑验证。**P1b 施工派遣（harness 已有 spike 种子，Task 增量 = p50Ms/组装器/守卫/测试锁定）。**

## P1b M1 闸门（2026-11-13）

主代理独立复验：statistics.json validity 四项全 true；gate 清单四项落地实证（runtime.node=process.version d51d2a9 / hostLoad 起止双采样 / compose 零占位符 HEAD8 变量 / validity 先行优先级）；check:ci 全绿（1310 pass——ESCALATE 项为基线证据 Biome 排除，P1a 先例修复）。**M1 闸门通过；statistics.json verdict = escalate 按预注册规则如实触发，提交 Human 逐层撤回裁决。**


---

# STRICT R1 台账 — P1 SPEC

R1 结论：FAIL（FATAL 5 / MAJOR 4 / MINOR 3），基线 HEAD `a4c62c8`。UNVERIFIED：Q0 M2 未集成（p50 / 基线 schema / generateTheme 整链 / Night-only 契约无法确认）；未装依赖，未运行构建/测试；Orca canary 命令与产物未见于计划。

**Human 裁决（2026-11-11）**：全部修正**延后至 Q0 M2 集成后一次完成**（基线证据形式与统计阈值落在真实 M2 契约上），完成后交 **fresh reviewer FULL 重审**（reviewer ESCALATE：结构性修正需 FULL）。本表为 R1 发现的完整存档，修正时逐项消解。

## R1 发现存档

| ID | 级别 | 发现 |
| --- | --- | --- |
| F-1 | FATAL | 颜色 memo key 仅含输入值+目标空间，错误消息内嵌 tokenPath → 同一非法色先在 theme.a 后在 theme.b 会返回 theme.a 的错误路径；SPEC 缺 success-only memo 或 tokenPath 入 key，缺双路径错误测试（`color-space.ts:30-90`、`color-space.test.ts:260-267`） |
| F-2 | FATAL | 依赖字典 memo key 缺 readOnly、资源状态/缓存环境、声明顺序与重复语义——readOnly missing-cache 错误可污染后续可写恢复，或反之；污染/错误合同无保护（`night/emit.ts:132-143`、`resource-loader.ts:39-59`） |
| F-3 | FATAL | base 分组 pass 跨 profile 共享不安全：profile parameter/parameterGroup 改变有效输出，mobile 可能复用 main 的 pass 写入 css-dist 而非 mobile-css-dist；profile 污染仅列为风险、无验收边界（`profile-resolver.ts:631-653`） |
| F-4 | FATAL | 基线不可证伪：无不可变工件/哈希/HEAD/命令/环境元数据要求；现 equivalence 对比的是当前 runner vs 当前 generateTheme 而非 pre/post；改后基线可被覆盖（`benchmarks/design-token/equivalence.ts`） |
| F-5 | FATAL | 统计收益无样本数、阈值/CI、配对方法、p95 回归规则、归因、责任方、回滚点；契约缺 p50，默认 suite 仅 5 迭代——「p50 +1% 且 p95 -30%」无确定保留/撤回结论（`benchmarks/shared/types.ts:25-30`、`stats.ts:3-17`） |
| M-1 | MAJOR | 缓存上下文枚举推迟到实现期——key 安全合同未在施工真源冻结 |
| M-2 | MAJOR | 「文件变化单进程内不可观测」前提错误：loadResource 每次调用 exists/read/parse，同进程内重复的 service/doctor/runner 调用可观测变化；memo 化将冻结陈旧内容且无失效前提（`resource-loader.ts:91-110`） |
| M-3 | MAJOR | Task-4 要求按 M1 memo 层归因，但未定义 memo 命中/未命中计数或阶段级测量 |
| M-4 | MAJOR | check:ci 与真实 Orca canary 无固定命令、环境与报告位置 |
| m-1 | MINOR | frontmatter 仍为「草案/待派遣」（已随裁决更新） |
| m-2 | MINOR | 测试仅命名「对应域文件」，测试归属与审计范围不可直接追溯 |
| m-3 | MINOR | Problem Statement 称 5 个调用点，Decision 2 只列 3 个逻辑调用方，口径不一致 |

## 修正前须裁决的冻结项（reviewer ESCALATE，延后修正时逐项落合同）

1. 完整缓存上下文与错误结果政策（F-1/F-2/M-1）。
2. profile-pass 共享边界（F-3——预期撤回或收窄 Decision 3）。
3. 不可变基线证据形式（F-4）。
4. 收益/撤回统计阈值（F-5）。
5. Q0 benchmark 契约可否扩展（F-4/F-5 落点）。

## FULL 发现存档（R1 后 fresh FULL，FAIL 6F/4M/3m）

| ID | 级别 | 发现 |
| --- | --- | --- |
| F-1 | FATAL | 统计合同不可判定：契约无 p50、无逐样本配对；p50+3%/p95+0% 落入判定死区 |
| F-2 | FATAL | 固定统计命令硬编码 config-group-profiles，新增 p1-* case 不会被运行 |
| F-3 | FATAL | 基线命令含 <mktemp> 占位、无捕获命令、manifest 未锁输入与 dirty 状态、可被重生成覆盖 |
| F-4 | FATAL | 生命周期矛盾：单命令作用域 vs 同进程 service/doctor/runner 多次调用共享，无 reset 语义 |
| F-5 | FATAL | loadResource key 缺 kind/source 输出角色轴，同文件不同派生串用致 schema/receipt 污染 |
| F-6 | FATAL | 归因计数器与逐层回滚无可消费合同（字段/位置/case 关联未定义，多 memo 捆绑） |
| M-1 | MAJOR | base 只读资源集共享边界未锁定 profile 追加资源，无引用完整性 fixture |
| M-2 | MAJOR | 部分失败字典与可变返回对象缓存政策未闭合（issues 是否缓存、冻结或复制） |
| M-3 | MAJOR | 环境元数据不足（缺 bun/node 版本、lockfileHash、orcaInputHash 等），跨环境不可比 |
| M-4 | MAJOR | memo 容量上限与内存代价未定义 |
| m-1/m-2/m-3 | MINOR | 冻结节引用编号错误；基线 JSON 形状/命名未明确；frontmatter 状态滞后 |

→ Human 两项裁决后 v3 全文重写（HEAD 519c8e2），待 fresh FULL-2。

## P1a FULL-3 发现存档（P1a 首轮 FULL，FAIL 3F/6M/3m，2026-11-12）

对 P1a SPEC v4（提交 403523b）。拆分生效（FATAL 5→3），核心为**边界-机制矛盾**：守窄边界则穿线不可达，扩边界则违反禁改清单。两项 ESCALATE 经 Human 裁决（2026-11-12）：①**写边界扩至穿线面**（night/emit.ts 入口、cli/commands/doctor.ts 单行传参、theme-transformer/color-value 链、parser/theme-yaml）；②**benchmark 接线归 P1b + 基线以 mise bun 1.3.6 重捕**。发现类别与 v5 消解映射（蒸馏记录，原文随上下文压缩）：

| 类别 | 消解 |
| --- | --- |
| 边界矛盾（F-1/F-3 类）+ CLI 穿线缺口 | Constraints 写边界扩至穿线面；Decisions 1/2 三入口 + doctor 单行传参 + 颜色五层链 |
| 状态指纹不可靠（F-2/M-1/M-2 类） | 冻结节 1 改内容 SHA256 + canonical JSON 序列化（弃 mtime/size） |
| 基线程序与执行现实漂移（M-3/m-2/m-3 类） | 基线 v2 重捕（提交 d804841）：mise 1.3.6 全程、逐命令 dirty 断言、输出束缚守卫、cachePolicyVersion 序列化、orca 聚合哈希自描述方法 |
| 容量与计数器形状（M-4/m-1 类） | 1024/层 + `stats(layer?)` 访问器形状冻结 |
| benchmark 残留（M-5 类） | Decisions 1 benchmarks 调用点零改动，全部移出归 P1b |
| 解析覆盖缺口 | Decisions 5 覆盖全部 yaml 解析站点（theme-pipeline:146 / theme-service:33 / workspace-loader:249,339，行号已按实源校正） |

v5 全文修订后待 fresh FULL-4。

## P1a FULL-4 发现存档（FAIL 1F/1M/3m，2026-11-12）

对 P1a SPEC v5（97dde67，fresh reviewer max）。收敛显著（3F/6M/3m → 1F/1M/3m）。台账与消解：

| ID | 级别 | 发现 | 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | Doctor 穿线与硬写边界冲突：C1 懒加载重构后 `doctor.ts` 仅剩 action 壳，实际调用在 `doctor-action.ts:244`（collectDependencyDictionary）与 `:433`（validateDeclaredResources），未获白名单授权；守边界则穿线缺失，完成则越界（锚⑥） | 真缺陷（v5 基于旧布局撰写，rebase 换入 C1 版图）。主代理确认授权映射：扩边界裁决穿线面承接至 `doctor-action.ts`；v6 Constraints/Decisions/Task-1/Draft 全部改引，`doctor.ts` 壳零改动 |
| M-1 | MAJOR | 基线 orca 聚合哈希按声明方法不可复现（reviewer 得 f02fea16，记录 a58d0d5e）；32/32 产物哈希与 v1 对照均通过，不判不可证伪 | 证据缺陷。主代理根目录重算**精确复现 a58d0d5e**（含 .DS_Store 变体为另一值亦非 f02fea16）→ 差异归因非根目录调用；915364b 将方法升级为字面命令（cd 钉死）+ 27 逐文件哈希入库，诊断记入 provenance |
| m-1 | MINOR | 链路与覆盖表述不精确：颜色链实为 pass-preparer:45 → theme-pipeline:207 → …；四解析站点真实存在但非全部（另有 profile-resolver:543、night/emit:73、doctor/theme-context:139） | v6 按实源改引链路；Decision 5 改显式授权子集（6 站点，theme-context:139 显式排除归 P1b） |
| m-2 | MINOR | stats/容量口径空白：layer 合法值、溢出后命中行为、misses/degraded 重叠未定义 | 冻结节 4 补齐：四层枚举；溢出 = 保留条目但不再新增/命中、不可逆；互斥三分计数（hits/misses/degraded，misses+degraded=直读），测试锁定 |
| m-3 | MINOR | Task-2「必要 fixture」未映射白名单（与仅允许 tests/p1a-*.test.ts 冲突） | Task-2 明确：测试内嵌 / 运行时临时目录，不新建 tests/fixtures 文件；不可行则 BLOCKED 报主代理 |

UNVERIFIED（静态审查限界，施工 gate 验证）：历史 tracked-clean 断言、内存峰值、逐层撤回实际效果。ESCALATE 两项已由主代理处理（F-1 授权映射确认、M-1 哈希诊断+915364b）。v6 DELTA 后同 reviewer 复核。

## P1a DELTA 复核（PASS，2026-11-12，同 reviewer）

verdict：**PASS | FATAL 0 / MAJOR 1 / MINOR 1**。F-1 RESOLVED（doctor-action 承接映射六处统一，实源 :244/:433 吻合）；m-2/m-3 RESOLVED（容量口径 / fixture 政策）；m-1 PARTIAL→carry（Draft 清单缺 profile-resolver.ts）。M-1 保留 carry：reviewer 实证根因为 **sort locale**（LC_ALL=C → f02fea16 / LC_ALL=en_US.UTF-8 → a58d0d5e，27/27 文件哈希一致），主代理此前「非根目录调用」归因撤回。**生命周期闭环，SPEC 冻结。**

**Carry 关闭（Task-1 消费前）**：M-1 → `a3aee88`（方法钉 LC_ALL=en_US.UTF-8 + provenance 撤回误判，记录值不变，无需重捕）；m-1 → `d948ac0`（Draft 清单补 profile-resolver.ts，与 Constraints 授权对齐）。**台账全清，SPEC v6 冻结（d948ac0），Milestone-1 待施工派遣。**

## P1b FULL-1 发现存档（FAIL 5F/3M/0m，2026-11-12）

对 P1b SPEC v1（530c3a1，fresh reviewer max）。六项源码断言经主代理逐一核验全部属实。与 P1 早期同款失误：对未核实的内部结构立约（被测路径不走 generateTheme）。消解映射（v2）：

| ID | 级别 | 发现 | v2 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | p50Ms/lockfileHash 写成必填，违反只增（types.ts:65-90） | 全部改可选 `?:`（Decisions 1） |
| F-2 | FATAL | pairedDeltasMs 是 ms 却与 -5% 比较，无分母定义（DEC 6） | 公式化：`medianRelativeImprovement`/`p95RelativeRegression` 分数 + pre_i ≤ 0 分母守卫 + `excludedNonPositiveBaseline` 计数（Decisions 3/6） |
| F-3 | FATAL | 捕获无字面命令；`benchmarks/run.ts` 不解析 --no-equivalence 且三域由 domains/suite.ts 执行；smoke 无断言；pre 依赖无闭环 | 主代理核验 run.ts 旗标面（iterations/warmup/run-id/results-dir/domain 全有，零改动）；协议字面命令化（Decisions 7）；--no-equivalence 需求撤销（域路径无等价开销），smoke = design-token run default 模式 exit 0 断言；pre 锚 install --frozen-lockfile + lockfile 哈希断言闭环 |
| F-4 | FATAL | 归因接线不可达：被测路径 = runner 低层调用（runner.ts:204-243），不走 generateTheme；改走 generateTheme 则变更计时路径 | 接线改 runner 层：每-迭代 createTokenCache 传入 `loadDesignTokenWorkspace(..., cache)`/`collectDependencyDictionary(..., cache)`（P1a 可选尾参已核验存在）；生产 src/** 零改动；测量语义声明入 Decisions 4 |
| F-5 | FATAL | 回退未定义（pairedDeltas/win/loss/tie 填充）；PairedComparisonContract 挂载点缺失 | 回退显式填充（空数组/零/null）；挂载 = statistics.json cases[].paired + compare 输出可选 paired 字段（Decisions 3/7） |
| M-1 | MAJOR | compare.ts:161-175 固定读 meanMs，无 metric 分发/p50 字段/statistics.json 消费合同 | metric 分发（五 metric）+ 可选 p50DeltaMs + statistics.json schema 具体化（Decisions 3/7） |
| M-2 | MAJOR | suite/domain 只留末次迭代为 primary，单个 cacheAttribution 不代表 30 样本 | 域级 SUM 聚合口径冻结（仅测量迭代、warmup 排除；Decisions 5） |
| M-3 | MAJOR | ThemeGenerationResult 多失败早返，失败缺字段/部分失败行为未定义 | generateTheme 触点整体撤销（F-4 连带）→ 无构造点问题；残余 = 捕获有效性规则：任一域失败/缺 samplesMs → 捕获无效重捕，statistics.json 仅由完整成功捕获构建（Decisions 7） |

v2 后 fresh FULL-2（结构性修正）。

## P1b FULL-2 发现存档（FAIL 5F/3M/0m，2026-11-12）

对 P1b SPEC v2（2c2f3fc，fresh reviewer max）。收敛评估：v1-F1（必填违约）与 v1-M2（聚合口径）已消解；v1-F4（归因不可达）降级为 M-1（接线不全）——实质收窄但引入新 FATAL（早停警戒：若 v3 再引入且旧未清即硬停升级）。全部引用经主代理核验属实。消解映射（v3）：

| ID | 级别 | 发现 | v3 消解 |
| --- | --- | --- | --- |
| F-1 | FATAL | night 命中门槛不可达：night 域 includeProfiles=false，runner 单字典收集即复用（:222-243→:296-299），新缓存每迭代 → 命中恒零，retained 不可达 | 判定规则按可满足性重设计：命中条件仅 multi-profile 域（编排事实入 SPEC）；night/single 仅 RI 阈值（Decisions 6） |
| F-2 | FATAL | 协议仍含占位（`<evidence>`/同上/`<head8>`）、hash 注释无比较、无 set -e/显式断言 | 协议升级为脚本交付物 `scripts/capture-p1b-statistics.sh`（set -euo pipefail、显式比较命令、绝对路径、失败透传；SPEC 不再承载散文命令，Decisions 7） |
| F-3 | FATAL | lockfileHash 边界矛盾：收集器真身在 environment.ts（非 stats.ts），越写边界 | environment.ts 入写边界；Decisions 2 修正归属 |
| F-4 | FATAL | RI 非全函数：正基线集为空时无定义；偶数基数中位数未声明 | 全函数化：`positiveBaselineCount` + 空集 → null → 规则 null 分支 → ESCALATE；偶数基数 = 中间两值算术平均（Decisions 3/6） |
| F-5 | FATAL | PairedComparisonContract 无类型化挂载：compare.ts 实际输出无 paired 字段；statistics.json 生成不确定 | `BenchmarkComparisonCase` 增可选 `paired?: PairedComparisonContract` 类型化挂载；statistics.json paired 即同一 interface 无第二形状（Decisions 1/7） |
| M-1 | MAJOR | 归因只穿两调用点；parseProfileDocument（:225/:235）/prepareBuildPass 未接线 → parse/color 恒零 | 全部 cache 接受调用点穿线 + 四层非零单元断言（Decisions 4/Testing） |
| M-2 | MAJOR | token 域 comparison.metric 仍 meanMs（:170-174）；五 metric 只测三；缺 p50 遗留行为未定义 | token 域 metric 切 p50Ms（单行，Task-1）；五 metric 分发全测；p50 缺失走既有 mean 通道不回归（Decisions 3/Testing） |
| M-3 | MAJOR | statistics schema 无类型/引用格式；不要求三域齐/lockfileHash 非空 | 完整 TS 形状（40-hex/64-hex/引用/恰三域/lockfileHash 非空强制入有效性规则）（Decisions 7） |

v3 后 fresh FULL-3（修正轮 2——早停警戒轮）。

## P1b FULL-3 发现存档（FAIL 6F/5M/2m，2026-11-12）——早停

对 P1b SPEC v3（a0a307f，fresh reviewer max）。**两条早停判据同时点燃**：①协议实质 FATAL 三连未缩小（F-3→F-2→F-1：占位符/无断言/--paired 不存在）；②连续两轮旧 FATAL 未清且引入新 FATAL（v2 引入门槛类、v3 引入 metric 迁移/逐样本承接/color 门槛/lockfileHash 来源）。**飞轮硬停，升级 Human 裁决。**

发现类别（蒸馏）：F-1 协议仍占位且 compare.ts 无 --paired、smoke 无固定参数；F-2 pre（432453f）metric=meanMs 且无 p50 → post 切 p50Ms 的跨锚迁移使 compare 判「contract changed」；F-3 paired 挂载非全函数（fallback 挂载规则缺、postP95 null 未守）；F-4 逐样本 trace 无 per-sample carrier（types 只加 case 级字段，domains 只留 primary）；F-5 固定 fixture 无 colorSpace、targetFormat=hex 时 color-value 直接返回 → color 层结构性零查找，四层非零验收不可满足；F-6 pre 锚无 lockfileHash 字段来源（报告 or 脚本 manifest）→ 有效性不可判定；M-1 契约字段类型省略；M-2 ruleChecks 无固定谓词集；M-3 有效性未断言样本数=30/有限值；M-4 metric 分发输出形状未闭合；M-5 协议重跑无清理/唯一性/stale 防护；m-1 PR null 全局条件与逐域规则层次不一致；m-2 report 引用无存在性/一致性校验。

**根因判定**：与原 P1 四轮未收敛同源——统计测量契约与 benchmark 机械内部深度耦合，每轮修正确认一批事实又揭开一批未知。P1b 三轮轨迹 5→5→6。待 Human 裁决继续策略（spike 先行 / 更薄冻结 / 再拆分 / 授权放闸门）。
## 判定规则预注册（Human 裁决 2026-11-12，先于 30 迭代正式捕获封版）

Human 采纳修订阈值（「memo 价值超越速度」立场）：multi-profile **RI ≥ 0 且 PR ≤ +10% 且 dictionary/loadResource 命中佐证**；night **RI ≥ 0**；single **RI ≥ −3%**；全局安全地板 **任一域 RI < −10% → escalate**；RI-non-null 有效性维持。命中原阈值（v3–v5 文本：multi/night RI ≥ +5%、PR ≤ +5%、single ≥ −3%）作废。规则文本落 SPEC v6（FULL-5 verdict 后随其余修订一并）；30 迭代正式捕获以本记录为准——捕获开始后规则封版不可调整。FULL-5 已收 MAJOR-3（globalRuleChecks 归属字段缺失）——v6 一并落（schema 增 globalRuleChecks: Array，全局行从 cases[] 移出）。

## P1b FULL-5 发现存档（FAIL 1F/3M/3m，2026-11-12）——轨迹 5→5→6→3→1 单调收敛

F-1 manifest 缺 node/负载 provenance（SPEC:31 vs script:137-150 漂移）→ v6 manifest 补 runtime{bun/node/platform/arch} + hostLoad{load1mAtStart, note}；M-1 lockfileHashes 绑定深度 → compose 逐字取自 capture manifest；M-2 paired provenance 绑定 → runId/paired 一致性校验入 compose；M-3 RI-non-null 行归属 → globalRuleChecks 独立字段（固定两行）；m×3 文案/--repo-root 残留 → 清理。**Human 预注册裁决同期落稿**：阈值修订（multi RI≥0/PR≤0.10/命中、night RI≥0、single ≥−0.03、地板 −0.10）。v6（33241fc）后 fresh FULL-6（修正轮 2/新生命周期）。

## P1b FULL-8（FAIL 2F/1M/1m，2026-11-13）→ **Human 裁决闸门兜底收场（2026-11-13）——spike 生命周期闭案**

轨迹定案：5→5→6→3→1→2→1→2（八轮）。Human 确认三点方法论（精度承载于可执行工件/轮次封顶+预承诺兜底/审查导向实证可查项）并裁定不再起审查轮：**v8 冻结，FULL-8 四项转 gate 实证清单**——①manifest runtime.node = 报告 environment.node（版本源真实）②hostLoad 双平台探针非空且起测于捕获前（空值 = 捕获失败）③compose 字面调用零占位符（HEAD8 变量代入）④verdict 优先级封版（validity 先行 → invalid；safety-floor 仅 valid 时评估，fail → escalate）。闸门以实跑验证。**P1b 施工派遣（harness 已有 spike 种子，Task 增量 = p50Ms/组装器/守卫/测试锁定）。**

## P1b M1 闸门（2026-11-13）

主代理独立复验：statistics.json validity 四项全 true；gate 清单四项落地实证（runtime.node=process.version d51d2a9 / hostLoad 起止双采样 / compose 零占位符 HEAD8 变量 / validity 先行优先级）；check:ci 全绿（1310 pass——ESCALATE 项为基线证据 Biome 排除，P1a 先例修复）。**M1 闸门通过；statistics.json verdict = escalate 按预注册规则如实触发，提交 Human 逐层撤回裁决。**
