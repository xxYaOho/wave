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

标准 DTCG `typography` 值必须包含 `fontFamily`、`fontSize`、`fontWeight`、`letterSpacing` 和无单位 number `lineHeight`。`fontFamily`、`fontSize`、`fontWeight` 和 `letterSpacing` 分别遵循对应标准类型，也可以引用匹配类型的 token。额外字段会导致构建失败。

Wave 提供平铺的 `$extensions.typography`、可选的 `$value.color`，以及带 `px | pt | rem` 单位的 `lineHeight`。字体扩展只能写在有效 `$type` 为 `typography` 的 group 上，且只接受六个同级字段：`baseFontSize`、`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`，至少声明一个。旧的 `typography.defaults` 嵌套写法会被拒绝，需要把其中字段移到 `typography` 下。

五个标准字段作为子 token 的默认值：子 group 按字段浅覆盖祖先默认值，token 自己的 `$value` 最后覆盖；object 字段整体替换，不进行深合并。合并后每个 typography token 必须包含五个标准字段。可选 `color` 只能写在 token `$value` 中，不是扩展默认字段；JSON/JSONC 保留它，CSS 额外输出 `--<token>-color`，直接引用已输出的 `theme.color.*` 时仍保留为 `var(--<color-token>)`。

`fontSize` 是 typography composite 的字号默认值；`baseFontSize` 只是 rem 换算基准，两者不是同一个设置。rem 默认以 `16px` 为基准。需要覆盖时，只能在 `theme.font.$extensions.typography.baseFontSize` 声明大于 0 的有限 number，或最终解析为该 number 的引用，数值按 CSS px 理解，不能写成 dimension object。基准本身不会加入 typography 的 JSON/JSONC 值。使用 rem 时，CSS 在 `:root` 写入有效的 `font-size`，并保留 token 的 rem 值；Sketch 用 `rem × 有效基准` 换算 `fontSize`、绝对 `lineHeight` 和 `letterSpacing`。fontSize 与 letterSpacing 保留最多三位小数；最终 lineHeight 始终向上取整为整数。

```yaml
theme:
  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: 14
        fontFamily: ["Inter", "sans-serif"]
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

### 按 Profile 调整 rem 基准

已有 group 的扩展不能由 profile 重声明。需要不同 profile 使用不同基准时，在 main 中让 `baseFontSize` 引用已登记的 number token，再在 profile 中按 ID 覆盖该 token 的值。

基础文件 `main.yaml`：

```yaml
$id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$config:
  theme: example
  parameter:
    platform: [json, css, sketch]
theme:
  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: "{theme.font.base-size}"
        fontFamily: ["Inter", "sans-serif"]
        fontSize: { value: 1, unit: rem }
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: 0
    base-size:
      $id: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      $type: number
      $value: 14
    body:
      $value: {}
```

差量文件 `profiles/mobile.yaml`：

```yaml
$config:
  base: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$override:
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:
    $value: 16
```

运行 `wave dt build --profile mobile -f ./main.yaml` 后，body 的字号仍是 `1rem`；CSS 根字号为 `16px`，Sketch 字号为 `16`。main 的基准仍为 `14`。Profile 的身份与完整覆盖规则见 [WCAG 与主题模式](/design-token/quality-theming)。

### 字体与行高输出

`fontFamily` 可以是一个字符串或字符串数组。DTCG schema 保留标准结构；CSS 平台要求值能形成非空 font stack。CSS 把数组输出为合法 font stack：简单 CSS identifier 不加引号；其他名称会去掉一层已有配对引号，再用双引号包裹并转义。`inherit`、`initial`、`unset`、`revert` 和 `revert-layer` 始终加引号。Typography token 在 CSS 中只输出字段变量（`-family`、`-size`、`-weight`、`-line-height`、`-letter-spacing`、可选 `-color`），不输出聚合 shorthand 变量。若已有输出的 `fontFamily` token 与 typography 的 font stack 等值，CSS 省略局部 `--<token>-family` 字段变量，由使用方取用该 family token 自身的变量；没有等值 token 时仍输出局部 `--<token>-family`。Sketch 不解析系统别名；数组含 `PingFang SC` 时优先使用它，否则选择第一个具体字体。`system`、`system-ui`、`-apple-system`、`BlinkMacSystemFont` 和 CSS generic family 不属于具体字体；数组只有这些值时，Sketch 不输出 `fontFamily`。字符串值保持原有行为。

`lineHeight` 必须大于 0。无单位 number 或纯数字字符串表示倍率；`{ value }` 不表示倍率，必须带单位。CSS 保留倍率和绝对单位；Sketch 的最终 lineHeight 无论倍率、`px`、`pt` 还是 `rem` 都向上取整为整数。`fontSize`、绝对 `lineHeight` 和 `letterSpacing` 使用 rem 时默认使用 16，也可由 `theme.font.$extensions.typography.baseFontSize` 覆盖。Wave 不换算 px 和 pt。

### Sketch 颜色输出

Sketch 输出中，每条颜色资产的 `color` 字段都是 `#RRGGBBAA` HEX8 快照；带 alpha 或 opacity override 的颜色会把透明度折入快照的 alpha 通道。layer 资产里的颜色位置（`shadows[].color`、`gradient.color`）同样是 HEX8 快照，不做 Swatch 绑定：颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过，只影响它自己是否作为颜色资产出现在清单里，不影响颜色位置的值。

outline 的 gap 层固定为 `#ffffffff`。旧版的 `@/<路径>` 字符串引用与试用期的 `{ "$ref": "<uuid>" }` 绑定都已不再输出；Sketch 侧改色需要重新导入 payload。

## 虚线 border

`border` 是包含 `color`、`width` 和 `style` 的标准 composite。`style` 可以使用标准 stroke style 字符串，也可以使用包含 `dashArray` 和 `lineCap` 的 object，或引用 standalone `strokeStyle` token：

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
      lineCap: butt
```

字符串 style 支持 `solid`、`dashed`、`dotted`、`double`、`groove`、`ridge`、`outset` 和 `inset`。object style 必须同时包含非空 `dashArray` 和 `lineCap`；`lineCap` 只接受 `round`、`butt`、`square`。`dashArray` 成员使用 dimension 合同，也接受 Wave dimension 简写和扩展单位。奇数长度数组会重复一次，所有平台输出相同的偶数数组。

DTCG schema 不限制 dash 成员的正负或全零组合；CSS 无法表示负值或全零 pattern 时会显示 token path、type 和 value shape 后失败。CSS 为 object style 输出可用的 `dashed` shorthand，并额外输出 `-dash-array` 和 `-line-cap` companion variables。例如 `--border-antline: 1px dashed #1872f0`、`--border-antline-dash-array: 4px 8px` 和 `--border-antline-line-cap: butt`。companion 名称与真实 token key 冲突时构建失败。Sketch 输出只包含可同步资产，虚线 border 不产生 Sketch 记录。
