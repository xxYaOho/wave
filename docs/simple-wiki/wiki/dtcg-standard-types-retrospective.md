---
title: DTCG 标准类型优化复盘
type: summary
created: 2026-08-31
updated: 2026-08-31
sources: [raw/2026-07-29-dtcg-standard-types-retrospective.md, raw/2026-07-29-dtcg-standard-types-design.md, raw/2026-07-29-dtcg-standard-types.md, raw/2026-07-09-wave-dt-manual-test-fixes.md, raw/handoff.md, raw/wave-dt-profile-model.md]
topic: DTCG 类型与转换
tags: [DTCG, schema, typed-reference, transformer, verification]
context: 3
status: current
---

# DTCG 标准类型优化复盘

## 核心结论

将 `stockStyle` 改成 `border` 是局部 consumer 修复；完整 DTCG 2025.10 标准类型支持则是端到端类型合同，不能按类型名称清单估算。合同至少跨越 `schema -> typed reference -> resolver -> transformer -> JSON/JSONC/CSS/Sketch -> integration / Quality Harness -> real consumer smoke`。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)

这条分层边界与 Wave DT profile 页面中的资源、公共 `theme` API 和平台投影边界相互关联，但不能把资源解析或 formatter 逻辑塞回 parser/resource 层。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md) [Wave DT Profile Model](wave-dt-profile-model.md)

## 标准类型设计合同

7/29 的设计文档把以下 13 个 `$type` 纳入标准支持目标：`color`、`dimension`、`fontFamily`、`fontWeight`、`duration`、`cubicBezier`、`number`、`strokeStyle`、`border`、`transition`、`shadow`、`gradient` 和 `typography`。`opacity` 不属于标准类型；`inheritColor.opacity` 与 `sketch.property.opacity` 仍是 extension field。[DTCG 标准类型端到端支持设计](../raw/2026-07-29-dtcg-standard-types-design.md)

标准 composite 是 closed shape：`border`、`transition`、`shadow`、`gradient` 和 `typography` 的必需字段、可选字段和子值类型必须逐项校验，额外字段不能通过。标准 `$type`、Wave dimension 简写和平台限制是三层不同合同；Wave 扩展可以保留，但不应伪装成 DTCG conformance。[DTCG 标准类型端到端支持设计](../raw/2026-07-29-dtcg-standard-types-design.md)

Dimension 的标准输入只含 `px`/`rem`，Wave 另兼容 finite number、numeric string、`px`/`rem`/`pt`/`em`/`%` length string 和 `{ value, unit }` 扩展。Transformer 保留单位与类型语义，formatter 再决定平台单位与结构；不能提前把所有 `{ value, unit }` 转成 CSS string。[DTCG 标准类型端到端支持设计](../raw/2026-07-29-dtcg-standard-types-design.md)

Reference 在 raw phase 可先通过占位校验，但 resolved phase 必须按 expected type、目标类型、数组解析语义和最终 value shape 重新验证。未知自定义 `$type` 可以 warning 并保留 scalar/可表达值，但 object/array 必须由专用 formatter 消费或明确失败，不能靠通用转换生成 `[object Object]`。[DTCG 标准类型端到端支持设计](../raw/2026-07-29-dtcg-standard-types-design.md)

平台边界也属于合同：JSON/JSONC 保留规范化的结构化值与单位，CSS 为复合值生成专用主变量和 companion variables，Sketch 保留其固定 payload shape；标准合法但目标平台无法表达的值应由对应 formatter 报错。fatal schema/formatter failure 不得创建或覆盖本次生成规划的文件，optional Night skip 也不得删除或覆盖已有 Night 文件。[DTCG 标准类型端到端支持设计](../raw/2026-07-29-dtcg-standard-types-design.md)

## 不可删除的复杂度

- 13 个标准类型分别具有 primitive、dimension-like 或 closed-shape composite 合同；complete-token alias 必须比较 effective type，property-level reference 则按字段的 expected type 验证。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
- DTCG 标准输入、Wave dimension 简写、typography extensions 和平台限制必须分层表达。它们可以兼容，但不能伪装成同一个标准类型合同。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
- `none` color、非偶数 `dashArray`、gradient 端点补全和 shadow inset 需要跨平台一致的 transformer 语义；JSON/JSONC、CSS、Sketch 的 payload 和失败语义不同，不能用通用字符串 fallback。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)

7/29 implementation plan 将这条端到端边界具体化为共享 primitive helper、raw/resolved 两阶段 schema、effective-type typed reference 和 closed-shape composite 校验。完整 token alias 必须比较 source 与 target 的 effective type；property-level reference 按字段 expected type 验证。shadow/gradient 数组中的 `$ref` 只替换一个成员，不能把引用数组 flatten；reference provenance 作为 resolver side table 保留，不泄漏到 token 或 formatter。[DTCG Standard Types Implementation Plan](../raw/2026-07-29-dtcg-standard-types.md)

标准类型输出还要求 formatter 只做平台投影：JSON/JSONC 保留结构化值，CSS/Sketch 消费已归一化值并处理各自限制。未知自定义 scalar 可继续兼容；未知 object/array 必须由专用 formatter 消费或明确失败。CSS 的主变量与 companion variables 一起参加碰撞预检，任何 schema/formatter failure 都必须发生在首次写入前，不能留下部分输出。[DTCG Standard Types Implementation Plan](../raw/2026-07-29-dtcg-standard-types.md)

7/9 manual-test-fixes 的跨类型验证教训是：真实 root matrix 暴露的问题通常发生在 nested composite normalization，而不是单独的 primitive parser；因此 border/shadow/radius/outline 需要 transformer、CSS、Sketch 和 integration 的联合回归。该文件的“Completed and released in 0.16.0”是带未勾选任务的历史计划标签，不能单独作为完成证据；发布结论应回到 handoff、仓库 tests 与真实 consumer smoke。[Wave DT Manual Test Fixes Implementation Plan](../raw/2026-07-09-wave-dt-manual-test-fixes.md) [Wave DT Research Handoff](../raw/handoff.md)

## 复用的执行规则

1. 先建立唯一验收矩阵，逐项列出类型、schema phase、reference 语义、transformer 语义、平台 payload、失败合同和 fixture。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
2. schema 与 typed-reference 完成后，立即运行仓库测试以及真实 consumer 的只读 parse/canary；不要等最终 smoke 才发现 consumer 声明错误。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
3. transformer 完成后验证跨平台共享语义，随后分别添加 formatter focused tests、全类型 hermetic fixture、build 级负向 fixture 和 Quality Harness case。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
4. 编写 smoke 断言前核对真实 consumer 的 `$config.parameterGroup`、profile selection、token extensions 和 `sketch.skip`；实际跳过配置应产生负向断言，不应为了满足计划预期删除它。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
5. 每个实现单元运行其 focused tests、typecheck 和 diff check；主代理在里程碑末尾运行一次 aggregate 和一次完整 repository gate，只有直接验证无法覆盖的合同风险才追加 critic-gate。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)

## 证据与时间边界

复盘记录的 Wave repository gate 为 816 tests、0 fail，DTCG focused aggregate 为 302 tests、0 fail，`stockStyle` build 负向 integration 为 49 tests、0 fail；Orca full-profile smoke 覆盖 7 profiles、14 个产物，并确认无 `[object Object]`。这些是该复盘时点的验证记录，不是永远不变的基线。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)

`Wave DT Research Handoff` 记录了早期 0.16.0 profile iteration 的发布证据，也记录了 2026-07-29 的 design-token legacy cutover：后者将 `main.yaml::$config` 定为唯一 workspace 入口，并把 `themefile`/resource-direct 路径放入历史兼容裁剪边界。因此阅读本页时，必须把 0.16.0 的执行经验当作历史证据，把后续 cutover 当作时间上更新的边界，不能把两者静默合并为同一版本状态。[Wave DT Research Handoff](../raw/handoff.md)

## 使用方式

开始相邻任务前先判断目标属于标准类型合同、Wave 方言、平台投影还是 consumer 数据迁移。若局部债务升级为完整标准支持，先宣布范围变化并重估里程碑；不要通过跳过分层测试来消除必要复杂度。[DTCG 标准类型优化复盘](../raw/2026-07-29-dtcg-standard-types-retrospective.md)
