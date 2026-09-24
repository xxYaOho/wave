---
class: material
ingested: true
integrated: true
metadata: ~
---

# Sketch Swatch `$ref` 撤回（实施计划决策层）

来源计划：`docs/island/plans/2026-09-24-sketch-swatch-ref-retirement.md`（本文件只收录决策层，不含施工清单）。

## Problem Statement

Wave 输出给 Sketch Sync Token 的 payload v2，会在 layer 记录的颜色位置写入 `{ "$ref": "<uuid>" }`，把颜色绑定到同清单 color 记录生成的 Swatch。当前实现里，同一份 payload 因此存在两种颜色表达：outline ring 的 ring 层是 uuid 引用，gap 层与全部 shadow / gradient 位置是 HEX8 快照。

这份间接性对消费 payload 的设计师与插件没有换回可用的收益：

- 绑定只覆盖 outline ring 一个位置（typography 的 `textColor` 已随 payload v2 退役），阴影、渐变等真正高频的颜色位置从来都是 HEX8；读 payload 时必须回到资产清单按 uuid 二次查找，才知道颜色到底是什么。
- 它把输出格式的选择反向耦合进 token 组织方式：颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过或被 root selection 排除，会让一个 outline border 的构建直接失败。

试用期判定已经落地：不保留这层映射。此外，SPEC 中「layer 记录的颜色位置（`shadows[].color`、`gradient.color`）写 `$ref`」的措辞，与实际实现（仅 outline ring）也不一致，一并消解。

## Solution

Sketch payload 的颜色位置一律写具体值 HEX8（`#RRGGBBAA`，alpha / opacity override 折入 alpha 通道）。`$ref` 绑定能力、其元数据链路与配套校验整体移除。

outline ring 仍是 ring 层 + gap 层两层 `shadows`，gap 层维持固定 `#ffffffff`；layer 载荷形状、`meta` / `assets` 结构、name 生成规则均不变。

## User Stories

1. 作为消费 Sketch payload 的设计师，我希望 layer 记录里的每个颜色位置都是可直接读取的 HEX8 值，以便不必回到资产清单按 uuid 二次查找。
2. 作为维护 token 库的设计师，我希望颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过，都不影响 outline border 的构建成功，以便 Sketch 平台的表达约束不反向决定我的 token 组织方式。
3. 作为依据文档判断行为的开发者或 agent，我希望 SPEC、manual 与 simple-wiki 对 Sketch 颜色位置的描述与实现一致，以便不再为「哪些位置会写 `$ref`」做二次考证。

## Constraints

- Sketch payload v2 的协议形状不变：根 `meta` + `assets`；记录 `{ uuid?, name, kind, <载荷> }`；layer 载荷键表不变。
- 颜色位置的真值仍是 HEX8 `#RRGGBBAA`；带 alpha / opacity override 的颜色折入 alpha 通道。
- outline ring 的两层 `shadows` 结构（ring 在前、gap 在后）与 gap 层固定 `#ffffffff` 不变。
- CSS 侧的 `_colorReference`（`var(--<token>)` 引用保留）与 `_typographyColor` 与本变更无关，语义必须保持原样。
- `sketch.skip`、`includeRootKeys`、`filterLayer`、name 唯一性与「name 精确重复即 build 报错」等既有 payload 规则不变。
- 跨仓边界：Sync Token 侧原本就必须能消费无 `$ref` 的 HEX8 快照（降级路径已存在），本次不新增插件侧协议要求。

## Implementation Decisions

- 撤回 Sketch swatch `$ref` 绑定：颜色位置不再写 `{ "$ref": "<uuid>" }`，一律写 HEX8 快照。
- 删除 Sketch 专用颜色引用元数据的采集与传递：resolver 两趟（internal / external）、transformer、类型定义都不再承载 `_sketchColorReference`。
- 删除 formatter 侧的颜色别名索引（curly 与 RFC 6901 pointer → emitted color token）、outline ring 的引用解析，以及「内部引用目标未入账即 build 报错」的校验；该报错随绑定能力一起消失。
- 删除试用期开关 `SKETCH_SWATCH_REF_MODE` 与 `SketchSwatchRefMode` 类型；`assembleSketchPayload` 的选项不再接受 `swatchRefMode`。
- `SketchColorSlot` 由 `string | { $ref: string }` 收敛为 `string`（HEX8）；`shadows[].color`、`gradient[].color`、`fills[].color` 槽位类型随之收窄。破坏面在输出合同（layer 颜色位置不再有 `$ref`）而非类型 API：仓内无第二个类型消费者，`package.json` 也没有发布面。以 changeset 记录该输出合同变更。
- 变更按「消费者侧（formatter/类型）→ 生产者侧（resolver/transformer）→ 文档与知识库」三段推进，每段独立可验证；先删发射再删采集，使被删元数据在中间态是无消费者的死代码，删除边界清晰。
- simple-wiki 的 `sketch-color-reference-contract.md` 描述的合同（v1 `@/<full-output-path>`）在 Wave 侧整体作废：按 SCHEMA 的 superseded 语义保留旧论断并标注取代来源，不删除、不静默覆盖。

## Testing Decisions

- 测试判据只针对外部行为：Sketch payload 的最终 JSON 形状（颜色位置的值、`$ref` 不出现）、构建成功与否、是否抛错。不新增对内部元数据的断言。
- 新回归：`sketch.skip` 的目标颜色 + outline border 组合，改动前 build 报错、改动后构建成功并输出 HEX8。
- 真实消费者 canary：改动前基线中 `$ref` 恰 1 处（outline ring 的 ring 层，目标 uuid 即 `v2/color/outline-ring` = `#155dfcff`）；改动后为 0，且除该处外产物 `diff` 为空、CSS 与 md-yml 与基线完全一致。

## Out of Scope

- 不恢复 v1 的 `@/<路径>` 字符串合同，也不引入第三种颜色绑定形式。
- 不改变 Sync Token 插件的认养 / duplicate 规则（`uuid` / `name` 匹配语义）。
- 不重构 outline 载荷生成（`offset` / `spread` 计算、gap 层）本身。
- 不改变 JSON / JSONC / CSS / md-yml 任何输出。

## Further Notes

- 撤回后 outline ring 的颜色不再随 Swatch 联动：Sketch 侧改色需要重新导入 payload。这是本决策的已知代价，换取 payload 的直接可读与 token 组织方式的解耦。
- 与 SPEC 的既有偏差一并修正：不仅有「layer 颜色位置写 `$ref`」条目，还有 sketch 小节之外的独立段落「CSS 不使用 Sketch 的 swatch `$ref` 绑定……Sketch 颜色绑定改在 payload 内部以 `$ref` 表达」，以及 inheritColor 条目中「目标被 `sketch.skip` 跳过时 build 必须报错」的错误描述（实现自始为静默回退合成色 `#ff00ff`，唯一抛错点在 outline ring 引用路径）。
