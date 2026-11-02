---
title: Wave Auto Generate Color 讨论小结
type: summary
created: 2026-10-09
updated: 2026-10-09
sources: [raw/2026-10-09-auto-generate-color-discussion.md]
topic: Wave DT workspace model
tags: [color, auto-generate, day, night, HCT]
context: 1
status: current
---

# Wave Auto Generate Color 讨论小结

## 已确认方向

Wave 的颜色自动生成是补全能力。设计师仍可以直接提供 day 的 `$value`；只有显式启用自动生成或引用自动色阶时，Wave 才介入计算。night 由 Wave 生成 `@night.yaml`，生成结果允许设计师继续微调。[Auto Generate Color 讨论小结](../raw/2026-10-09-auto-generate-color-discussion.md)

自动生成配置使用独立的 `$config.autoGenerateColor` 配置块。它负责全局算法及明度、对比度、彩度等默认参数；token 的 `$extensions.night` 用于声明颜色用途，例如 `role: surface`。强度是否还需要独立字段、如何表达，尚未定案。两者不混合职责。

## Day 与 Night 的表面层级

当前实验页使用 Vibrant scheme 时，绿色种子的 day surface/container 会明显偏绿，例如 `#effdf5` 到 `#e3f1e9`。这是种子色的色相和彩度进入了中性色板。Day 中阴影、边框可以承担主要层级表达，因此 surface/container 应接近中性，只保留很轻微的主题色倾向；Night 中阴影在深色背景上的作用减弱，需要依靠 surface/container 的明度差和适量主题色倾向表达层级。

Material scheme 的观察结果是：`SchemeNeutral` 最接近中性，`SchemeTonalSpot` 保留少量主题倾向，`SchemeVibrant` 的表面色彩最强。初步建议 Day 使用低彩度 neutral palette，Night 使用带主题倾向的 tonal palette。

## 配置草案

讨论中的形状如下，具体默认值尚未定案：

```yaml
$config:
  autoGenerateColor:
    day:
      contrast: 0
      surface:
        palette: neutral
        chromaScale: 0.15
      container:
        palette: neutral
        chromaScale: 0.2
        tone: { low: 97, default: 95, high: 93 }
    night:
      enabled: true
      contrast: 0
      surface: { palette: tonal, chromaScale: 0.7, tone: 8 }
      container:
        palette: tonal
        chromaScale: 0.8
        tone: { low: 12, default: 16, high: 22 }
      primary: { tone: 63 }
```

`contrast` 采用 Material contrastLevel 语义；`tone` 控制 HCT 明度；`chromaScale` 控制种子色对中性色的影响程度。alpha 不参与生成计算，避免透明度干扰色彩解析。

## 待讨论事项

- Day 默认 `chromaScale` 使用 `0`，还是保留约 `0.15` 的主题倾向。
- Night 的 surface/container tone 差值由固定档位提供，还是由 `role` 和 `seed` 推导。
- `autoGenerateColor` 是否同时承载 day 的 50–950 色阶生成，或只负责 day/night 角色色。
- 生成的 night token 与手写 `@night.yaml` 冲突时，明确显式覆写优先的合并顺序。
