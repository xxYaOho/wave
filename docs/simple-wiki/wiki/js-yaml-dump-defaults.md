---
title: js-yaml dump 默认值陷阱
type: pitfall
created: 2026-11-13
updated: 2026-11-13
sources: [../raw/2026-11-13-p1b-review-ledger.md]
topic: 施工工具链事实
tags: [js-yaml, yaml, dump, 序列化, 陷阱]
context: 1
status: current
---

# js-yaml dump 默认值陷阱

`js-yaml` 的 `dump` 与 `yaml` 包语义不同，两处实测教训：

1. `sortKeys` **默认 false**——曾误以为默认排序并在 SPEC 中写错（事实性错误被审查抓出）。
2. **未知选项静默忽略**：传入不存在的选项名（如把 yaml 包的选项风格搬到 js-yaml）不报错、不生效——序列化行为与预期不符时先查选项是否真的存在于 js-yaml。

## 规则

改序列化行为前查 js-yaml 官方选项表；跨包迁移（yaml ↔ js-yaml）时逐选项核对；对 dump 输出做**字节级断言**的合同（如基线等价）必须显式声明所用选项全集。
