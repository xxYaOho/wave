---
class: material
ingested: true
metadata: ~
---

# md-yml 引用输出合同

## 定位

`md-yml` 是供设计文档使用的 Markdown frontmatter YAML fragment，不是通用 YAML 输出，也不是 DTCG authoring 文件的无损转换。输出文件名为 `{theme}2md.yml`，不包含 frontmatter delimiter、注释、token wrapper 或 `$type`、`$value`、`$description` metadata。

输出按使用路径组织。应用 `filterLayer` 后，第一段成为 namespace，其余 source path 以连字符连接为 local key。例如 `theme.color.primary.main` 在 `filterLayer: 1` 下投影为 `color.primary-main`，文档内通过 `{color.primary-main}` 使用。

## 引用边界

同一 theme 内的 direct reference 可以保留，但必须同时满足：

1. target 是当前 md-yml payload 中实际输出的 direct token；
2. consumer slot 经过 resolver 和 transformer 后仍与 target 的 formatter-ready value 语义等价；
3. 引用路径能够投影为当前 payload 的 `{namespace.local-key}`。

该规则适用于完整 token、composite 子字段、数组成员和 typography defaults 继承的引用。typography token 仍输出完整 materialized 字段集合；如果 `fontFamily` 来自 defaults 中的 `{theme.font.font-family}`，输出字段保留为 `{font.font-family}`，不会删除该继承字段。

外部 resource reference 必须输出最终值，因为 resource 不属于文档可使用的 theme token namespace。`$ref + override`、alpha override、`smoothShadow`、`smoothGradient`、`inheritColor`、实际发生替换的 legacy `currentColor`，以及其他会改变 consumer slot 语义的 computed reference 同样输出最终值，不能伪装成 direct reference。

## 实现约束

resolver 记录 structured reference provenance，并以 computed subtree barrier 阻止多轮解析产生伪 lineage。transformer 通过模块私有 `WeakMap` 携带 lineage；它不进入公共 `WaveToken` property，因此 JSON、JSONC、CSS 和 Sketch 的输出 shape 不变。

md-yml formatter 先建立完整 base graph 和 direct-token target index，再叠加符合条件的引用。序列化前使用 prototype-safe mapping 和 data-property 写入，避免 `__proto__` 等 key 改变对象原型。composite child 可以消费引用，但不作为其他引用的 target。

## 已否决路线

- 复刻 flat JSON：不利于文档中使用 namespace 引用，也失去 YAML 层级的可读性。
- 直接接入 DESIGN.md frontmatter：扩大了 Wave 的文件写入职责；当前只生成 fragment，由用户复制。
- 提供通用 `yaml` platform：会混淆 `wave show --format yaml` 的原始资源展示语义与面向 Markdown 的投影语义。
- 物化所有引用：会让同一 theme 内 token 失去可复用关系，typography defaults 也无法随 font token 更新。
- 保留所有 authored alias：会泄漏 payload 中不存在的 palette、dimension 或 custom resource 路径，并错误保留 computed value 的 source 表象。

## 验证证据

实现提交为 `f8d8940`、`f01a858`、`12745b9`、`9d182e5`，文档提交为 `e26c1cb`。独立 implementation gate 返回 PASS，无 blocking、non-blocking 或 escalate 项。

仓库验证：

- `bun test`：865 pass，0 fail；
- `pnpm check:ci`：typecheck、完整测试、manual/CLI build、Biome 全部通过；
- Pruner 与 Scout 未发现产品代码清理项。

真实 `/Users/teatao/Projects/my-color/orca/main.yaml` 使用 `--platform md-yml` 的 base pass，只生成 `orca2md.yml`。最终产物为 7186 bytes，包含 28 个内部引用且 target 全部存在；`font.heading-h1.fontFamily` 为 `{font.font-family}`，`color` 为 `{color.text-emphasis}`，`fontSize` 为 `2.5rem`，`font.font-family` 为 16 项最终数组。Orca `main.yaml` 与 `custom/corerain.yaml` 的 SHA-256 在构建前后保持一致。

当前规范见 `docs/SPEC.md` 的“平台投影与失败语义”和“输出格式”，用户操作说明见 `manual/pages/design-token-extensions-output.md` 的“md-yml”。
