---
title: Wave DT Profile Model
type: decision
created: 2026-08-31
updated: 2026-09-29
sources: [raw/wave-dt-profile-model.md, raw/wave-token-helper-private.md, raw/2026-07-09-wave-dt-profile-model.md, raw/2026-07-28-reference-gated-resource-loading.md, raw/2026-07-28-design-token-legacy-cutover-design.md, raw/2026-07-29-design-token-legacy-cutover.md, raw/2026-07-29-dtcg-standard-types-retrospective.md, raw/2026-07-09-wave-dt-manual-test-fixes.md, raw/handoff.md, raw/2026-09-29-profile-override-contract.md, raw/2026-09-24-sketch-swatch-ref-retirement.md]
topic: Wave DT workspace model
tags: [profile, main.yaml, night, taxonomy, resource]
context: 5
status: current
---

# Wave DT Profile Model

## 公共模型

Wave `dt` 面向维护公共 design-token API 并导出到多个平台。DTCG shape 是数据基础，但 Wave 自己拥有 authoring taxonomy；Token Studio、Style Dictionary、Sketch、CSS 和 JSON 是输入或输出，不是 Wave taxonomy 的 source of truth。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

当前系列由一个 base 与全部 profiles 构成：`main.yaml` 承载默认主题，`profiles/<name>.yaml` 是其差量层，继承 base token 树后覆写值或新增 token。结构分歧应另建 base 目录，不应复制完整主题到 profile。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

历史上，项目代表一个物理 design system 或 brand workspace，profile 代表一个消费目标；旧模型允许各 profile 拥有独立 `theme` 公共 API，只继承 config、不继承 theme。该 standalone 模型已被上述差量合同取代，没有兼容层或 profile 迁移命令。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

## 文件与选择

有效布局是 `main.yaml`、`main@night.yaml`、`profiles/mobile.yaml`、`profiles/mobile@night.yaml`。profile 不能嵌套目录；名称由文件名推断，ASCII 空格归一化为 `_` 并转小写，非法字符和归一化冲突必须报错。构建选择是显式的：默认只构建 main，`--profile <name>` 单选，`--profiles all` 构建 main 与全部 profiles，`--night` 才请求对应 overlay。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

Night 是 day-local 路径式叶子覆盖，不使用 `$override`，作用在 profile 合并后的 day tree 上；只能覆写已存在的 `theme.color.*` 和 `theme.state.*`，不能改变字体基准或新增 public API。缺失或一般非法 overlay warning + skip；根 `$id` 禁止声明，token 身份不得换发，这些身份错误为 `FORMAT_ERROR`，不能作为普通 skip。Night 的 themeId/baseId 和 token 身份继承 day。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

旧资料的“缺失或任何非法 Night 都不失败 day build”属于历史概括；当前必须区分上述身份硬错误。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

7/9 implementation plan 的“Completed and released in Wave 0.16.0”是带未勾选任务的历史标签；profile/night 规则的实际发布时间与行为判断应以 [Wave DT Research Handoff](../raw/handoff.md) 的 release evidence 为准，不能把计划清单本身当作运行时证据。[Wave DT Profile Model Implementation Plan](../raw/2026-07-09-wave-dt-profile-model.md)

## Config 与资源

profile `$config` 是闭合对象，只接受必填 `base` 和可选 `resource`、`parameter`、`parameterGroup`，禁止 `theme` 与未知字段。`base` 是非空字符串，逐字等于原始 main 文档 `$id`，不是路径或 token ID；main 未入账、关联缺失或不匹配均拒绝。profile 继承已在 main 上下文解析的 config，resource 追加、parameter 按字段覆盖、同名 parameterGroup 合并；profile-local 路径相对自身文件解析，CLI override 最后生效。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md) [Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

reference-gated resource loading 的边界仍是：`$config.resource` 可缺省或为空；Build 容忍声明缺失、损坏或重复，只在 effective token graph 引用到缺失或歧义 namespace 时失败，并报告引用位置。重复 namespace 从 tolerant dictionary 移除，不能按声明顺序解析；receipt 只记录成功进入 dictionary 的资源。Doctor 严格检查默认 main 或所选单 profile 的合并资源声明，即使未被使用，也不因全 workspace 健康扫描扩为全 profile resource 扫描。[Reference-Gated Resource Loading Implementation Plan](../raw/2026-07-28-reference-gated-resource-loading.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

普通 workspace doctor 默认健康扫描 main 与全部 profiles，`--profile` 隔离所选路径；text、JSON、status 共用 findings 和退出状态，结构/base/override/身份错误非零。与 base 源值深等值的冗余 override 只给一条 `info` 汇总 x/y，不先解析引用；WCAG 选择合同不变。旧资料把 all-profile scan 留为 follow-up，是被本次健康扫描更新的历史断言，不代表资源校验范围也扩大。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md) [Reference-Gated Resource Loading Implementation Plan](../raw/2026-07-28-reference-gated-resource-loading.md)

7/9 manual-test-fixes 记录的运行时边界是：编译 `dist/wave` 必须携带内置 resource，并让 source/dist 共用同一资源目录解析；`dt doctor` 在当前目录存在 `main.yaml` 时默认检查它，资源解析失败时仍应给出 dimension migration guidance，不能输出无条件的资源成功提示。该计划的完成/发布标题不单独构成证据，相关 release 与 Orca smoke 以 handoff 记录为准。[Wave DT Manual Test Fixes Implementation Plan](../raw/2026-07-09-wave-dt-manual-test-fixes.md) [Wave DT Research Handoff](../raw/handoff.md)

## 值覆盖与新增 token

profile 根消费 `$schema`、自身 `$id`、`$config`、`$override`；非 `$` root key 是新增 token 树。未知 `$` 前缀根键，包括 `$helper` 与文档级 `$extensions`，被跳过，不登记成 token 或 override 目标。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

`$override` 按 base token `$id` 定位，每项必须恰好是 `{ $value: ... }`。未命中、缺少 `$value` 或附带 `$id`、`$type`、`$extensions` 等其他字段均拒绝；根文档 ID 不是合法 token 目标。对象、数组与 composite 整个源 `$value` 替换，不深合并；引用和 `$ref` 留到合并后解析。重复 token ID 按源文档序首个命中，沿用既有降级语义。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

新增 token 不能撞已有路径，不能把已有 token/group 换形。已有 group 只接受新成员，禁止任何 `$` 元数据重声明，即使 `$type`、`$extensions`、`$description`、`$extends` 与 base 相同。新路径允许完整定义，但新 token 的类型必须在 profile 自身确定，不能只依赖 main group 类型。没有删除 token、改类型或改已有扩展的机制；旧 fixture 的扩展分歧已舍弃并继承 base，真实结构需求应新建 base。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

合并先克隆 base、按 ID 替换源值、嫁接新增树，再执行 `$extends`、引用、转换与输出。格式错误为 `FORMAT_ERROR`，保留 profile 来源路径和 token/id 定位；合成行号可指向合成内容。一般 profile 不要求 base 全部 token 已入账，只有 override 目标必须已入账。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

## 文档身份与显式命令

文档根 `$id` 与 token `$id` 分属两个命名空间，根身份不进入 token 路径权威、冲突图或 override 索引。main/profile 自身 `$id` 可省略；构建时若声明必须是非空字符串，但有 profile 时 main 必须已入账以验证 base。profile 主题身份来自自身文档，不继承 main 身份。Sketch `meta` 为 `{ themeId: string | null, baseId: string | null, version: 2 }`；main 的 baseId 为 null，profile 的 baseId 为 main 身份，自身未入账时 themeId 为 null。版本仍为 2，拒绝额外字段的旧 plugin 需同步允许 baseId。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

`wave dt new-profile <name>` 是全量源值快照生成器，额外要求 main 文档与全部源 token 已入账，且 token ID 不重复；这不是一般 profile 的格式前提。它生成自身新文档 ID、base 关联和全量 `$override`，引用原样保留、不复制结构元数据。名称/碰撞或前提失败零写入，不覆盖既有文件；删除冗余快照项后，该值才随 base 演进。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

`wave dt ids` 默认 dry-run，显式 `--write` 才维护 main/profile 文档根槽位与 token 身份；night 和 `$override` 不写回。根 missing/null/blank 可维护，已入账字符串（含 YAML 字符串 alias）永不重铸；非法 map/sequence/boolean/number 阻塞整个 workspace 写入。base 关联必须先与原始 main 身份核对，不能用拟生成的 main ID 修复坏关联；token 路径权威与 all-or-nothing 冲突规则不变。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

系列 rem 基准使用已入账 number token、平铺 typography 扩展引用与 ID override，不是已有 group metadata 的例外；见 [Sketch Typography Output Contract](sketch-typography-output-contract.md)。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

## Main-only 入口合同

当前 main-only cutover 将 `main.yaml::$config` 定为唯一 design-token workspace entry：无显式文件时只读取 `<cwd>/main.yaml`；显式入口也必须是普通文件、文件名为 `main.yaml`、根为 object 且含有效 `$config`。`themefile`、resource 文件、profile 文件和 Night 文件都不是 workspace entry。[Design Token 历史兼容裁剪设计](../raw/2026-07-28-design-token-legacy-cutover-design.md) [Design Token 历史兼容裁剪 Implementation Plan](../raw/2026-07-29-design-token-legacy-cutover.md)

Build、design-token Doctor 和 WCAG 共用 main-only 输入分类与拒绝矩阵；profile/night 仍通过选择参数作为 scope。显式传入的 `themefile`、resource、profile、night 文件、目录或任意非 `main.yaml` YAML 都应在读取前拒绝；这不影响 `--profile <name>` 和 `--night` 作为合法 scope 选择。拒绝或 `main.yaml` 解析失败时，不新增或覆盖生成产物，已有输出字节必须保持不变。[Design Token 历史兼容裁剪设计](../raw/2026-07-28-design-token-legacy-cutover-design.md) [Design Token 历史兼容裁剪 Implementation Plan](../raw/2026-07-29-design-token-legacy-cutover.md)

该 cutover 删除 `themefile` parser、无 main 的 RESOURCE 直出、顶层 `wave create`/`wave init` 以及对应 legacy fixture/benchmark 分支；`wave dt` 与 `wave design-token` 保持等价，`wave dt init` 只创建 main-only workspace。资源仍只提供引用解析数据，Build 按 effective token graph 容忍未引用声明，Doctor 对目标 workspace 的声明做严格检查。无效或空 platform 必须在 formatter 前失败；所有 day/profile/night pass 先按最终路径全局规划，exact/strict-prefix collision 在首次写入前失败，不能产生半套输出。[Design Token 历史兼容裁剪设计](../raw/2026-07-28-design-token-legacy-cutover-design.md) [Design Token 历史兼容裁剪 Implementation Plan](../raw/2026-07-29-design-token-legacy-cutover.md)

这里的 main-only 合同是后于 0.16.0 profile note 的更新边界；旧页面中的 profile/night 模型保留其历史 scope 决策，不能再把旧 `themefile` 或 resource-direct fallback 当作可用入口。[Wave DT Research Handoff](../raw/handoff.md)

## Public theme taxonomy

`theme` 是消费层公共 API。推荐根包括 `color`、`state`、`shadow`、`gradient`、`border`、`radius`、`font`，以及仍保留设计中的 `size`、`space`、`layout`。`theme.dimension` 不应作为公共输出根；迁移期间 build 只发一次 warning，Doctor 提供详细 guidance。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

像 radius、border width、outline offset、shadow geometry 一类 pixel-like public value 采用 number-first；带 `unit: px` 的 dimension reference 可归一化为 number。这个规则不适用于 color、state 和 font composite。`theme.state.*` 是 0..1 的公共状态强度参数，不是完成态颜色，也不自动绑定 alpha。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

## Outline 历史与当前边界

历史 profile note 使用 `theme.border.outline.*`、`$type: border` 与 `$extensions.outline.offset`，不引入 `$type: outline`、顶层 `theme.outline`、`$extensions.wave` 或 `outline.sketch`。当时 CSS 输出 outline value 与 offset companion，Sketch 用 ring 在前、white gap 在后的两层 shadow 模拟，gap 固定为 `#ffffff`。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

旧 `$extensions.outline` 拼写不再是当前输入：运行时已验证当前位置为 `$extensions.platform.sketch.outline.offset`，旧键硬拒绝。通用 path/property/skip 继承的来源演进见 [Sketch Extensions Contract](sketch-extensions-contract.md)，该页已标为 superseded，保留的 `$extensions.sketch` 拼写只能按历史阅读，不能据此恢复旧 namespace。两层 outline 结构仍保留，但 payload v2 的颜色位置已统一为 HEX8 快照，gap 为 `#ffffffff`，不恢复 Swatch 绑定；见 [Sketch Swatch Binding Retirement](sketch-swatch-binding-retirement.md)。[Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)

## 历史切换边界

handoff 的早期章节记录 0.16.0 发布时的 profile、night、CSS/Sketch 和 `$helper` 决策；同一 evidence 文档在 2026-07-29 的 closeout 中又记录 0.22.0 cutover，使 `main.yaml::$config` 成为唯一 design-token workspace entry，并移除 deprecated `themefile`、direct RESOURCE generation 及 top-level `wave create`/`wave init`。阅读旧章节时应保留其历史证据，但以该后续 cutover 作为更新的入口边界。[Wave DT Research Handoff](../raw/handoff.md)

更细的 `$helper` 暂行边界见 [Wave Token Helper 文档约定](wave-token-helper-documentation-convention.md) [Wave Token Helper Notes](../raw/wave-token-helper-private.md)；标准类型变更的分层验证见 [DTCG 标准类型优化复盘](dtcg-standard-types-retrospective.md) [DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)。
