---
date: 2026-09-29
state: 施工中
dispatch: M1/M2 DONE（gate PASS，HEAD e930694）
---

# profile-override Plan

## Problem Statement

当前 `profiles/<name>.yaml` 是独立完整的 token 文档，与 `main.yaml` 的 token 树零关系（仅继承 `$config`）。这带来三个真实问题：

1. **维护漂移**：profile 复制整棵 token 树，base 改一个值需要手动同步 N 个 profile；sketch path 等 `$extensions` 在每个 profile token 上逐条重复。
2. **身份核对困难**：开发 Sketch plugin 时，profile 构建产物与 base 共享同一个文档级 `$id`（`meta.themeId`），插件无法区分主题身份，也无法核对 theme 与 base 的归属关系。
3. **创建成本高**：新建 profile 需要手写整份文档，没有从 base 派生的起点。

## Solution

把 base 与 profile 的关系从"并列完整文档"收拢为"基线 + 差量层"的系列关系：

- profile 通过 `$override` 区按 base token 的 `$id` 覆写值（只允许 `$value`），构建时与 base 合并为完整主题；
- profile 可用常规路径树新增 base 没有的 token（完整定义，路径不得与 base 相撞）；
- profile 拥有自己的文档级 `$id`（主题身份），并通过 `$config.base` 声明所属 base 的文档 `$id`，构建期强制校验；
- sketch payload 的 `meta` 携带 `themeId`（当前主题身份）与新增 `baseId`（所属 base 身份）；
- 新增 `wave dt new-profile <name>` 命令，从 base 一键生成全量快照式 profile 骨架；
- 结构性分歧（改类型、改扩展、删 token、大规模重排）不属于 profile 语义，用户应新建 base（`orca/main.yaml`、`beluga/main.yaml` 分目录）。

配套设计完善（同源讨论产出）：`$extensions.typography` 拍平为一层字段（取消 `defaults` 嵌套），需要按系列调整的值（如根字号 `baseFontSize`）在 base 侧下沉为 token、扩展槽位持有引用，profile 通过统一 `$override` 调整，不为 group 扩展开覆写例外。

## User Stories

1. 作为设计系统维护者，我希望 profile 只记录与 base 的值差异，以便 base 演进时所有 profile 自动跟随，不再手动同步整棵复制树。
2. 作为 Sketch 插件开发者，我希望每个主题产物携带自己的 themeId 与所属 base 的 baseId，以便插件核对主题身份与系列归属。
3. 作为设计师，我希望一条命令从 base 生成新 profile 骨架，以便就地改值而不是手写整份文档与身份。
4. 作为设计系统维护者，我希望在 profile 中新增 base 没有的 token，以便系列变体可以扩展而不只是改值。
5. 作为设计系统维护者，我希望 profile 与 base 的错误关联（声明的 base 身份与实际不符）在构建期被硬阻塞，以便身份错误不流入产物。
6. 作为设计系统维护者，我希望 group 扩展中需要按系列调整的值（如根字号）以 token 形式存在，以便 profile 用统一的覆写机制调整它们，而不是依赖 group 属性覆写例外。

## Constraints

- design-token workspace 入口合同不变：只接受文件名为 `main.yaml` 且根含有效 `$config` 的文件；profile、night overlay、resource 均不能作为入口；拒绝矩阵不变。
- night overlay 合同不变：路径式叶子覆写、路径须存在于 day tree、只写 `theme.color`/`theme.state`、根部禁止 `$id`；night 合并作用于 profile 合并后的 day tree。
- token 级 `$id` 三态合同（缺省/空槽/已入账）与"已入账永不重铸"不变；id 的生成与写回只发生在显式命令，build 保持只读。
- main.yaml 的 `$config` 维持闭合 schema 校验；profile 的 `$config` 同步采用闭合 schema（新增必填 `base`，未知字段报 `FORMAT_ERROR`）。
- profile 的 `$config` 继承与增补机制（resource/parameter/parameterGroup 合并）不变；profile 中仍禁止 `$config.theme`。
- 文档根部未知 `$` 前缀键维持跳过（DTCG 保留命名空间惯例），`$helper` 等 documentation-only 约定不受影响；只有登记的 `$` 键（`$schema`/`$id`/`$config`/`$override`）被消费。
- 输出路径碰撞全局规划（先规划后写盘）不变。
- `colorSpace` 仍在输出阶段介入，不改变引用解析。
- 用户向文档统一维护在 `manual/`，内部行为快照维护在 `docs/SPEC.md`，两者需与本变更同步；影响未来 agent 判断的知识同步 `docs/simple-wiki/wiki`。

## Implementation Decisions

1. **profile 文档形态**：根允许 `$schema`、`$id`（profile 自己的主题身份，解禁）、`$config`、覆写区 `$override`、以及常规 token 树根 key（如 `theme`）。未知 `$` 前缀根键（含文档级 `$extensions`、`$helper`）跳过；非 `$` root key 一律视为新增 token 树。
2. **`$override` 覆写区**：key 为 base token 的 `$id`，值对象必须恰好只含 `$value` 一个键。未命中 base 任何 token `$id` → 报错；值对象缺 `$value` 或携带 `$id`/`$type`/`$extensions` 等额外键 → 报错（身份永不重分配，结构分歧走新 base）。覆写粒度为整个 `$value` 替换（composite 不做子字段合并）；`$value` 可写花括号引用与 `$ref`，在合并后的树上正常解析。base 树中同 `$id` 多节点（如 `$extends` 复制）时覆写作用于文档序首个命中节点，与既有"重复 id 文档序首个保留"降级语义一致。与 base 源值相同的冗余覆写允许存在，由 doctor 汇总提示（见决策 10）。
3. **新增 token 区**：profile 的非 `$` root key 为常规 token 树。新 token 的 `$type` 必须在 profile 文件自身内可判定（token 显式声明，或 profile 内新建 group 的 `$type` 继承），不允许依赖 base group 的 `$type`——doctor 身份检查与 fixture 审计保持单文件扫描零改动。落点规则：落在 base 已有 **token** 路径 → 报错（引导改用 `$override`）；落在 base 已有 **group** → 只允许挂新成员（token/子 group），声明 `$type`/`$extensions`/`$description` → 报错（结构完全冻结）；落在**新路径** → 完整自由（`$type`/`$extensions`/`$description` 均可）。
4. **合并时机**：与 night overlay 同层——在 YAML 文档层合并（take-then-strip `$id`/`$config`/`$override`），产出的合成文档不含 `$override`，下游 schema/resolver/transformer/generator 零改动。合成文档错误以 token 路径定位（接受行号指向合成内容的现状，与 night 相同）。
5. **base 关联（v1）**：profile `$config.base` 必填，值为 base 文档 `$id`；profile 发现仍走 `<base 目录>/profiles/*.yaml` 约定；声明值与入口 main.yaml 的根 `$id` 不符 → 报错；base 无根 `$id` → 报错并引导 `wave dt ids --write`。约定负责找到，身份负责核对。自由目录发现（声明式递归扫描）后置。
6. **主题身份**：main pass 的 `themeId` = main 根 `$id`、`baseId` = null；profile pass 的 `themeId` = profile 根 `$id`（缺省时为 null）、`baseId` = main 根 `$id`；profile 的 night pass 随其 day profile 身份。输出主题名维持 `${baseTheme}-${profileName}` 派生。
7. **sketch payload**：`meta` 增加 `baseId` 字段（缺省 null），加法变更，`version` 维持 2。发版注记需告知插件侧 meta 形状变化（现有测试对 meta 严格等值，插件若同样做严格形状校验会感知新增字段）。
8. **`wave dt new-profile <name>`**：子命令形态。前置校验：base 根 `$id` 已入账、base 全部 token 已入账 `$id`、base 无重复 `$id`，否则报错并引导先跑 `wave dt ids --write`（重复 `$id` 使 `$override` 无法逐 token 表达且快照取值有歧义，生成器不在歧义上猜测——human 裁决）；name 归一化（小写、空格转下划线）与重名拒绝复用现有 profile 规则。生成物：`profiles/<name>.yaml`，含新铸的文档 `$id`、`$config.base`、`$override` 区预填全部 base token 的 `<id>: { $value: <源值原样> }` 快照（引用字符串保留原貌）。
9. **`wave dt ids` 适配**：加载面不变（main + profiles 的 day 文件）；新增维护 profile 文档级 `$id` 槽位（铸/填，永不重铸）；新增校验每个 profile 的 `$config.base` 与 main 根 `$id` 一致（缺失或不符 = 硬阻塞，全 workspace 零写入）；`$override` 区以 `$` 前缀天然处于身份扫描之外，原跨文件路径身份同步对覆写区消解；profile 新增 token 照常入账。
10. **doctor 适配**：新增 profile 健康项——`$config.base` 缺失（error）、与 base 不符（error）、覆写未命中（error）、冗余覆写（**单条汇总提示**：报告 x/y 条覆写与 base 相同并建议删除，不逐条 warning、不影响退出码，与 new-profile 全量快照的体验兼容）；profile 文档身份进入身份报告；base 树重复 `$id` 的覆写目标歧义由既有重复 id 检查与 `ids` 修复承接，不新增检查项。检查与输出矩阵（human 裁决）：默认（无 `--profile`）将 main 与全部 profiles 纳入 workspace 级健康项扫描；`--profile <name>` 只检查该 profile；`--json`/`--status` 以各格式既有 finding 通道结构化输出同一内容；resource 严格检查的既有 scope 合同不变（默认 main、`--profile` 单选）。
11. **旧格式不兼容**：standalone 全量 profile 在新模型下视为非法（`$config.base` 缺失报错），不提供兼容层与迁移命令；真实项目的迁移由用户自行处理，仓库内 fixtures/tests/benchmarks/docs 由本计划改写。
12. **既有命令的承接**：`dt wcag` 在 profile 合并后的树上运行（链路经由 profile 解析层产出物，零额外改动）；`migrate-extensions` 扫描面不变（`$override` 区只含 `$value`，自然无迁移对象）。
13. **`$extensions.typography` 拍平**：取消 `defaults` 嵌套，扩展字段平铺为 `{ baseFontSize?, fontFamily?, fontSize?, fontWeight?, lineHeight?, letterSpacing? }`，字段白名单闭合、未知字段报错；至少声明一个字段。5 个 composite 兜底字段语义不变（沿 group 树浅合并继承、token 处 materialize 后校验缺失）；`baseFontSize` 仍仅限 `theme.font`，仍只接受 number（或解析为 number 的引用），单位约定为 px，iOS pt / Android dp 等平台投影后置。旧嵌套形态（`defaults:` 键）硬切：schema 拒绝并给改写示例。SPEC 需明确区分 `fontSize`（composite 字段默认值）与 `baseFontSize`（rem 换算基准）两个兄弟键。
14. **可调值的 token 引用模式**：任何需要被 profile 调整的 group 扩展值，在 base 侧下沉为 token、扩展槽位持有对该 token 的引用（resolver 对 `$extensions` 的引用解析是通用机制，schema raw 阶段已放行引用形态）。根字号落法：`theme.font.base-size` token（`$type: number`，`$value: 14`）+ `baseFontSize: "{theme.font.base-size}"`；profile 经 `$override` 改该 token 值完成调整。引用 slot 不做 dimension 类型支持（number 专用），需要时后续再放宽。
15. **错误出口结构化**：profile 解析层的全部失败（`$config.base` 缺失/不符、覆写未命中、覆写形态非法、撞路径、group 属性声明非法）以 result 型或带 exitCode 的错误返回：build 映 `FORMAT_ERROR`、doctor 落 error finding（不得退化为 `FILE_NOT_FOUND`），错误消息含 profile 文件路径。

## Testing Decisions

- 测试只检测外部行为（构建产物、错误消息、命令报告），不绑定内部实现。
- 以 fixtures 驱动的行为测试为主，技术栈沿用现有 `bun test` + `tests/fixtures/themes/`：
  - 新格式 profile 的合并构建（覆写命中、引用贯通、group `$type` 继承仅来自 profile 文件内、night 叠加在合并树上）；
  - 失败矩阵（覆写未命中、覆写值对象形态非法、新增 token 撞 token 路径、既有 group 上声明属性、新 token 依赖 base group `$type`、`$config.base` 缺失/不符、base 无根 `$id`），断言 build 出口为 `FORMAT_ERROR` 且消息含 profile 路径；
  - sketch payload 断言 `meta.themeId`/`meta.baseId`（main pass 与 profile pass 两种形态），被 skip 的 token 维持负向断言；
  - `new-profile` 生成物断言（快照内容、文档 `$id` 形态）与前置拒绝（base 未入账）；
  - `ids` 的 profile 文档槽位维护与 `$config.base` 冲突硬阻塞；第二次运行幂等；
  - typography 拍平（平铺字段继承与 materialize、`baseFontSize` 引用形态经 `$override` 调整、旧 `defaults:` 嵌套拒绝、`fontSize` 与 `baseFontSize` 兄弟键区分）；
  - `$extends` 复制同 `$id` 时覆写作用于文档序首个的行为刻画。
- 真实 canary 护栏：`tests/fixtures/themes/orca-realistic` 改为新格式后按 AGENTS.md 护栏跑 `--profiles all --out <guarded-temp-dir>`，保留互斥 parameter groups，不加全局 `--platform` 覆盖。
- 仓库内回归（bun test + typecheck）与真实 smoke 互不替代。

## Out of Scope

- 自由目录发现（profile 可放在 base 目录外、按声明身份递归扫描）：文件格式预留，发现机制后置。
- 旧格式 profile 的兼容层与迁移命令；typography 旧嵌套形态的兼容层（`dt migrate-typography` 是否提供在实现期按工作量决定，不进合同）。
- group 级 `$extensions` 覆写例外（已被 token 引用模式替代）。
- profile 删除 base token 的语义；profile 覆写 `$type`/`$extensions`/`$description`。
- `baseFontSize` 的 dimension 类型支持与 iOS pt / Android dp 等平台单位投影。
- night overlay 的任何改动。
- CLI 命令名的统一调整（用户后续自行处理）。
- 多 base 编排（一条命令构建多个 base 目录）：维持一次一个 workspace。

## Further Notes

- 用户的真实 Orca 项目由用户自行迁移到新格式（profile 差量化 + typography 拍平 + base-size token 化）；仓库内 fixtures、benchmarks 的 example-derived case 由本计划同步改写。
- 术语基线：base = `main.yaml` 承载的默认主题；profile = `profiles/<name>.yaml` 差量层；系列 = 一个 base 与其全部 profile；新 base = 独立设计系统目录（如 `orca/`、`beluga/`）。
- 子代理预审（两位评审，结论均为有条件通过）的全部阻断/建议项已吸收：阻断-1 经用户改判为 token 引用模式（决策 14）；阻断-2 经用户裁决为文件内可判定（决策 3）；快照与 doctor 提示经用户裁决为汇总提示（决策 10）；版本落锤维持 2（决策 7）；错误出口（决策 15）、benchmarks runner、测试改造面、`$helper` 处置、文件清单笔误均已并入。
- Strict Round 1（FAIL）台账：FATAL×2（M1 闸门循环依赖、runner 循环依赖）→ 全量夹具迁移与 runner 适配前移 M1（结构性修正）；MAJOR×3 → doctor 命令入口错误映射纳入 M1 范围、doctor 检查矩阵经 human 裁决入决策 10、fixture 新格式核验改为逐文件解析断言；MINOR×1 → M3 smoke 改临时 workspace；ESCALATE×1 → 重复 `$id` 时 new-profile 拒绝并引导修复，经 human 裁决入决策 8。
- Strict Round 2（PASS）MAJOR 台账：MAJOR-1（M1 Task-1 补 baseFontSize 迁移配方：base 下沉 `base-size` token + 引用化，profile 异值改 `$override`，`defaults` 暂留至 M2）RESOLVED——reviewer 要求原文落入验收；MAJOR-2（M3 Task-2 补重复 `$id` 拒绝 + 引导文案 + 零写入断言）RESOLVED 同上；MAJOR-3（M4 Task-2 范围补 `src/cli/commands/doctor.ts`、四格矩阵正反用例入闸门）RESOLVED 同上；MINOR-1（M1 Task-5 依赖补 Task-4）RESOLVED 同上。交付前复核：全部关闭。
- 施工注记 M1-1（orchestrator 裁决，coder-plus 上报后裁定）：`identity-ladder` 与 `identity-conflict` 两处夹具（含 2 个 day profile）在 M1 保持旧格式不动。依据：二者仅被 `tests/doctor-identity.test.ts` 与 `tests/dt-ids.test.ts` 消费（grep 核实，无 build 路径消费方），所经 ids 命令与 doctor identity walk 在 M1 不变；其新语义迁移归 M4（M4 Task-1/Task-3 验收随之包含这两处夹具的新格式迁移与测试适配）。M1 fixture 新格式核验以显式延期清单豁免该两处（清单 = 这两个目录名，注明归属 M4）。若施工中发现任何 build 路径消费这两处夹具，停止并上报，不得自行适配。
- 施工注记 M1-2（human 裁决，coder-plus 上报 orca-test 非值分歧）：四类 profile 非值分歧的处置——typography defaults 分歧按决策 14 配方保留：base 将分歧字段下沉为已入账 token 并引用化（嵌套 `defaults:` 形态内引用，M2 再拍平），profile 异值改 `$override`；smoothShadow target、sketch.path、inheritColor opacity 三类分歧属冻结模型的结构性范畴，fixture 迁移一律丢弃（profile 继承 base 扩展），受影响快照经 diff 审计后重生成，丢弃清单在 DEVIATIONS 全量披露。真实项目若依赖后三类差异，属新 base 或未来模型扩展，不在本计划。
- 施工注记 M1-3（human 指示，验证收尾补强）：M5 增加 fixture 实例完整性巡检——`tests/fixtures/themes/` 下每个含合法 `main.yaml` 的目录以 `--profiles all`（存在 night 文件时追加 `--night`）构建到受控临时目录，断言成功且各 parameterGroup 产物齐备；invalid-case 夹具断言预期错误出口码。巡检与 M1 格式核验分层（格式合法 ≠ 构建通过），执行时 identity-ladder/identity-conflict 已经 M4 迁移、无豁免死角。`tests/fixtures/themes/orca-*`（orca-realistic 与 orca-test）是 example-derived 真实实例，由 canary、parity、quality-harness 与本巡检四路覆盖；用户真实 Orca 项目的迁移与冒烟在交付后由用户侧执行，不列入本计划验收。
- 施工注记 M1-4（orchestrator 授权，benchmark 证据处置）：(a) `benchmarks/design-token/synthetic.ts` 的两个 `$extensions.sketch` legacy 发射器（:85/:117）为**先于本计划的存量破损**（schema 早已硬切拒绝 legacy 形态），授权就地转为 `platform.sketch` 形态（独立原子提交，DEVIATIONS 披露），不触碰 formatter。(b) 既有 ignored baseline（July/Bun1.3.14）经 coder 举证已过时（pre-Sketch-v2、pre-dimension 归一化），不可作 diff 参照；批准以只读 `git archive` 起始 HEAD 到受控临时目录（node_modules symlink、零 worktree/历史变更）生成**同期 pre-M1 baseline**，新 baseline 与之对比出证；存量 synthetic 失败与 provenance drift 在交付报告中单列。orca 等价 diff 中 token 数增长（153→324）为 base 继承的预期效果，属预期变化而非回归。
- 施工进展：M1 完成（2026-09-29）。提交 `c0ecea3`（synthetic 存量修复）、`9df7d3a`（M1 集成）、`70ba4b6`（B1 修正）；critic-gate 初审 FAIL（B1 下游错误丢来源路径）→ 修正轮 PASS，41 份成功产物 SHA256 与首轮一致。gate carry-forward：M2 拍平 defaults、M4 两延期 identity 夹具 + doctor 矩阵、M5 实例完整性巡检。 M2 完成（2026-09-29）：`e930694`（typography 六字段平铺硬切 + lineage 补漏 + dt-init 模板）；gate 一轮 PASS（零阻断），夹具深等值无值漂移、41 产物 SHA256 与 M1 一致。carry-forward：M4 两延期 identity 夹具 + doctor 矩阵；M5 实例巡检 + 文档。

## Draft Plan

- 结构总览：
  - 变更集中在五处：pipeline 的 profile 解析层（新格式 + 合并 + 错误出口）、theme 编排层与 sketch 输出（双身份贯通）、typography 扩展（schema + transformer 拍平）、new-profile 命令（新模块）、ids/doctor 适配；resolver/transformer 主体与 generator 其余格式零改动。
  - 数据流：`main.yaml`（base 树 + `$id` + `$config`）+ `profiles/<name>.yaml`（`$id` + `$config.base` + `$override` + 新 token 树）→ profile 解析层校验身份并合并出合成文档 → 既有 `processThemeDocument`（schema → extends → resolve → transform）→ generator。
  - 模块职责：
    - profile 解析层（现有 profile-resolver 模块）：新格式解析、profile `$config` 闭合校验、身份校验、`$override` 合并与新树嫁接（新增 `mergeProfileOverrides`，与 `mergeNightOverlay` 并存）、结构化错误出口（决策 15）。
    - theme 编排层（现有 theme-service）：向 pass 贯通 `themeId`（profile 自身身份）与 `baseId`（base 身份）；main pass 的 baseId 为空；night pass 随 day。
    - sketch 输出（sketch / sketch-payload 两个模块）：options 增加 `baseId`，`meta` 输出 `{ themeId, baseId, version: 2 }`。
    - typography 扩展（schema/theme 与 typography-value、theme-transformer）：字段拍平与旧形态拒绝；`baseFontSize` 引用形态沿用现有通用 `$extensions` 引用解析，无新机制。
    - new-profile 命令（新模块）：前置入账校验、铸身份、快照生成、写文件与 receipt。
    - ids 模块：profile 文档槽位维护、`$config.base` 一致性校验。
    - doctor 模块：profile 健康项（base 关联、覆写命中、冗余汇总提示）与检查矩阵（默认扫 main + 全部 profiles；`--profile` 单选；`--json`/`--status` 结构化输出）。
    - wcag 与 migrate-extensions：零改动承接（决策 12），仅需回归测试证明。
    - benchmarks runner（第三消费方）：自带 pass 装配，需适配 profile 解析层签名变化并贯通 themeId/baseId，消除与真实 build 的语义分叉。
- 关键契约：
  - profile 文件形态（原型片段）：

    ```yaml
    $schema: "https://www.designtokens.org/tr/2025.10/format/"
    $id: "f3a1c2…"              # profile 自己的主题身份

    $config:
      base: "9c2e08…"           # base（main.yaml）的文档级 $id，必填

    $override:
      a1b2c3…:
        $value: "{tailwindcss.color.sky.600}"
      d4e5f6…:
        $value: 16               # 例：覆写 theme.font.base-size（number token）

    theme:
      color:
        brand:
          $id:
          $type: color
          $value: "{tailwindcss.color.sky.800}"
    ```

  - 合并算法（步骤级）：
    1. take-then-strip：取 profile 根 `$id`、`$config`、`$override`，未知 `$` 键跳过，剩余非 `$` root key 构成新 token 树；
    2. 校验 `$config.base` 与 base 根 `$id` 一致（base 无身份或不符均报错）；
    3. 克隆 base 树，按文档序索引所有携带 `$id` 的 token 节点；
    4. 应用覆写：未命中报错；值对象非恰好 `$value` 一键报错；命中则整体替换该节点 `$value`（同 id 多命中作用于文档序首个）；
    5. 嫁接新树：逐节点落点判定——已有 token 路径报错；已有 group 仅允许新成员、声明 `$type`/`$extensions`/`$description` 报错；新路径放行；新 token 的 `$type` 须在 profile 文件内可判定；
    6. dump 合成文档进入既有处理链。
  - sketch meta 形状：`{ "themeId": string | null, "baseId": string | null, "version": 2 }`。
  - profile `$config` 闭合 schema：`base`（非空字符串，必填）、`resource`/`parameter`/`parameterGroup`（可选，与 main 同形）、禁止 `theme` 与未知字段。
  - typography 扩展拍平形态（决策 13 原型片段）：

    ```yaml
    theme:
      font:
        $type: typography
        $extensions:
          typography:
            baseFontSize: "{theme.font.base-size}"   # rem 基准，仅限 theme.font，number
            fontFamily: "{theme.font.font-family}"   # composite 兜底字段，可引用可字面量
            letterSpacing: 0
        base-size:
          $id: "9c2e08…"
          $type: number
          $value: 14
    ```

  - 错误出口：profile 解析层失败 → build `FORMAT_ERROR` / doctor error finding，消息含 profile 文件路径与 token/id 定位。
- 文件结构：
  - 修改 `src/core/pipeline/profile-resolver.ts`：新格式解析、身份校验、合并、结构化错误；`parseProfileDocument` 签名扩展（接收 base 树与 base 身份）。
  - 修改 `src/core/pipeline/theme-service.ts`：贯通 profile 自身 themeId 与 baseId；night pass 身份随 day。
  - 修改 `src/cli/commands/doctor.ts`：profile 解析层错误映射为 error finding/`FORMAT_ERROR`（普通 doctor 与 `--contrast --profile` 双路径），不得退化为 `FILE_NOT_FOUND`。
  - 修改 `src/core/pipeline/pass-preparer.ts`、`src/core/generator/token-generator.ts`（options 贯通 `baseId`）。
  - 修改 `src/core/generator/formats/sketch.ts`、`src/core/generator/formats/sketch-payload.ts`：`meta.baseId`。
  - 修改 `src/types/index.ts`：`SketchPayloadV2` meta、生成 options 类型。
  - 新增 `src/core/validator/design-token-profile-config.ts`：profile `$config` 闭合 schema。
  - 修改 `src/core/schema/theme.ts`、`src/core/typography-value.ts`、`src/core/transformer/theme-transformer.ts`：typography 扩展拍平与旧形态拒绝。
  - 新增 `src/cli/commands/dt-new-profile.ts`；修改 `src/cli/commands/dt.ts`（注册与帮助文案）。
  - 修改 `src/core/ids/ids.ts`：profile 文档槽位、`$config.base` 校验。
  - 修改 `src/core/doctor/`（identity 与 workspace 检查）：profile 健康项。
  - 修改 `benchmarks/design-token/runner.ts`：适配 profile 解析层签名并贯通 themeId/baseId；baseline 重新生成。
  - 测试改造（直接绑定旧语义的既有测试）：`tests/profile-resolver.test.ts`（standalone 语义，整体改写）、`tests/sketch-payload-v2.test.ts`（meta 严格等值、`inherits main $id` 语义翻转）、`tests/integration/theme-service.test.ts`（:1116 standalone profile base 场景改写为新形态）、`tests/dt-ids.test.ts`（跨文件认养断言调整）、`tests/fixture-identity-audit.test.ts`（审计规则核对）、typography 相关测试（defaults 形态全面改写）。
  - fixtures：`find tests/fixtures/themes -path "*/profiles/*.yaml" -not -name "*@night*"` 命中的 23 个 day profile（12 处夹具）全部改写为新格式；对应 main 补齐根 `$id` 与 base-size token 化；invalid-case 触发器重指（`root-id-in-profile-invalid` 语义翻转为合法、改验无效 `$id` 形态；`theme-in-profile-invalid` 错误消息随 zod 化更新；`nested-invalid` 保持发现期报错）；orca-realistic / orca-test 全量改写。
  - 文档：`docs/SPEC.md`（Mental Model、Profile Model、`$id` 章节、sketch meta、typography 扩展）、`manual/`（用户向 profile 与 typography 章节）、`docs/simple-wiki/wiki`（受影响的既有页面）。
- 风险与未决：
  - 合成文档行号：resolver/schema 错误的行号指向合成内容而非源文件（night 已接受同款现状）；缓解：错误消息保留 token 路径与来源文件标注。
  - `$extends` 交互：覆写按 id 作用于未展开树；extends 复制 token 时同 id 多节点由既有降级承接，覆写作用于文档序首个。需要行为测试刻画。
  - typography 拍平的测试波及面：`defaults:` 形态散布于 typography 相关 fixtures 与测试，需全面清扫（实现期以 grep 清单为准）。
  - 未决：`new-profile` 生成物是否在文件头写注释（profile 名、base 身份、使用提示）——实现期定，不影响契约。
- 里程碑草案（验证主题级粗分组）：
  - M1：profile 差量合并链路与全仓夹具迁移（解析、校验、合并、错误出口、build、sketch meta、runner 适配、23 个 day profile 夹具与全量测试转绿）。
  - M2：`$extensions.typography` 拍平与 base-size 引用模式。
  - M3：`wave dt new-profile` 命令。
  - M4：`ids` 与 `doctor` 适配。
  - M5：SPEC/manual/wiki 同步与全量回归终验。

## Implement Plan

- 里程碑清单：M1 profile 差量合并链路与全仓夹具迁移 → M2 typography 扩展拍平 → M3 new-profile 命令 → M4 ids 与 doctor 适配 → M5 文档同步与交付回归。
- 验证主题地图：US-1/4 → M1；US-2 → M1（sketch meta）与 M5（canary 复核）；US-3 → M3；US-5 → M1 与 M4；US-6 → M2；Testing Decisions 与文档约束 → M1（基准与回归）和 M5（文档与终验）。
- 推进顺序：严格串行，每碑闸门未过不进入下一碑。全量 `bun test` 消费全部夹具与 quality-harness runner，因此夹具迁移与 runner 适配必须在 M1 闸门内完成（Strict R1 FATAL 修正）；M2 与 M3/M4 在 M1 后无相互依赖，按编号推进。
- 文件结构住 Draft，本层只引用；执行者开工前必读：本计划全文、`docs/SPEC.md` Mental Model 与 `$id` 章节、`AGENTS.md`（DTCG 类型变更护栏与必要命令）。
- 通用纪律：TDD（先刻画失败行为测试，再实现转绿）；原子提交、Conventional Commits；每 Task 完成跑 `bun test <相关文件>` 与 `pnpm typecheck`，每碑闸门跑全量 `bun test`。

## Milestone-1

profile 差量合并链路与全仓夹具迁移

- 验证主题：新格式 profile（`$override` + 新 token 树 + `$config.base`）经 build 产出与合并语义一致的产物；全部非法形态以 `FORMAT_ERROR` 拒绝且消息含 profile 路径；sketch payload 携带 `themeId`/`baseId` 双身份；全仓 profile 夹具（23 个 day profile）、quality-harness runner 与 baseline 同步迁移到新语义，全量测试在硬切后保持绿。
- 核验基线：`bun test` 全量绿；`pnpm typecheck`；Orca canary `pnpm dev -- dt build -f tests/fixtures/themes/orca-realistic/main.yaml --profiles all --out <guarded-temp-dir>` 成功（保留互斥 parameter groups，不加全局 `--platform`），sketch payload meta 断言通过、`sketch.skip` token 负向断言通过；fixture 新格式核验测试通过（逐文件解析每个 fixture day profile，断言非空 `$config.base` 与合法 `$override` 形态，非 grep 充数）。
- 来源：US-1/2/4/5；决策 1-7、11、15。

### Task-1

全仓 profile fixtures 迁移与新格式 fixture 族（来源：prefactor——全量 `bun test` 消费全部夹具，迁移必须先于闸门完成；决策 11）

- 验收标准：`find tests/fixtures/themes -path "*/profiles/*.yaml" -not -name "*@night*"` 命中的 23 个 day profile（12 处夹具，含 `profile-model/` 子场景）全部改写为新格式；对应 main 补齐根 `$id` 且全 token 入账；新增最小 fixture 族（main 含根 `$id` 且全部 token 入账；profile 含 `$id`/`$config.base`/`$override`/新 token）。迁移映射规则：profile 与 base 同路径同值 → 删除该条；同路径异值 → 按 base token `$id` 写入 `$override`；base 不存在的路径 → 保留为新 token 树（完整定义、`$type` 文件内可判定）。typography 迁移配方（决策 14 应用）：凡 profile 在既有 `theme.font` group 上声明 `$extensions.typography.baseFontSize` 的夹具（如 orca-test 多个 profile），先在 base 新建已入账 `theme.font.base-size` number token（`$value` 取 base 原值），将 base 的 `baseFontSize` 改为 `"{theme.font.base-size}"` 引用，profile 侧的异值改为对该 token `$id` 的 `$override`；base 的旧 `defaults:` 嵌套在 M1 保持原样（M2 拍平），profile 侧不再声明任何 group 属性。invalid-case 触发器重指：`root-id-in-profile-invalid` 语义翻转为合法，改验无效 `$id` 形态（空值/非字符串）或按测试意图移除；`theme-in-profile-invalid` 保持非法（`$config.theme` 仍禁止），错误消息随 zod 化更新；`nested-invalid` 保持发现期报错（先于解析）。
- 可动文件范围：`tests/fixtures/themes/`（按上述 find 清单）；新增 fixture 目录（命名实现期定）。
- 依赖：无。注意：本 Task 完成后、Task-3 完成前，全仓 build 类测试失败属预期红态。
- 固有风险：全 token 入账可先用 `pnpm dev -- dt ids --write -f <main.yaml>` 机械完成（旧格式下 ids 仍可用）；profile 差量化是手工映射，完成后以"profile 中不再存在与 base 同值的独立 token 树条目"自查；orca-test 的 7 个 profile 含 `$helper` 块，迁移时保留（未知 `$` 根键跳过）。

- [x] 执行各 main 入账（`dt ids --write`）
- [x] 按映射规则改写 23 个 day profile
- [x] 重指 invalid-case 触发器
- [x] 新建最小 fixture 族
- [x] 自查（同值条目清零）并原子提交

### Task-2

profile 文档解析与闭合校验（来源：决策 1、5、15；US-5）

- 验收标准：profile `$config` 经新 zod 闭合 schema 校验（`base` 必填非空字符串；`resource`/`parameter`/`parameterGroup` 与 main 同形；禁止 `theme` 与未知字段）；解析层 take-then-strip 根 `$id`（profile 主题身份，缺省允许）、`$config`、`$override`；未知 `$` 前缀根键跳过；非 `$` 根键进入新 token 树。全部非法形态返回结构化错误（result 型或带 exitCode 的错误），消息含 profile 文件路径，不得再以裸 throw 流出。
- 可动文件范围：新增 `src/core/validator/design-token-profile-config.ts`；修改 `src/core/pipeline/profile-resolver.ts`（Draft 文件结构）。
- 依赖：Task-1（fixture 供红测试）。
- 固有风险：profile `$config` 首次 zod 化，错误消息文案与 main 的 `validateMainConfig` 风格对齐；`$override` 区自身形态（非 object、空 key、值非恰好一键）也在本 Task 拒绝。

- [x] 刻画校验失败行为测试（红）
- [x] 实现 profile config schema 与解析骨架（绿）
- [x] `bun test` 相关文件 + `pnpm typecheck`
- [x] 原子提交

### Task-3

合并算法与 build 链路贯通（来源：决策 2-5；US-1、4）

- 验收标准：`mergeProfileOverrides` 按 Draft 关键契约的 6 步算法实现（take-then-strip → `$config.base` 校验 → id 索引 → 覆写应用（未命中/形态非法报错、整体替换、同 id 文档序首个）→ 新树落点矩阵（已有 token 报错/已有 group 仅新成员且禁声明 `$type`/`$extensions`/`$description`/新路径放行/新 token `$type` 文件内可判定）→ dump 合成文档）；`parseProfileDocument` 产出合成 tokenContent 与 profile 自身 themeId；config 继承（resources/parameter/parameterGroup 合并）行为不变；build 侧错误映 `FORMAT_ERROR`（不再是兜底 `GENERAL_ERROR`）；doctor 命令入口（普通 `dt doctor` 与 `--contrast --profile` 双路径）将解析层错误映射为 error finding/`FORMAT_ERROR`，不得退化为 `FILE_NOT_FOUND`。`pnpm dev -- dt build -f <fixture>/main.yaml`、`--profile <name>`、`--profiles all` 对新 fixture 与 orca-realistic 成功，产物与手工合并预期一致。
- 可动文件范围：`src/core/pipeline/profile-resolver.ts`、`src/core/pipeline/theme-service.ts`、`src/cli/commands/doctor.ts`。
- 依赖：Task-2。
- 固有风险：`$extends` 复制同 `$id` 的覆写目标（文档序首个）需行为测试刻画；合成文档行号指向合成内容（可接受），错误消息必须保留 token 路径与 profile 文件路径；doctor 侧 profile 加载（`doctor.ts` 的 selectProfileDocument 链路）复用同一解析层，注意其错误不得退化为 `FILE_NOT_FOUND`。

- [x] 刻画合并行为测试（成功路径 + 失败矩阵，红）
- [x] 实现 mergeProfileOverrides 与链路贯通（绿）
- [x] `bun test` 相关文件 + `pnpm typecheck`
- [x] 原子提交

### Task-4

sketch meta 双身份贯通（来源：决策 6、7；US-2）

- 验收标准：`SketchPayloadV2.meta` = `{ themeId, baseId, version: 2 }`；main pass `themeId` = main 根 `$id`、`baseId` = null；profile day/night pass `themeId` = profile 根 `$id`（缺省 null）、`baseId` = main 根 `$id`；options 贯通链 `pass-preparer → token-generator → sketch → sketch-payload` 逐段可用；既有对 meta 严格等值的断言更新后通过。
- 可动文件范围：`src/types/index.ts`、`src/core/pipeline/pass-preparer.ts`、`src/core/generator/token-generator.ts`、`src/core/generator/formats/sketch.ts`、`src/core/generator/formats/sketch-payload.ts`（Draft 文件结构）。
- 依赖：Task-3（theme-service 贯通点就绪）。
- 固有风险：`tests/sketch-payload-v2.test.ts` 与 `tests/integration/theme-service.test.ts` 对 meta 的 `toEqual` 严格等值会破，属预期更新对象；"inherits main $id" 语义翻转为"profile 用自身身份"。

- [x] 更新 meta 断言（红）
- [x] 贯通 baseId/themeId（绿）
- [x] `bun test` 相关文件 + `pnpm typecheck`
- [x] 原子提交

### Task-5

benchmarks runner 适配与 baseline（来源：Testing Decisions；Further Notes 预审台账；prefactor——`tests/quality-harness.test.ts` 在全量套件中消费 runner，必须与 M1 同碑完成）

- 验收标准：`benchmarks/design-token/runner.ts` 适配 profile 解析层新签名（传 base 树与 base 身份），并贯通 themeId/baseId（消除与真实 build 的语义分叉）；benchmark 套件跑通；baseline 重新生成，diff 人工核对只含预期变化（meta 身份字段、合并后产物差异）。
- 可动文件范围：`benchmarks/design-token/runner.ts`、cases 数据、baseline 产物。
- 依赖：Task-3（签名与新语义就绪）、Task-4（类型/formatter 身份贯通链）、Task-1（orca-realistic 夹具已迁移）。
- 固有风险：baseline 重生成的 diff 若超出预期项，停下核对而非照单全收。

- [x] 适配 runner 签名与身份贯通
- [x] 跑通 benchmark 套件
- [x] 重生成 baseline 并核对 diff
- [x] 原子提交

### Task-6

M1 测试改写、失败矩阵与新格式核验（来源：Testing Decisions；US-1/4/5）

- 验收标准：`tests/profile-resolver.test.ts` 改写为新语义（standalone 断言移除，改为差量合并断言）；失败矩阵测试覆盖决策 2/3/5/15 全部拒绝分支（覆写未命中、覆写值对象形态非法、撞 token 路径、既有 group 声明属性、新 token 依赖 base group `$type`、`$config.base` 缺失、声明不符、base 无根 `$id`），逐条断言 `FORMAT_ERROR` 与消息要素（含 profile 路径），doctor 双路径（普通与 `--contrast --profile`）的映射各至少一条断言；`tests/integration/theme-service.test.ts` profile 用例（含 :1116 场景）改写为新格式后通过；新增 fixture 新格式核验测试：逐文件解析每个 fixture day profile，断言非空 `$config.base`、`$override` 值对象形态合法、新树 `$type` 文件内可判定。
- 可动文件范围：`tests/profile-resolver.test.ts`、`tests/integration/theme-service.test.ts`、`tests/sketch-payload-v2.test.ts`、`tests/sketch-extensions-fixture-parity.test.ts`、本碑新增的行为测试文件（命名实现期定）。
- 依赖：Task-3、Task-4、Task-5。
- 固有风险：:1116 改写依赖 `baseFontSize` 引用形态（`baseFontSize: "{theme.font.base-size}"` + number token + `$override` 改值）——现有 schema raw 放行与通用 `$extensions` 引用解析应已支持；若实测不通，先刻画失败测试再补最小 wiring，不扩大本碑范围。

- [x] 改写 profile-resolver.test.ts
- [x] 补齐失败矩阵测试（含 doctor 双路径）
- [x] 改写 theme-service profile 用例与 meta 断言
- [x] 新增 fixture 新格式核验测试
- [x] 全量 `bun test` + `pnpm typecheck` + Orca canary
- [x] 原子提交

> [!IMPORTANT]
> Milestone-1 闸门：`bun test` 全量绿、`pnpm typecheck`、Orca canary 与 fixture 新格式核验按核验基线通过；未通过不进入 Milestone-2。

## Milestone-2

typography 扩展拍平

- 验证主题：平铺 typography 扩展全链路（schema/继承/materialize/css/sketch）行为等价于旧 `defaults` 语义；旧嵌套形态拒绝并给改写示例；`fontSize` 与 `baseFontSize` 兄弟键并存且可区分。
- 核验基线：typography 相关测试全绿（改写后）；`grep -rn "defaults:" tests/fixtures src | grep -i typography` 无残留；`pnpm typecheck`。
- 来源：US-6；决策 13、14。

### Task-1

schema 拍平与旧形态拒绝（来源：决策 13；US-6）

- 验收标准：`$extensions.typography` 白名单 = `{ baseFontSize, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing }`，未知字段报错；至少声明一个字段；出现 `defaults` 键 → 报错且消息给平铺改写示例；`baseFontSize` 仅 `theme.font`、number-only（raw 阶段引用放行）不变；5 个兜底字段值校验复用 `validateTypographyField`。
- 可动文件范围：`src/core/schema/theme.ts`、`src/core/typography-value.ts`。
- 依赖：M1 闸门通过。
- 固有风险：`baseFontSize` 与 `fontSize` 兄弟键的报错消息需能明确区分两者（SPEC 同步由 M5 负责）。

- [x] 刻画拍平校验测试（含 defaults 拒绝，红）
- [x] 实现 schema 拍平（绿）
- [x] `bun test` 相关文件 + `pnpm typecheck`
- [x] 原子提交

### Task-2

transformer 与消费端适配（来源：决策 13；US-6）

- 验收标准：`typographyDefaultsFromExtensions` 改读平铺 5 字段；沿 group 树的浅合并继承与 token 处 materialize 行为等价（同一逻辑输入产出同一 resolved 值）；`css.ts` / `sketch-payload.ts` 消费端不变；`dt-init` 模板 typography 段更新为平铺 + `base-size` token 示例。
- 可动文件范围：`src/core/typography-value.ts`、`src/core/transformer/theme-transformer.ts`、`src/cli/commands/dt-init.ts`。
- 依赖：Task-1。
- 固有风险：继承合并的键源从 defaults 袋子改为白名单挑选；`$extends` 的 `$extensions` 顶层浅合并规则（`platform` 键整体覆盖）不得受影响。

- [x] 刻画继承/materialize 等价测试（红）
- [x] 实现适配（绿）
- [x] `bun test` 相关文件 + `pnpm typecheck`
- [x] 原子提交

### Task-3

typography 测试与 fixture 清扫（来源：Testing Decisions；决策 11）

- 验收标准：grep 清单驱动的 `defaults:` 形态全部改写为平铺（fixtures 与内联测试 yaml）；`theme-service.test.ts` :1116 场景（M1 已改引用形态）本轮同步为平铺；新增平铺继承/materialize 行为测试与 `defaults` 拒绝测试；`grep -rn "defaults:" tests/fixtures` 中 typography 用法清零。
- 可动文件范围：typography 相关测试与 fixtures（以 grep 清单为准）。
- 依赖：Task-2。
- 固有风险：fixture 散布面以 grep 实测为准；漏改会表现为 schema 拒绝，按测试失败清单驱动补改。

- [x] grep 清单盘点
- [x] 逐处改写并转绿
- [x] 全量 `bun test` + `pnpm typecheck`
- [x] 原子提交

> [!IMPORTANT]
> Milestone-2 闸门：typography 相关测试全绿、无 defaults 残留、`pnpm typecheck`；未通过不进入 Milestone-3。

## Milestone-3

new-profile 命令

- 验证主题：`wave dt new-profile <name>` 从已入账 base 生成全量快照 profile，产物可被 build 直接消费（快照即 100% 合法覆写）；前置条件缺失时拒绝并引导。
- 核验基线：行为测试（生成物断言/前置拒绝/生成后 `--profile` build 闭环）绿；手工 smoke 在临时复制的 workspace 中执行 `pnpm dev -- dt new-profile demo -f <副本>/main.yaml` 并断言清理（不污染 fixtures 与 git 工作树，避免触发后续 ids 的 git-clean gate）。
- 来源：US-3；决策 8。

### Task-1

命令实现（来源：决策 8；US-3）

- 验收标准：`dt new-profile <name>` 子命令注册并进入帮助文案；前置校验（base 根 `$id` 已入账、全部 token 已入账 `$id`、base 无重复 `$id`）缺失时报错并引导 `wave dt ids --write`；name 归一化与重名拒绝复用 `normalizeProfileName`/profile 发现逻辑；铸 profile 文档 `$id`；`$override` 区预填全部 base token（key = token `$id`，value = 源 `$value` 原样，引用字符串保留）；写入 `profiles/<name>.yaml`（目录缺失时创建）；receipt 输出创建路径与后续提示（改值、删冗余、`dt build --profile` 验证）。
- 可动文件范围：新增 `src/cli/commands/dt-new-profile.ts`；修改 `src/cli/commands/dt.ts`。
- 依赖：M1 闸门通过（build 可消费新格式）。
- 固有风险："源值原样"以解析后 YAML 节点深拷贝为准（不保留源引号风格），生成物统一格式化属预期；文件头注释是否添加实现期定（Draft 未决项）。

- [ ] 刻画命令行为测试（红）
- [ ] 实现命令（绿）
- [ ] `bun test` 相关文件 + `pnpm typecheck`
- [ ] 原子提交

### Task-2

行为测试与闭环（来源：Testing Decisions；US-3）

- 验收标准：生成物快照断言（文档 `$id` 为 32 位小写 hex、`$config.base` 等于 base 根 `$id`、`$override` 覆盖全部 base token）；三类前置拒绝（base 无根 `$id`、存在未入账 token、base 存在重复 `$id`）均断言指向 `dt ids --write` 的引导文案且拒绝时零文件写入；生成后直接 `dt build --profile <name>` 成功（闭环）。
- 可动文件范围：新增命令测试文件（命名实现期定）。
- 依赖：Task-1。
- 固有风险：闭环测试在临时目录组装 workspace，注意清理。

- [ ] 编写生成物断言
- [ ] 编写前置拒绝断言
- [ ] 编写闭环断言并转绿
- [ ] 原子提交

> [!IMPORTANT]
> Milestone-3 闸门：命令行为测试全绿、手工 smoke 通过；未通过不进入 Milestone-4。

## Milestone-4

ids 与 doctor 适配

- 验证主题：`dt ids` 维护 profile 文档槽位并对 `$config.base` 冲突硬阻塞（全 workspace 零写入、二次运行幂等）；`dt doctor` 具备 profile 健康项（`$config.base` 缺失/不符、覆写未命中为 error；冗余覆写单条汇总且不影响退出码）。
- 核验基线：ids/doctor 相关测试全绿；`pnpm dev -- dt ids -f <新格式 workspace>/main.yaml` dry-run 报告正确、`--write` 幂等；`pnpm dev -- dt doctor -f <workspace>/main.yaml` 健康项断言正确。
- 来源：US-5；决策 9、10。

### Task-1

ids 适配（来源：决策 9；US-5）

- 验收标准：profile 文档根 `$id` 槽位纳入维护（缺失/空槽铸填、已入账永不重铸，报告口径与 main 一致）；逐 profile 校验 `$config.base` 与 main 根 `$id`（缺失/不符 = problem，全 workspace 零写入）；`$override` 区不参与身份扫描（既有 `$` 前缀跳过自然成立，补行为测试钉死）；`tests/dt-ids.test.ts` 跨文件认养断言（:254 一带）按新语义调整（覆写区无 id，同步职责消解为新 token 与文档槽位）。
- 可动文件范围：`src/core/ids/ids.ts`、`tests/dt-ids.test.ts`。
- 依赖：M1 闸门通过。
- 固有风险：profile 文档槽位的报告计数（added/synced）需在报告文案中可与 token 槽位区分；git 清洁门禁与 dry-run 行为不变。

- [ ] 刻画 ids 新行为测试（红）
- [ ] 实现适配（绿）
- [ ] `bun test` 相关文件 + `pnpm typecheck`
- [ ] 原子提交

### Task-2

doctor 健康项（来源：决策 10；US-5）

- 验收标准：`$config.base` 缺失/不符、覆写未命中 → error finding（影响退出码）；冗余覆写 → 单条汇总（x/y 条覆写与 base 相同，建议删除），不影响退出码；profile 文档身份进入身份报告；覆写未命中检查复用 M1 合并层的 id 索引能力，不另写一套。检查矩阵（决策 10）：默认（无 `--profile`）将 main + 全部 profiles 纳入 workspace 级健康项扫描；`--profile <name>` 只检查该 profile；`--json`/`--status` 以各格式既有 finding 通道结构化输出同一内容；resource 严格检查的既有 scope 合同（默认 main、`--profile` 单选）不变。矩阵四格正反用例列入本碑闸门：默认扫描覆盖未被选择的 profile、`--profile` 排除其他 profile、`--json` 与 `--status` 输出与文本一致的 findings 且存在 error 时退出码非零。
- 可动文件范围：`src/core/doctor/`（identity 与 workspace 检查相关模块）、`src/cli/commands/doctor.ts`（`--json`/`--status` 的早返回、序列化与退出码）。
- 依赖：M1 闸门通过。
- 固有风险：doctor 单文件扫描只见 profile 原文件，base 树 id 索引需要加载 main——注意 doctor 现有加载链路（selectProfileDocument）的复用点。

- [ ] 刻画健康项测试（红）
- [ ] 实现健康项（绿）
- [ ] `bun test` 相关文件 + `pnpm typecheck`
- [ ] 原子提交

### Task-3

M4 测试收尾（来源：Testing Decisions）

- 验收标准：ids 硬阻塞/槽位维护/幂等三类断言；doctor 四个健康项正反断言；`tests/fixture-identity-audit.test.ts` 规则核对通过（profile 新 token `$type` 文件内可判定的审计口径与本计划一致）。
- 可动文件范围：`tests/dt-ids.test.ts`、doctor 相关测试、`tests/fixture-identity-audit.test.ts`。
- 依赖：Task-1、Task-2。
- 固有风险：无。

- [ ] 补齐三类 ids 断言
- [ ] 补齐 doctor 正反断言
- [ ] 全量 `bun test` + `pnpm typecheck`
- [ ] 原子提交

> [!IMPORTANT]
> Milestone-4 闸门：ids/doctor 相关测试全绿、手工 smoke 通过；未通过不进入 Milestone-5。

## Milestone-5

文档同步与交付回归

- 验证主题：SPEC/manual/wiki 与行为终态一致；全量回归与 Orca canary 终验通过。
- 核验基线：`bun test` 全量绿；`pnpm typecheck`；`pnpm dev -- dt build -f tests/fixtures/themes/orca-realistic/main.yaml --profiles all --out <guarded-temp-dir>` canary 终验通过；文档 diff 自查覆盖全部行为变化点（profile 模型、`$id` 合同、sketch meta、typography 扩展、doctor 矩阵）。
- 来源：Constraints（文档/wiki 同步）；决策 5、11、13；Testing Decisions。

### Task-1

文档同步（来源：Constraints；决策 5、11、13）

- 验收标准：`docs/SPEC.md` 更新（Mental Model 的 profile 定义、Profile Model 整节、`$id` 章节（profile 文档身份解禁与 `$config.base` 校验）、sketch meta 形状、typography 扩展章节、`fontSize` 与 `baseFontSize` 兄弟键区分、拒绝矩阵不变说明）；`manual/` 的 profile 与 typography 用户向章节更新；`docs/simple-wiki/wiki` 受影响页面同步（含 `$helper` 约定页核对无冲突）；文档遵循写作约束（中文、无 emoji）。
- 可动文件范围：`docs/SPEC.md`、`manual/`、`docs/simple-wiki/wiki/`。
- 依赖：M1-M4 全部行为落地（文档写终态）。
- 固有风险：无。

- [ ] SPEC 更新
- [ ] manual 更新
- [ ] wiki 同步
- [ ] 原子提交

### Task-2

全量回归终验（来源：Testing Decisions）

- 验收标准：`bun test` 全量绿；`pnpm typecheck`；Orca canary 按核验基线终验通过，sketch payload `meta.themeId`/`baseId` 与 `sketch.skip` 负向断言人工抽查；无全局 `--platform` 覆盖；fixture 新格式核验测试（M1 建立）保持通过；fixture 实例完整性巡检（施工注记 M1-3）建立并通过——全部可构建实例 `--profiles all`（含 night 时 `+ --night`）构建成功且产物齐备，invalid-case 实例断言预期错误出口码。
- 可动文件范围：全仓。
- 依赖：Task-1。
- 固有风险：无。

- [ ] 全量 `bun test` + `pnpm typecheck`
- [ ] Orca canary 与抽查
- [ ] 原子提交

> [!IMPORTANT]
> Milestone-5 闸门：核验基线全部满足；计划进入交付态。
