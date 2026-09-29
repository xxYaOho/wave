# INDEX

> [!IMPORTANT]
> Headline 2 为主题聚类, 无主题内容默认放在 Headline 1 中. 同主题条目达到 3 条时, 为它们创建独立主题.
> 每页一行, 先查阅编译后的知识, 按需查阅源材料:
> `- [title](file.md) | <context>k | <一句话描述> | tag, tag`

## DTCG 类型与转换

- [DTCG 标准类型优化复盘](dtcg-standard-types-retrospective.md) | 3k | 标准类型、typed reference、跨平台 transformer 与 consumer smoke 的端到端复盘 | DTCG, schema, verification
- [DTCG Color Legacy Compatibility](dtcg-color-legacy-compatibility.md) | 2k | DTCG 颜色对象、fallback 与历史输入形状的 transformer 兼容边界 | DTCG, color, compatibility

## Wave DT workspace model

- [Wave DT Profile Model](wave-dt-profile-model.md) | 5k | main-only/profile/night 选择、profile 差量 $override 与双身份、reference-gated resource 与公共 theme taxonomy 的决策边界 | profile, main.yaml, night, taxonomy
- [Wave Token Helper 文档约定](wave-token-helper-documentation-convention.md) | 2k | `$helper` 仅作为暂行文档约定，当前不具备解析、引用或导出语义 | $helper, authoring, provisional

## Wave Workspace

- [Wave Workspace Design](wave-workspace-design.md) | 1k | 本地设计项目目录创建、命名配置、TUI 确认与 receipt 合同 | workspace, TUI, configuration

## Sketch output

- [Sketch Swatch Binding Retirement](sketch-swatch-binding-retirement.md) | 2k | Sketch payload v2 撤回 swatch $ref 绑定与元数据链路、layer 颜色位置统一输出 HEX8 的决策与边界 | Sketch, swatch, color-slot, HEX8, output-contract
- [Sketch Extensions Contract](sketch-extensions-contract.md) | 3k | Sketch path/property、group inheritance、whole-namespace override 与 plugin leaf 边界 | Sketch, extensions, swatch
- [Sketch Color Reference Contract](sketch-color-reference-contract.md) | 2k | 已 superseded：同文档颜色引用的 RFC 6901 完整输出路径、可信 alias 与冲突预检合同（v1，未跟进 v2） | Sketch, color-reference, RFC6901

## Typography

- [Sketch Typography Output Contract](sketch-typography-output-contract.md) | 3k | 平铺 typography 六字段、base-size 引用基准、font-family、lineHeight 与 Sketch-only skip 的演进合同 | typography, rem, lineHeight

## md-yml output

- [md-yml Reference Output Contract](md-yml-reference-output-contract.md) | 2k | Markdown 文档 YAML fragment 的 namespace 投影、direct reference 边界与验证基线 | md-yml, reference, formatter, output-contract

## Wave Manual

- [Wave Manual 应用设计基线](wave-manual-application-baseline.md) | 3k | 本地离线手册的内容真源、构建/运行边界与待审阅蓝图 IA | manual, documentation, offline
