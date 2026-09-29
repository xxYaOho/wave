---
title: Wave Token Helper 文档约定
type: decision
created: 2026-08-31
updated: 2026-09-29
sources: [raw/wave-token-helper-private.md, raw/wave-dt-profile-model.md, raw/handoff.md, raw/2026-09-29-profile-override-contract.md]
topic: Wave DT workspace model
tags: [$helper, authoring, taxonomy, provisional]
context: 2
status: current
---

# Wave Token Helper 文档约定

## 当前状态

`$helper` 目前只能作为 documentation-only、provisional authoring convention：它用于说明 source-like、需要参与 authoring 思考但不应成为公共 `theme` API 的值。Wave 当前没有 `$helper` reference namespace，parser、resolver 和 exporter 也没有执行 helper 语义；top-level `$helper` 会被 schema/token transform 跳过。因此不能把它当作已实现的 private token 或可引用功能。[Wave Token Helper Notes](../raw/wave-token-helper-private.md)

handoff 的 0.16.0 current decision summary 也明确 `$helper` remains documentation-only；这和 profile taxonomy 中“calibration values 不属于 public `theme.color` API”的方向一致。[Wave DT Research Handoff](../raw/handoff.md) [Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md)

当前 profile 根只消费 `$schema`、自身 `$id`、`$config`、`$override`；未知 `$` 前缀根键，包括 `$helper` 与文档级 `$extensions`，被跳过。`$helper` 没有引用 namespace、合并执行或导出语义，也不进入 token 身份索引，不能充当 `$override` 目标。根文档 `$id` 同样不是 token ID，不能把保留根元数据包装成可执行 token。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

需要可引用、可按系列覆写的 rem 基准，应定义真正的已入账 number token，使平铺 `theme.font.$extensions.typography.baseFontSize` 引用它，再由 profile 按 token ID 覆写数值；不能用 helper 躲过 token 合同，也不能重声明已有 group 扩展。详见 [Wave DT Profile Model](wave-dt-profile-model.md) 和 [Sketch Typography Output Contract](sketch-typography-output-contract.md)。[Profile 差量与平铺 Typography 合同](../raw/2026-09-29-profile-override-contract.md)

## 暂行 authoring 形状

若需要记录色彩校准点，可以使用 DTCG-compatible token shape：

```yaml
$helper:
  color:
    black:
      point:
        $type: color
        $description: Color-space black point used for calibration.
        $value: "#000000"
```

该形状只表达文档意图，不代表 Wave 会解析、解析引用或导出它。[Wave Token Helper Notes](../raw/wave-token-helper-private.md)

## 可以与不可以放入 helper 的值

适合的候选是 black/white/current color-space calibration point，以及用于记录 exporter 实验的临时 debug value。`theme.color.transparent`、`theme.color.shadow` 和 shadow、gradient、radius、interaction 等 consumer-facing token 不应移入 helper；有产品意义的 token 应继续留在公共 taxonomy。[Wave Token Helper Notes](../raw/wave-token-helper-private.md)

这条约定服务于 [Wave DT Profile Model](wave-dt-profile-model.md) 的 public-layer 分离，不能用 `$helper` 掩盖 `theme.dimension` 混合 interaction、radius、shadow、gradient 的 taxonomy 问题。[Wave DT Profile Model Notes](../raw/wave-dt-profile-model.md) [Wave Token Helper Notes](../raw/wave-token-helper-private.md)

## 未来变成执行语义的前置条件

在实现 executable helper 前，必须先定义 parser/resolver contract、profile/night merge 规则、默认不输出到 CSS/Sketch/JSON/JSONC 的规则，以及 public token 引用 helper 的明确边界。只有当多个真实 token 文件重复需要内部引用但不导出、profile/night 反复覆盖 authoring shortcut、或 custom resource 造成明显 authoring friction 时，才重新评估。[Wave Token Helper Notes](../raw/wave-token-helper-private.md)

在此之前，不引入 `$extensions.wave.private`，也不新增 path-specific exporter filter；问题是 taxonomy clarity，不是缺少 export-hide flag。[Wave Token Helper Notes](../raw/wave-token-helper-private.md)
