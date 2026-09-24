---
title: Sketch Typography Output Contract
type: decision
created: 2026-08-31
updated: 2026-09-24
sources: [raw/2026-06-18-sketch-extensions.md, raw/2026-07-13-sketch-typography-color-reference.md, raw/2026-07-13-typography-output-follow-up-design.md, raw/2026-07-13-typography-output-follow-up.md, raw/2026-07-13-typography-stroke-skip-design.md, raw/2026-07-13-typography-stroke-skip.md, raw/2026-07-14-typography-rem-baseline.md, raw/2026-07-27-sketch-color-reference-full-path.md, raw/2026-09-24-sketch-swatch-ref-retirement.md]
topic: Typography
tags: [typography, Sketch, lineHeight, rem, fontFamily]
context: 2
status: current
---

# Sketch Typography Output Contract

## Materialized typography

Typography group 的 `typography.defaults` 只允许五个标准字段：`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`；token 自身的 `$value` 可再包含 legacy `color`。defaults 按祖先到子组浅合并，token `$value` 最后覆盖；materialized value 必须补齐五字段，缺失时以 token path 报错。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md)

CSS 对 typography 的 font family array 生成合法 font stack，处理 quoting/escaping，并复用已输出且规范化等值的全局 family variable；无等值 token 时保留局部 family。Sketch 对 array 只选择可靠具体字体：优先 `PingFang SC`，否则选择第一个非 system/generic alias；只有 aliases 时省略 `fontFamily`，不猜测机器字体。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md)

typography color 是独立字段，不进入 CSS `font` shorthand。早期 stroke 设计提到的 legacy `color` 字段保留在 materialized/JSON/JSONC、但由 CSS/Sketch 忽略；output-follow-up 针对未覆盖的同文档直接 color reference 曾定义独立 CSS `var(--<color-token>)` 与 Sketch `textColor` 输出。该 Sketch `textColor` 能力已随 payload v2 退役，同文档 `@/<full-output-path>` 引用合同整体撤回，Sketch layer 颜色位置一律输出 HEX8 具体值；详见 [Sketch Swatch Binding Retirement](sketch-swatch-binding-retirement.md)。CSS 的 `var(--<color-token>)` 引用保留，不受该撤回影响。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md) [Sketch Composite Color Reference Implementation Plan](../raw/2026-07-13-sketch-typography-color-reference.md) [Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)

## Line height 与 rem

无单位 `lineHeight` 表示倍率，Sketch 用 materialized `fontSize * lineHeight`；带单位值表示绝对行高并取其数值。CSS 保留倍率或绝对单位。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md)

早期 7/13 follow-up 只对倍率分支使用 `Math.ceil`，并明确 px/pt 绝对行高不取整；该论断属于历史阶段。[Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md)

后续 rem baseline 更新为：`rem` 可用于 `fontSize`、绝对 `lineHeight` 和 `letterSpacing`；默认基准为 16，可由唯一位置 `theme.font.$extensions.typography.baseFontSize` 覆盖。CSS 仅在选中的 typography 使用 rem 时在 `:root` 输出 `<base>px`，token 中仍保留 rem；Sketch 的 rem fontSize/letterSpacing 保留最多三位小数，所有最终 `lineHeight` 无论倍率、px、pt 还是 rem 都先得到数值，再 `Math.ceil`。[Typography REM Baseline Implementation Plan](../raw/2026-07-14-typography-rem-baseline.md)

`baseFontSize` 是正的无单位 CSS px number，不是 typography default，也不进入 JSON/JSONC。named profile 可有自己的基准，Night overlay 不能修改它而继承 day profile 值；px/pt-only typography 不因没有 rem 而增加 CSS root font-size。[Typography REM Baseline Implementation Plan](../raw/2026-07-14-typography-rem-baseline.md)

## Sketch-only skip

`sketch.skip` 是 group/token 可声明的 boolean。group 值向后代继承，更深 group 或 token 的显式值覆盖；只有 Sketch emission list 过滤，CSS、JSON、JSONC 不受影响。skip token 仍保留在完整 token 集合中，供 `inheritColor.siblingSlot` 等依赖查询。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md)

在 `$extends` 中，`$extensions.sketch` 使用 whole-namespace override：derived group 只要声明任一 sketch 字段，就整体替换 base 的 `path`、`property`、`skip`；这条规则 supersede 了 6/18 implementation plan 原先要求的 sketch nested merge。普通 group traversal 的 path/skip inheritance 仍按上面的 group/token 优先级工作。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography、虚线边框与 Sketch 跳过输出实施计划](../raw/2026-07-13-typography-stroke-skip.md) [Sketch Extensions Implementation Plan](../raw/2026-06-18-sketch-extensions.md)

## Scope note

本页整合 7/13-7/14 的 typography 设计与实施计划；其中 7/13 的绝对行高不取整属于被后续 rem baseline 更新的历史规则。实现计划中的 checkbox 不是完成证据，现行数值 contract 以后续行为快照和同批 full-path/typography source chronology 为准。[Typography REM Baseline Implementation Plan](../raw/2026-07-14-typography-rem-baseline.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md) [Typography Output Follow-up Implementation Plan](../raw/2026-07-13-typography-output-follow-up.md)
