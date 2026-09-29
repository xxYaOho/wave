---
title: Sketch Typography Output Contract
type: decision
created: 2026-08-31
updated: 2026-09-29
sources: [raw/2026-06-18-sketch-extensions.md, raw/2026-07-13-sketch-typography-color-reference.md, raw/2026-07-13-typography-output-follow-up-design.md, raw/2026-07-13-typography-output-follow-up.md, raw/2026-07-13-typography-stroke-skip-design.md, raw/2026-07-13-typography-stroke-skip.md, raw/2026-07-14-typography-rem-baseline.md, raw/2026-07-27-sketch-color-reference-full-path.md, raw/2026-09-24-sketch-swatch-ref-retirement.md, raw/2026-09-29-profile-override-contract.md]
topic: Typography
tags: [typography, Sketch, lineHeight, rem, fontFamily]
context: 3
status: current
---

# Sketch Typography Output Contract

## Materialized typography

当前 `$extensions.typography` 只能出现在有效 `$type: typography` 的 group，是非空闭合对象，允许六个平铺兄弟字段：`baseFontSize`、`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`。五个 composite 兜底字段按祖先到子 group 浅合并，token `$value` 最后覆盖；materialized value 必须补齐五字段。`fontSize` 是 composite 字段兜底，`baseFontSize` 是 rem 换算基准，不是第六个 composite 字段；兜底字段允许引用。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

历史设计使用 `typography.defaults` 嵌套闭合对象，只含五个标准字段；token `$value` 还可含 legacy `color`。其中祖先到子组浅合并、token 最后覆盖与五字段完整性规则延续至今，但旧 `defaults:` 形状已硬拒绝，不提供兼容层。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

CSS 对 typography 的 font family array 生成合法 font stack，处理 quoting/escaping，并复用已输出且规范化等值的全局 family variable；无等值 token 时保留局部 family。Sketch 对 array 只选择可靠具体字体：优先 `PingFang SC`，否则选择第一个非 system/generic alias；只有 aliases 时省略 `fontFamily`，不猜测机器字体。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md)

typography color 是独立字段，不进入 CSS `font` shorthand。早期 stroke 设计提到的 legacy `color` 字段保留在 materialized/JSON/JSONC、但由 CSS/Sketch 忽略；output-follow-up 针对未覆盖的同文档直接 color reference 曾定义独立 CSS `var(--<color-token>)` 与 Sketch `textColor` 输出。该 Sketch `textColor` 能力已随 payload v2 退役，同文档 `@/<full-output-path>` 引用合同整体撤回，Sketch layer 颜色位置一律输出 HEX8 具体值；详见 [Sketch Swatch Binding Retirement](sketch-swatch-binding-retirement.md)。CSS 的 `var(--<color-token>)` 引用保留，不受该撤回影响。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md) [Sketch Composite Color Reference Implementation Plan](../raw/2026-07-13-sketch-typography-color-reference.md) [Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)

## Line height 与 rem

无单位 `lineHeight` 表示倍率，Sketch 用 materialized `fontSize * lineHeight`；带单位值表示绝对行高并取其数值。CSS 保留倍率或绝对单位。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md)

早期 7/13 follow-up 只对倍率分支使用 `Math.ceil`，并明确 px/pt 绝对行高不取整；该论断属于历史阶段。[Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md)

后续 rem baseline 更新为：`rem` 可用于 `fontSize`、绝对 `lineHeight` 和 `letterSpacing`；默认基准为 16，可由唯一位置 `theme.font.$extensions.typography.baseFontSize` 覆盖。CSS 仅在选中的 typography 使用 rem 时在 `:root` 输出 `<base>px`，token 中仍保留 rem；Sketch 的 rem fontSize/letterSpacing 保留最多三位小数，所有最终 `lineHeight` 无论倍率、px、pt 还是 rem 都先得到数值，再 `Math.ceil`。[Typography REM Baseline Implementation Plan](../raw/2026-07-14-typography-rem-baseline.md)

`baseFontSize` 仅允许在 `theme.font.$extensions.typography` 声明，是有限正 number（CSS px）或解析为该 number 的引用；默认 16，不接受 dimension，也没有 iOS pt / Android dp 投影。CSS/Sketch 的既有非负值、字体和 weight 等平台拒绝矩阵不变，不提升为输入 schema 限制。扩展 metadata 被消费，不作为 composite 字段进入 JSON/JSONC；下沉的 number token 本身仍正常输出。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

系列基准应在 base 定义已入账 number token，例如 `theme.font.base-size`，让 `theme.font.$extensions.typography.baseFontSize` 引用它，再由 profile 按该 token ID 用 `$override` 改值。profile 不能在已有 font group 重声明扩展，不存在 group metadata 例外；Night 不能改基准而继承 day。profile 差量与身份规则见 [Wave DT Profile Model](wave-dt-profile-model.md)。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

旧 rem baseline 资料称 named profile 可有自己的基准，且 `baseFontSize` 不进入 JSON/JSONC；这是旧独立 profile 形态下的表述。当前通过真实 token + 引用 + ID override 调整有效基准，扩展消费与 token 输出必须分开理解；px/pt-only typography 仍不增加 CSS root font-size。[Typography REM Baseline Implementation Plan](../raw/2026-07-14-typography-rem-baseline.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

## Sketch-only skip

当前 Sketch skip 的挂载点为 `$extensions.platform.sketch.skip`，是 group/token 可声明的 boolean；group 值向后代继承，更深 group 或 token 的显式值覆盖。只有 Sketch emission list 过滤，CSS、JSON、JSONC 不受影响；被跳过 token 仍供引用和依赖查询。验证 payload 必须先核对实际 skip，再对被跳过项作负向断言，不能要求所有源 token 都有资产记录。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

历史来源使用 `$extensions.sketch` 拼写，并在 `$extends` 中采用 whole-namespace override：derived group 只要声明任一 sketch 字段，就整体替换 base 的 `path`、`property`、`skip`。该语义取代了 6/18 的 sketch nested merge 预期，普通 group traversal 的 path/skip 继承另按最近显式值处理；旧 namespace 拼写不能继续作为当前输入示例。来源演进见 [Sketch Extensions Contract](sketch-extensions-contract.md)。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography、虚线边框与 Sketch 跳过输出实施计划](../raw/2026-07-13-typography-stroke-skip.md) [Sketch Extensions Implementation Plan](../raw/2026-06-18-sketch-extensions.md)

## Scope note

本页保留 7/13-7/14 的 typography 来源：嵌套 defaults、旧独立 profile 基准表述和 7/13 的绝对行高不取整均按历史阅读。现行平铺字段与 ID override 基准模式以新合同为准；rem 保留、Sketch 换算和最终行高向上取整继续有效。实现计划 checkbox 不是完成证据，新材料记录的稳定实现依据也不代表用户真实 Orca 工作区已完成迁移。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md) [Typography REM Baseline Implementation Plan](../raw/2026-07-14-typography-rem-baseline.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md) [Typography Output Follow-up Implementation Plan](../raw/2026-07-13-typography-output-follow-up.md)
