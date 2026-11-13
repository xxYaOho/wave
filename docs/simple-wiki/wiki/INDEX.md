# INDEX

> [!IMPORTANT]
> Headline 2 为主题聚类, 无主题内容默认放在 Headline 1 中. 同主题条目达到 3 条时, 为它们创建独立主题.
> 每页一行, 先查阅编译后的知识, 按需查阅源材料:
> `- [title](file.md) | <context>k | <一句话描述> | tag, tag`

## DTCG 类型与转换

- [DTCG 标准类型优化复盘](dtcg-standard-types-retrospective.md) | 3k | 标准类型、typed reference、跨平台 transformer 与 consumer smoke 的端到端复盘 | DTCG, schema, verification
- [DTCG Color Legacy Compatibility](dtcg-color-legacy-compatibility.md) | 2k | DTCG 颜色对象、fallback 与历史输入形状的 transformer 兼容边界 | DTCG, color, compatibility

## Wave DT workspace model

- [Wave Auto Generate Color 讨论小结](wave-auto-generate-color-discussion.md) | 1k | Day/Night 表面层级差异、`$config.autoGenerateColor` 草案与待讨论参数 | color, auto-generate, day, night
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

## 验收范式与飞轮治理

- [基线即合同](baseline-as-contract.md) | 2k | 行为保持类验收范式：改动前捕获四项基线 + 重放自校验 + 委托证明门，分支语义住代码与基线 | 验收范式, baseline, equivalence, gate
- [飞轮轮次封顶与兜底收场](flywheel-round-cap-backstop.md) | 2k | 修正轮 ≤4 + 显式早停判据 + 兜底收场——纸面完备性长尾的治理 | 飞轮, 轮次封顶, 早停, 兜底
- [预注册测量裁决](pre-registered-measurement-adjudication.md) | 2k | 测量规则先于测量锁定；配对 RI/PR + validity 先行 + 安全地板——缓存收益裁决实证 | 预注册, 测量, 裁决, 性能
- [Biome 生成物证据边界](biome-generated-evidence-boundary.md) | 1k | 机器生成证据目录按配置边界排除出格式门（三实例）+ 目录哈希算法定义 | biome, 生成物, 配置边界, 证据

## 施工工具链事实

- [js-yaml dump 默认值陷阱](js-yaml-dump-defaults.md) | 1k | sortKeys 默认 false、未知选项静默忽略——跨包迁移逐选项核对 | js-yaml, yaml, dump, 陷阱
- [gate 脚本只用 POSIX 工具](posix-tools-gate-scripts.md) | 1k | rg 等非 POSIX 依赖让 gate 观测值全零误报——SPEC 即 oracle | gate, posix, grep, oracle
- [benchmarks 六域契约与重放基线](quality-harness-six-domains.md) | 2k | 六域结构、run.ts 旗标面与重放基线 manifest 合同（字面 argv/有序依赖/SETUP/快照哈希） | benchmark, quality-harness, 重放, manifest

## 流程教训

- [rebase 后重核 SPEC 引用](rebase-citation-rescan.md) | 1k | rebase 换入新版图后 file:line/哈希/事实断言全部失效需逐条重核 | rebase, SPEC, 引用, 纪律
- [审查立场条款](reviewer-stance-clause.md) | 1k | 工单显式声明 Human 授权范式，防 fresh reviewer 以缺冻结判 FAIL——实质结构洞仍照报 | 审查, 工单, 立场条款, critic
- [事务式编辑纪律](transactional-edit-discipline.md) | 1k | 多锚点批量编辑先验证全部锚点再单次写盘 + 逐项 grep 验证；长内容走文件不走 heredoc | 编辑, 断言, 事务, 纪律
