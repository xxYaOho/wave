---
title: Sketch Swatch Binding Retirement
type: decision
created: 2026-09-24
updated: 2026-09-24
sources: [raw/2026-09-24-sketch-swatch-ref-retirement.md]
topic: Sketch output
tags: [Sketch, swatch, color-slot, HEX8, output-contract]
context: 2
status: current
---

# Sketch Swatch Binding Retirement

## Problem Statement

Sketch payload v2 的 layer 记录曾在颜色位置写 `{ "$ref": "<uuid>" }`，把颜色绑定到同清单 color 记录生成的 Swatch。同一份 payload 因此存在两种颜色表达：outline ring 的 ring 层是 uuid 引用，gap 层与全部 shadow / gradient 位置是 HEX8 快照。绑定只覆盖 outline ring 一个位置，读 payload 时必须回到资产清单按 uuid 二次查找才知道颜色是什么；同时它把输出格式的选择反向耦合进 token 组织方式：颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过或被 root selection 排除，会让一个 outline border 的构建直接失败。试用期判定不保留这层映射。[Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)

## Decision

Sketch payload v2 的 layer 颜色位置不再做 Swatch 绑定，一律输出 HEX8 具体值 `#RRGGBBAA`，带 alpha / opacity override 的颜色折入 alpha 通道。与绑定能力配套的元数据链路与校验整体移除。[Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)

撤回的能力：

- v1 的同文档字符串引用合同 `@/<full-output-path>`（RFC 6901 JSON Pointer 形式），不恢复，也不引入第三种颜色绑定形式。
- v2 试用期的 `{ "$ref": "<uuid>" }` 绑定与试用期开关 `SKETCH_SWATCH_REF_MODE`（及其 `SketchSwatchRefMode` 类型、`assembleSketchPayload` 的 `swatchRefMode` 选项）。
- Sketch 专用 `_sketchColorReference` 元数据链路：resolver 两趟（internal / external）、transformer 与类型定义都不再承载该字段，formatter 侧的颜色别名索引（curly 与 JSON Pointer → emitted color token）与 outline ring 的引用解析一并删除。
- 「内部引用目标未入账即 build 报错」的校验：该报错唯一存在点为 outline ring 引用路径，随绑定能力一起消失；`inheritColor` 目标被 `sketch.skip` 跳过时的实现自始为静默回退合成色 `#ff00ff`。

## 代价与边界

撤回的已知代价：outline ring 的颜色不再随 Swatch 联动，Sketch 侧改色需要重新导入 payload。换取的是 payload 的直接可读，以及 token 组织方式与 Sketch 平台表达约束的解耦——颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过，都不再影响 outline border 的构建成功。[Sketch Swatch `$ref` 撤回（实施计划决策层）](../raw/2026-09-24-sketch-swatch-ref-retirement.md)

保持不变：

- payload 协议形状：根 `meta` + `assets`；记录 `{ uuid?, name, kind, <载荷> }`；layer 载荷键表、name 生成规则与唯一性规则均不变。
- outline ring 仍是 ring 层 + gap 层两层 `shadows`（ring 在前、gap 在后），gap 层维持固定 `#ffffffff`；outline 载荷的 `offset` / `spread` 计算不重构。
- CSS 侧颜色引用与本变更无关：`_colorReference` 的 `var(--<token>)` 引用保留，`_typographyColor` 语义原样。
- 记录集合与其它平台产物不变：CSS 与 md-yml 与基线完全一致，JSON / JSONC / md-yml 输出不变。
- 跨仓边界不新增要求：Sync Token 侧原本就必须能消费无 `$ref` 的 HEX8 快照（降级路径已存在），插件认养 / duplicate 规则（`uuid` / `name` 匹配语义）不改。

## 关联输出

被取代的旧合同见 [Sketch Color Reference Contract](sketch-color-reference-contract.md)：该页描述 v1 `@/<full-output-path>` 合同与可信 alias 失败语义，全页未跟进 v2，已标记 superseded。Typography 侧的 color 字段与 rem / lineHeight / font-family 平台差异见 [Sketch Typography Output Contract](sketch-typography-output-contract.md)。`sketch.path`、`property`、`skip` 的通用继承边界见 [Sketch Extensions Contract](sketch-extensions-contract.md)。
