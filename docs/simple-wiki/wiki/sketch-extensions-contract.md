---
title: Sketch Extensions Contract
type: decision
created: 2026-08-31
updated: 2026-08-31
sources: [raw/2026-06-18-sketch-extensions-prd.md, raw/2026-06-18-sketch-extensions.md, raw/2026-06-22-group-sketch-path-inheritance.md, raw/2026-06-23-sketch-sync-token-output.md, raw/2026-07-13-typography-stroke-skip-design.md, raw/2026-07-13-typography-stroke-skip.md, raw/wave-dt-profile-model.md, raw/2026-06-18-wave-manual-design.md]
topic: Sketch output
tags: [Sketch, extensions, swatch, formatter]
context: 2
status: current
---

# Sketch Extensions Contract

## 设计意图

这份 PRD 提议以 `$extensions.sketch` 统一 Sketch 命名路径和平台属性，并在 raw extensions 与 Sketch formatter 之间增加稳定的归一化层。它是 2026-06-18 的 proposed MVP contract，不单独证明当前 bundle、Sketch document 或 formatter 已实现这些行为。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

## Path 语义

`$extensions.sketch.path` 必须是非空 string，采用 `group/subgroup/name` 的 Sketch slash grouping 语法；它直接替换当前输出 group 内的 JSON object key，不添加额外 `name` 字段。`filterLayer` 继续控制 JSON/CSS 等通用 key，Sketch formatter 不把它引入显式 `sketch.path`。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

MVP 只允许 path 重命名 `color`、`style.interaction`、`style.shadow`、`style.gradient` 和 dimension group；component key 不因 `sketch.path` 改名，继续保持既有 composite 兼容行为。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

group 也可以声明 `sketch.path`：后代 token 继承最近的 group path，token 自己的 path 优先于 group path；`sketch.property` 不从 group 继承，group-level property 应被 schema 拒绝。这个 group inheritance 只扩展 path，不扩展其他 `$extensions` 字段。[Group Sketch Path Inheritance Implementation Plan](../raw/2026-06-22-group-sketch-path-inheritance.md)

## Property 语义

第一版 property 白名单只有 `opacity: true` 与 `cornerRadius: true`。两者都只适用于 resolved value 为 numeric 的 `number`/`dimension` token；`false`、未知 key、错误 value shape 和 color token 上的 property 都必须失败，不能把任意对象盲目 spread 到 Sketch JSON。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

`sketch.property.opacity` 的语义是 `{ opacity: value }`；6/18 PRD 的旧 `cornerRadius` 示例使用 `{ cornerRadius: value }`，但后续 plugin-facing leaf contract 将 radius 形状规范为 `{ corners: { radii: value } }`。显式 `$extensions.sketch.property` 优先于 legacy `sketchMap`，后者只作为兼容 fallback。原 PRD 以 `theme.dimension.*` 作为 number property 的 MVP 输出位置，但后来的 profile taxonomy 将 `theme.dimension` 定为迁移中的非公共输出根，因此应把这里理解为“当前 Sketch formatter 发射的 dimension group”，不能据此恢复旧 public root。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md) [Sketch Sync Token Output Implementation Plan](../raw/2026-06-23-sketch-sync-token-output.md) [Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

## Inheritance 与 swatch

6/18 的旧实现计划曾要求 `$extends` 只对 `$extensions.sketch` 做 nested object merge：child path 覆盖 parent path，child property 只覆盖同名 key 并保留其他 parent property；非-Sketch extension 继续使用原有同名覆盖语义。[Sketch Extensions Implementation Plan](../raw/2026-06-18-sketch-extensions.md)

该 deep-merge 预期已被后续 typography/stroke contract supersede。当前 `$extends` 对 `$extensions.sketch` 使用 whole-namespace override：derived group 只要声明任一 `sketch` 字段，就整体替换 base 的 `path`、`property`、`skip`；普通 group 展开后的 descendant inheritance 仍按 path/skip 规则处理。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Typography、虚线边框与 Sketch 跳过输出实施计划](../raw/2026-07-13-typography-stroke-skip.md)

`sketch.skip` 是 boolean，可在 group 或 token 上声明；最近 group/token 的显式值覆盖继承值，只有 Sketch emission list 过滤它，CSS、JSON、JSONC 仍保留 token。被 skip 的 token 仍可留在完整 token 集合中供 sibling/dependency 查询。[Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md)

若被引用 color token 有 effective `_sketch.path`，所有派生 `_swatchName` 都使用该 path；若没有，则保留既有 path-derived behavior。同步范围包括 token、component fill/border、inheritColor sibling propagation 和 nested component shadow color，不新增用户侧 `swatch` 字段。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

Sketch Sync Token 的 leaf boundary 只约束插件消费形状，不改变 `sketch.path` 的分组机制：color 使用 `{ color: "#RRGGBBAA" }`，shadow 使用 `{ shadow: [...] }`，gradient 使用 `{ gradient: [...] }`，opacity 使用 `{ opacity: number }`，radius 使用 `{ corners: { radii: number } }`。这是独立的 plugin-facing output contract，不能推断下游插件已覆盖所有 Wave 类型。[Sketch Sync Token Output Implementation Plan](../raw/2026-06-23-sketch-sync-token-output.md)

## 模块与文档边界

YAML parser 只负责解析 raw object；schema、resolver、transformer 通过 `_sketch` 内部 metadata 协作，Sketch formatter 负责最终 JSON serialization，但不再解析 raw `$extensions`。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

完整 design-token 用户说明应归 `docs/design-token.md`，`MANUAL.md` 只保留 concise Design Token 入口，`docs/SPEC.md` 继续作为内部 behavior snapshot。Wave Manual 的内容源、导航和用户/内部文档分界见 [Wave Manual 应用设计基线](wave-manual-application-baseline.md) [Wave Manual 文档应用设计](../raw/2026-06-18-wave-manual-design.md)。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

## 非目标与阶段

该 PRD 不改变 JSON/JSONC/CSS 通用 key 语义、不重做 component token、不实现自动 swatch binding，也不允许任意 Sketch JSON patch。后续 component 设计、`inheritFrom`、swatch strategy 和更丰富的 Sketch intermediate model 应单独决策。[Sketch Extensions PRD](../raw/2026-06-18-sketch-extensions-prd.md)

## 演进边界

本页保留 6/18 的原始 MVP 设计作为历史来源；其中 `$extends` 的 deep-merge 期待已被 7/13 的 typography/stroke 资料取代，不能再作为当前行为引用。group path inheritance 和 plugin leaf shape 是随后补充的输出约束。[Sketch Extensions Implementation Plan](../raw/2026-06-18-sketch-extensions.md) [Typography、虚线边框与 Sketch 跳过输出设计](../raw/2026-07-13-typography-stroke-skip-design.md) [Group Sketch Path Inheritance Implementation Plan](../raw/2026-06-22-group-sketch-path-inheritance.md) [Sketch Sync Token Output Implementation Plan](../raw/2026-06-23-sketch-sync-token-output.md)
