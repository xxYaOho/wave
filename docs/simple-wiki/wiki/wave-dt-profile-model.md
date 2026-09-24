---
title: Wave DT Profile Model
type: decision
created: 2026-08-31
updated: 2026-08-31
sources: [raw/wave-dt-profile-model.md, raw/wave-token-helper-private.md, raw/2026-07-09-wave-dt-profile-model.md, raw/2026-07-28-reference-gated-resource-loading.md, raw/2026-07-28-design-token-legacy-cutover-design.md, raw/2026-07-29-design-token-legacy-cutover.md, raw/2026-07-29-dtcg-standard-types-retrospective.md, raw/2026-07-09-wave-dt-manual-test-fixes.md, raw/handoff.md]
topic: Wave DT workspace model
tags: [profile, main.yaml, night, taxonomy, resource]
context: 3
status: current
---

# Wave DT Profile Model

## 公共模型

Wave `dt` 面向维护公共 design-token API 并导出到多个平台。DTCG shape 是数据基础，但 Wave 自己拥有 authoring taxonomy；Token Studio、Style Dictionary、Sketch、CSS 和 JSON 是输入或输出，不是 Wave taxonomy 的 source of truth。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

项目代表一个物理 design system 或 brand workspace；profile 代表其中一个具体消费目标。`main.yaml` 是 default profile 及项目基线，`profiles/<name>.yaml` 是 named profile，profile 之间拥有独立 `theme` 公共 API。`$config.resource`、`$config.parameter` 和 `$config.parameterGroup` 可以从 main 继承，但 theme 不继承。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

## 文件与选择

有效布局是 `main.yaml`、`main@night.yaml`、`profiles/mobile.yaml`、`profiles/mobile@night.yaml`。profile 不能嵌套目录；名称由文件名推断，ASCII 空格归一化为 `_` 并转小写，非法字符和归一化冲突必须报错。构建选择是显式的：默认只构建 main，`--profile <name>` 选择一个 named profile，`--profiles all` 选择全部，`--night` 才请求对应 overlay。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

Night 是 profile-local color-mode overlay，不是另一个 profile。它只能在 `theme.color.*` 和 `theme.state.*` 下覆写；缺失或非法 Night 不应失败 day build，而是输出 `Night Mode unavailable/invalid and skipped` 并跳过 night output。最终 day/night 的 public API surface 应保持一致。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

7/9 implementation plan 的“Completed and released in Wave 0.16.0”是带未勾选任务的历史标签；profile/night 规则的实际发布时间与行为判断应以 [Wave DT Research Handoff](../raw/handoff.md) 的 release evidence 为准，不能把计划清单本身当作运行时证据。[Wave DT Profile Model Implementation Plan](../raw/2026-07-09-wave-dt-profile-model.md)

## Config 与资源

profile 先继承已在 `main.yaml` 上下文解析的默认 config，再解析并合并 profile-local config；CLI override 最后生效。Build 关注 effective token graph 是否能解析，Doctor 则严格检查声明；被声明但未引用的资源可以保留，引用到缺失或歧义 namespace 才应使 build 失败。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

reference-gated resource loading 将上述分工具体化：`$config.resource` 在 `main.yaml` 和 named profile 中可缺省或为空；Build 容忍声明缺失、损坏或重复，只在 effective token graph 引用到缺失或歧义 namespace 时失败，并把引用位置带入错误。重复 namespace 必须从 tolerant dictionary 移除，不能按声明顺序解析；receipt 只记录成功加载并进入 dictionary 的资源。Doctor 对当前检查目标的每个声明保持严格校验，即使资源未被使用；全 workspace 的 all-profile scan 仍是独立 follow-up。[Reference-Gated Resource Loading Implementation Plan](../raw/2026-07-28-reference-gated-resource-loading.md)

7/9 manual-test-fixes 记录的运行时边界是：编译 `dist/wave` 必须携带内置 resource，并让 source/dist 共用同一资源目录解析；`dt doctor` 在当前目录存在 `main.yaml` 时默认检查它，资源解析失败时仍应给出 dimension migration guidance，不能输出无条件的资源成功提示。该计划的完成/发布标题不单独构成证据，相关 release 与 Orca smoke 以 handoff 记录为准。[Wave DT Manual Test Fixes Implementation Plan](../raw/2026-07-09-wave-dt-manual-test-fixes.md) [Wave DT Research Handoff](../raw/handoff.md)

## Main-only 入口合同

当前 main-only cutover 将 `main.yaml::$config` 定为唯一 design-token workspace entry：无显式文件时只读取 `<cwd>/main.yaml`；显式入口也必须是普通文件、文件名为 `main.yaml`、根为 object 且含有效 `$config`。`themefile`、resource 文件、profile 文件和 Night 文件都不是 workspace entry。[Design Token 历史兼容裁剪设计](../raw/2026-07-28-design-token-legacy-cutover-design.md) [Design Token 历史兼容裁剪 Implementation Plan](../raw/2026-07-29-design-token-legacy-cutover.md)

Build、design-token Doctor 和 WCAG 共用 main-only 输入分类与拒绝矩阵；profile/night 仍通过选择参数作为 scope。显式传入的 `themefile`、resource、profile、night 文件、目录或任意非 `main.yaml` YAML 都应在读取前拒绝；这不影响 `--profile <name>` 和 `--night` 作为合法 scope 选择。拒绝或 `main.yaml` 解析失败时，不新增或覆盖生成产物，已有输出字节必须保持不变。[Design Token 历史兼容裁剪设计](../raw/2026-07-28-design-token-legacy-cutover-design.md) [Design Token 历史兼容裁剪 Implementation Plan](../raw/2026-07-29-design-token-legacy-cutover.md)

该 cutover 删除 `themefile` parser、无 main 的 RESOURCE 直出、顶层 `wave create`/`wave init` 以及对应 legacy fixture/benchmark 分支；`wave dt` 与 `wave design-token` 保持等价，`wave dt init` 只创建 main-only workspace。资源仍只提供引用解析数据，Build 按 effective token graph 容忍未引用声明，Doctor 对目标 workspace 的声明做严格检查。无效或空 platform 必须在 formatter 前失败；所有 day/profile/night pass 先按最终路径全局规划，exact/strict-prefix collision 在首次写入前失败，不能产生半套输出。[Design Token 历史兼容裁剪设计](../raw/2026-07-28-design-token-legacy-cutover-design.md) [Design Token 历史兼容裁剪 Implementation Plan](../raw/2026-07-29-design-token-legacy-cutover.md)

这里的 main-only 合同是后于 0.16.0 profile note 的更新边界；旧页面中的 profile/night 模型继续保留作为 scope 决策，但不能再把旧 `themefile` 或 resource-direct fallback 当作可用入口。[Wave DT Research Handoff](../raw/handoff.md)

## Public theme taxonomy

`theme` 是消费层公共 API。推荐根包括 `color`、`state`、`shadow`、`gradient`、`border`、`radius`、`font`，以及仍保留设计中的 `size`、`space`、`layout`。`theme.dimension` 不应作为公共输出根；迁移期间 build 只发一次 warning，Doctor 提供详细 guidance。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

像 radius、border width、outline offset、shadow geometry 一类 pixel-like public value 采用 number-first；带 `unit: px` 的 dimension reference 可归一化为 number。这个规则不适用于 color、state 和 font composite。`theme.state.*` 是 0..1 的公共状态强度参数，不是完成态颜色，也不自动绑定 alpha。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

## Outline contract

outline 使用 `theme.border.outline.*` 加 `$type: border` 与 `$extensions.outline.offset`，不引入 `$type: outline`、顶层 `theme.outline`、`$extensions.wave` 或平台专属 `outline.sketch`。CSS 输出 outline value 与 offset companion；Sketch 用 ring、white gap 两层 shadow 模拟，ring 在前，gap 固定为 `#ffffff`。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

## 历史切换边界

handoff 的早期章节记录 0.16.0 发布时的 profile、night、CSS/Sketch 和 `$helper` 决策；同一 evidence 文档在 2026-07-29 的 closeout 中又记录 0.22.0 cutover，使 `main.yaml::$config` 成为唯一 design-token workspace entry，并移除 deprecated `themefile`、direct RESOURCE generation 及 top-level `wave create`/`wave init`。阅读旧章节时应保留其历史证据，但以该后续 cutover 作为更新的入口边界。[Wave DT Research Handoff](../raw/handoff.md)

更细的 `$helper` 暂行边界见 [Wave Token Helper 文档约定](wave-token-helper-documentation-convention.md) [Wave Token Helper Notes](../raw/wave-token-helper-private.md)；标准类型变更的分层验证见 [DTCG 标准类型优化复盘](dtcg-standard-types-retrospective.md) [DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)。
