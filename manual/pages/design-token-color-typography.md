---
title: 颜色与字体
description: DTCG 颜色对象、alpha、typography token 与虚线 border 的写法参考。
category: Design Token
commands:
  - wave dt --help
appliesTo:
  - 本地 CLI
---

## 颜色和 alpha

推荐用 DTCG 颜色对象描述颜色：

```yaml
primary:
  main:
    $value:
      colorSpace: oklch
      components: [0.518, 0.251, 262.6]
      hex: "#0052f5"
```

`hex` 是兼容输出用的 6 位 fallback。透明度请写在 `alpha`，不要写进 `hex`。

同一个构建可以同时输出 CSS 和 Sketch。CSS 会按 `colorSpace` 输出；Sketch 会输出 `#RRGGBBAA`。

旧语法继续可用。颜色和透明度可以分开写，`color` 和 `alpha` 都可以使用引用：

```yaml
inverse:
  surface:
    $description: 反色背景，常用于 Snackbar 或 Toast
    $value:
      color: "{tailwindcss.color.slate.900}"
      alpha: "{wave.dimension.alpha.800}"
```

构建时，Wave 会先解析引用，再按 `colorSpace` 输出最终颜色。

## Typography

`typography` group 可以用 `$extensions.typography.defaults` 为后代 token 提供公共字段。`defaults` 只能写在有效 `$type` 为 `typography` 的 group 上，只接受 `fontFamily`、`fontSize`、`fontWeight`、`lineHeight` 和 `letterSpacing`。子 group 按字段覆盖祖先 defaults，token 自己的 `$value` 最后覆盖 defaults；合并后每个 typography token 必须包含这五个字段。可选 `color` 保留在 token `$value` 和 JSON/JSONC 输出中；CSS 额外输出 `--<token>-color`，直接引用已输出的 `theme.color.*` 时仍保留为 `var(--<color-token>)`。

typography 的 `rem` 默认以 `16px` 为基准。需要覆盖时，只能在 `theme.font.$extensions.typography.baseFontSize` 声明根字号；它是大于 0 的无单位 CSS px 数值，不属于 `defaults`，也不会输出到 JSON 或 JSONC。使用 rem 时，CSS 在 `:root` 写入有效的 `font-size`，并保留 token 的 rem 值；Sketch 用 `rem × 有效基准` 换算 `fontSize`、绝对 `lineHeight` 和 `letterSpacing`。fontSize 与 letterSpacing 保留最多三位小数；最终 lineHeight 始终向上取整为整数。

```yaml
theme:
  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: 14
        defaults:
          fontFamily: "{wave.dimension.fontFamily}"
          fontSize:
            value: 0.875
            unit: rem
          fontWeight: 400
          letterSpacing: 0
    body:
      $value:
        lineHeight: 1.5
    label:
      $value:
        lineHeight:
          value: 20
          unit: px
```

`fontFamily` 可以是一个字符串，也可以是非空字符串数组。CSS 把数组输出为合法 font stack：简单 CSS identifier 不加引号；其他名称会去掉一层已有配对引号，再用双引号包裹并转义。`inherit`、`initial`、`unset`、`revert` 和 `revert-layer` 始终加引号。若已有输出的 `fontFamily` token 与 typography 的 font stack 等值，CSS shorthand 直接引用该全局变量，不再为每个 typography token 重复输出完整 family；没有等值 token 时仍输出局部 `--<token>-family`。Sketch 不解析系统别名；数组含 `PingFang SC` 时优先使用它，否则选择第一个具体字体。`system`、`system-ui`、`-apple-system`、`BlinkMacSystemFont` 和 CSS generic family 不属于具体字体；数组只有这些值时，Sketch 不输出 `fontFamily`。字符串值保持原有行为。

`lineHeight` 必须大于 0。无单位 number 或纯数字字符串表示倍率；`{ value }` 不表示倍率，必须带单位。CSS 保留倍率和绝对单位；Sketch 的最终 lineHeight 无论倍率、`px`、`pt` 还是 `rem` 都向上取整为整数。`fontSize`、绝对 `lineHeight` 和 `letterSpacing` 使用 rem 时默认使用 16，也可由 `theme.font.$extensions.typography.baseFontSize` 覆盖。Wave 不换算 px 和 pt。

### Sketch 颜色引用

Sketch color slot 的默认真值是 `#RRGGBBAA`。只有同一份主题中直接引用当前 `theme.color.*` token，且目标会输出到同一份 Sketch JSON 时，Wave 才会在 typography 的 `textStyle.textColor`、普通 border 的 `value.color` 或 outline ring 的第一层 `shadow[0].color` 输出 `@/<full-output-path>`。

`@` 后的内容是 RFC 6901 JSON Pointer，直接指向 `{ "color": ... }` 所在的 emitted color token node。完整路径同时包含 `sketch.path` 和经 `filterLayer` 处理的叶子 key；`~` 编码为 `~0`，`/` 编码为 `~1`。旧短引用合同不再兼容。

color token 本身、shadow、gradient、`inheritColor`、外部引用、字面量和带 alpha override 的颜色始终输出 HEX8；outline 的 gap 层固定为 `#ffffffff`。直接引用的目标被 `sketch.skip` 跳过或被 root 选择排除时，Sketch 构建会报错，不会自动降级为 HEX8。Sync Token 对 `@` 的导入属于独立后续工作，不影响 Wave 的构建结果。

## 虚线 border

border 的 `style` 可以使用 DTCG `dashArray`：

```yaml
antline:
  $type: border
  $value:
    color: "{theme.color.primary}"
    width: 1
    style:
      dashArray:
        - value: 4
          unit: px
        - value: 8
          unit: px
```

`dashArray` 必须是非空数组，成员必须是非负 dimension，且至少一个成员大于 0。无单位值按 `px` 输出；显式单位可以是 `px`、`pt`、`rem`、`em` 或 `%`。CSS 会为这个 token 输出可用的 `dashed` shorthand，并额外输出 `{token-name}-dash-array` companion variable 保存真实 dash pattern。例如 `--border-antline: 1px dashed #1872f0` 同时生成 `--border-antline-dash-array: 4px 8px`。companion 名称与真实 token key 冲突时构建失败。Sketch 保留完整的 `style.dashArray` 结构。

