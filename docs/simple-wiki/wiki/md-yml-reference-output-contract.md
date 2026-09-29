---
title: md-yml Reference Output Contract
type: decision
created: 2026-08-31
updated: 2026-09-29
sources: [raw/2026-08-31-md-yml-reference-output-contract.md, raw/2026-09-29-profile-override-contract.md]
topic: md-yml output
tags: [md-yml, reference, formatter, output-contract]
context: 2
status: current
---

# md-yml Reference Output Contract

## 定位与投影

`md-yml` 是面向设计文档的 Markdown frontmatter YAML fragment，不是通用 YAML 输出，也不是 DTCG authoring 文件的无损转换。文件名为 `{theme}2md.yml`，输出不包含 frontmatter delimiter、注释、token wrapper 或 `$type`、`$value`、`$description` metadata。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

输出按使用路径组织。应用 `filterLayer` 后，第一段成为 namespace，其余 source path 以连字符连接为 local key；例如 `theme.color.primary.main` 在 `filterLayer: 1` 下投影为 `color.primary-main`，文档内通过 `{color.primary-main}` 使用。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

## 引用规则

同一 theme 内的 direct reference 只有在 target 确实是当前 payload 输出的 direct token、consumer slot 经 resolver/transformer 后与 target 的 formatter-ready value 语义等价、且路径能投影成当前 payload 的 `{namespace.local-key}` 时才可保留。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

这条边界覆盖完整 token、composite 子字段、数组成员和 typography 平铺 group 兜底字段继承的引用。当前 `$extensions.typography` 的五个 composite 兜底字段与 `baseFontSize` 平铺为六个兄弟字段，旧 `defaults:` 嵌套硬拒绝；`fontSize` 是字段兜底，`baseFontSize` 是 rem 基准。Typography 仍输出完整 materialized 五字段集合；若平铺 `fontFamily` 引用 `{theme.font.font-family}` 且满足上述条件，继承后的字段保留为 `{font.font-family}`。metadata 基准不成为 composite 字段，下沉的 number token 仍正常输出；profile 按该 token ID 覆写基准不改变 reference 保留判据。详见 [Sketch Typography Output Contract](sketch-typography-output-contract.md)。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

历史 md-yml 合同把这类引用称为“typography defaults 继承的引用”，示例来自嵌套 defaults。旧 authoring 形状已被平铺合同取代；target 必须存在于 payload、consumer slot 与 formatter-ready target 语义等价、路径可投影的引用规则仍保留。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md) [Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

外部 resource reference 必须输出最终值，因为 resource 不属于文档可使用的 theme token namespace。`$ref + override`、alpha override、`smoothShadow`、`smoothGradient`、`inheritColor`、实际发生替换的 legacy `currentColor`，以及其他改变 consumer slot 语义的 computed reference，也必须输出最终值。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

## 实现护栏

resolver 记录 structured reference provenance，并以 computed subtree barrier 阻止多轮解析产生伪 lineage；transformer 用模块私有 `WeakMap` 携带 lineage，不把它加入公共 `WaveToken` property，因此 JSON、JSONC、CSS 和 Sketch 的输出 shape 不变。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

formatter 先建立完整 base graph 和 direct-token target index，再叠加符合条件的引用。序列化使用 prototype-safe mapping 与 data-property 写入，避免 `__proto__` 等 key 改变对象原型。composite child 可以消费引用，但不能作为其他引用的 target。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

## 被否决的方向

当前合同否决复刻 flat JSON、直接写入 DESIGN.md frontmatter、提供通用 `yaml` platform、物化所有引用，以及保留所有 authored alias。这些路线分别损害 namespace 可读性、扩大 Wave 文件写入职责、混淆原始资源展示与文档投影、丢失同主题 token 的可复用关系，或泄漏 payload 不存在的路径并错误保留 computed value 的 source 表象。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

## 验证基线

该合同对应实现提交 `f8d8940`、`f01a858`、`12745b9`、`9d182e5`，文档提交为 `e26c1cb`；独立 implementation gate 为 PASS，且 `bun test` 有 865 pass、0 fail，`pnpm check:ci` 全部通过。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)

真实 Orca `main.yaml` 的 `md-yml` base pass 只生成 `orca2md.yml`：产物 7186 bytes，含 28 个内部引用且 target 全部存在；`font.heading-h1.fontFamily` 为 `{font.font-family}`，`color` 为 `{color.text-emphasis}`，`fontSize` 为 `2.5rem`，`font.font-family` 为 16 项最终数组。构建前后 Orca `main.yaml` 与 `custom/corerain.yaml` 的 SHA-256 保持一致。[md-yml 引用输出合同](../raw/2026-08-31-md-yml-reference-output-contract.md)
