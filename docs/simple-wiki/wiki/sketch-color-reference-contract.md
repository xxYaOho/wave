---
title: Sketch Color Reference Contract
type: decision
created: 2026-08-31
updated: 2026-09-24
sources: [raw/2026-07-13-sketch-typography-color-reference-design.md, raw/2026-07-13-sketch-typography-color-reference.md, raw/2026-07-13-typography-output-follow-up-design.md, raw/2026-07-27-sketch-color-reference-full-path.md]
topic: Sketch output
tags: [Sketch, color-reference, RFC6901, output-path]
context: 2
status: superseded
---

# Sketch Color Reference Contract

> [!WARNING]
> 本页整体已被取代：以下描述的是 v1 `@/<full-output-path>` 同文档字符串引用合同与 v2 试用期的可信 alias 失败语义，未跟进 v2 后续变更。Sketch swatch `$ref` 绑定、`_sketchColorReference` 元数据链路与「内部引用目标未入账即 build 报错」均已整体撤回，layer 颜色位置一律输出 HEX8。取代来源见 [Sketch Swatch Binding Retirement](sketch-swatch-binding-retirement.md) [Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)。旧论断按 SCHEMA 的 superseded 语义保留，不删除。

## 当前合同

Sketch color slot 的默认真值和 fallback 是 `#RRGGBBAA`。只有同一份主题中直接引用当前 `theme.color.*` token，且目标 color token 在同一份 Sketch emission list 中时，才允许在 typography `textStyle.textColor`、普通 border `value.color` 或 outline ring 第一层 `shadow[0].color` 输出 `@/<full-output-path>`；color token 自身、shadow、gradient、inheritColor、literal、external reference 和 alpha override 仍输出 HEX8。[Sketch Composite Color Reference Implementation Plan](../raw/2026-07-13-sketch-typography-color-reference.md) [Sketch Color Reference Full Path Implementation Plan](../raw/2026-07-27-sketch-color-reference-full-path.md)

当前 `@` payload 是 RFC 6901 JSON Pointer，直接指向 emitted color token node。完整路径来自目标 token 的 `buildOutputPath()`，因此同时包含 `sketch.path` 和 `filterLayer` 后的叶子 key；`~` 编码为 `~0`，`/` 编码为 `~1`。不同完整路径可以安全使用相同叶子名。[Sketch Color Reference Full Path Implementation Plan](../raw/2026-07-27-sketch-color-reference-full-path.md)

输出路径和颜色引用 alias 需要在序列化前统一预检：exact path、strict-prefix path、不同 token 的 alias 重复都必须失败，且错误不依赖 token 输入顺序；预检失败时本次 `generateTokens()` 不写新的 platform outputs。[Sketch Color Reference Full Path Implementation Plan](../raw/2026-07-27-sketch-color-reference-full-path.md)

## 可信来源与 fallback

`_sketchColorReference` 只代表未修改的直接 source reference：安全的花括号 color string，或只含 `$ref` 的 color object。可信的内部引用找不到 emitted target 时必须报告 consumer token path 并失败，不能静默降级为 HEX8；缺少该 metadata 的 composite、external reference、literal 和带 alpha override 的表达式则按其 slot 需要输出 HEX8。[Sketch Composite Color Reference Implementation Plan](../raw/2026-07-13-sketch-typography-color-reference.md)

颜色变量 alias 只从当前 Sketch pass 实际可发射的 color token 建立；被 `sketch.skip` 跳过、被 `includeRootKeys` 排除或没有 value 的 token 不能成为 target。`sketch.path` 只影响 JSON 输出层级，不参与 alias 身份计算。[Sketch Typography Color Reference 设计](../raw/2026-07-13-sketch-typography-color-reference-design.md) [Sketch Color Reference Full Path Implementation Plan](../raw/2026-07-27-sketch-color-reference-full-path.md)

## 历史短 key

7/13 的早期合同使用 `@<filtered-key>`，key 只由当前 Sketch pass 的 filtered key 决定，且明确不保存 Sketch 颜色变量引用关系。该合同已标记为 superseded；不能把它与当前 full-output-path RFC 6901 混用。[Sketch Typography Color Reference 设计](../raw/2026-07-13-sketch-typography-color-reference-design.md) [Typography 输出修正设计](../raw/2026-07-13-typography-output-follow-up-design.md)

这次变更允许不同 `sketch.path` 下的相同叶子 key 共存，但它是 breaking output-contract change；旧版 Sync Token 不能在未跟进 importer 的情况下自动消费新引用。Wave 负责生成合同，Sync Token 的导入和缺失变量诊断属于独立仓库边界。[Sketch Color Reference Full Path Implementation Plan](../raw/2026-07-27-sketch-color-reference-full-path.md) [Sketch Typography Color Reference 设计](../raw/2026-07-13-sketch-typography-color-reference-design.md)

## 关联输出

`sketch.path` 的通用 path/property/skip 与 `$extends` 覆盖边界见 [Sketch Extensions Contract](sketch-extensions-contract.md)。Typography 的 rem、lineHeight 和 font-family 平台差异见 [Sketch Typography Output Contract](sketch-typography-output-contract.md)。
