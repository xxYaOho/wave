---
title: 扩展与输出
description: $extensions 扩展字段与 json、jsonc、css、sketch、md-yml 输出格式参考。
category: Design Token
commands:
  - wave dt doctor
appliesTo:
  - 本地 CLI
---

## 输出格式

| platform | 输出文件 | 说明 |
| --- | --- | --- |
| `json` | `{theme}.json` | 扁平 JSON |
| `jsonc` | `{theme}.jsonc` | 带注释 JSONC |
| `css` | `{theme}.css` | CSS 变量 |
| `sketch` | `{theme}2sketch.json` | Sketch JSON |
| `md-yml` | `{theme}2md.yml` | Markdown frontmatter 用 YAML token fragment |

CSS 输出包含 `color`、`state`、`shadow`、`gradient`、`border`、`radius` 和 `font` roots。`theme.dimension` 不再作为 public output root；构建时会提示迁移，完整建议由 `wave dt doctor` 输出。

Typography token 会在 CSS 中输出字段变量和 shorthand 变量，在 Sketch 中输出 text shared style payload。带 `outline` extension 的 border token 会在 CSS 中输出 outline value 和 offset companion，在 Sketch 中用两层 shadow 模拟 outline。

### 标准类型的平台输出

JSON 和 JSONC 输出扁平 key/value；dimension 和 composite 内的 dimension 字段保留单位字符串。md-yml 使用同样的最终值，但按 namespace 分组。CSS 输出可直接消费的值。Sketch 对 color、shadow、gradient 和 typography 使用原生 payload；其他标准类型使用 `{ value }` 保存规范化值。

| `$type` | JSON / JSONC | CSS | Sketch |
| --- | --- | --- | --- |
| `color` | 目标色彩空间字符串，或 clean DTCG color object | CSS Color 4 value | `{ color: "#rrggbbaa" }` |
| `dimension` | `"8px"` | `8px` | `{ value: "8px" }`；原生数值属性输出 number |
| `fontFamily` | string 或 string array | font stack | `{ value: ... }` |
| `fontWeight` | number | number | `{ value: number }` |
| `duration` | `"200ms"` | `200ms` | `{ value: "200ms" }` |
| `cubicBezier` | number array | `cubic-bezier(...)` | `{ value: [...] }` |
| `number` | number | number | `{ value: number }` |
| `strokeStyle` | string 或 `{ dashArray, lineCap }` | 主变量与 dash/line-cap companion | `{ value: ... }` |
| `border` | `{ color, width, style }` | border shorthand 与必要 companion | `{ value: ... }` |
| `transition` | `{ duration, delay, timingFunction }` | transition value | `{ value: ... }` |
| `shadow` | 单层 object 或 layer array | box-shadow value | `{ shadow: [...] }` |
| `gradient` | stop array | linear-gradient value | `{ gradient: [...] }` |
| `typography` | 五个标准字段与可选 Wave `color` | 字段变量与 shorthand | `{ textStyle: ... }` |

Sketch 的 generic `{ value }` 是 Wave generator 合同，不代表 Sync Token 已消费对应类型。

平台不能表达输入时，Wave 会停止构建，并报告 token path、type 和失败原因。典型失败包括：CSS 或 Sketch 无法转换且没有 `hex` fallback 的 color、CSS 的空 font family 和负或全零 dash pattern，以及 Sketch 原生数值属性无法表示的相对单位。CSS 对未知自定义 `$type` 只接受 scalar；object 或 array 会明确失败，禁止输出 `[object Object]`。

当前目录存在 `main.yaml` 时，`wave dt doctor` 会默认检查它；也可以用 `wave dt doctor -f ./main.yaml` 显式指定。

多平台用逗号分隔：

```text
PARAMETER platform json,jsonc,css,sketch,md-yml
```

## md-yml

`md-yml` 为 Markdown 文档生成可复制到 frontmatter 的 YAML token fragment。下列 Orca-derived token 使用 `filterLayer: 1` 时，会生成 `{theme}2md.yml`：

```yaml
color:
  primary-main: '#1a72f0'
  primary-on-main: '#ffffff'
radius:
  md: 8px
font:
  heading-h1:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 700
    letterSpacing: 0px
    lineHeight: 1.2
```

输出的第一层是 namespace，剩余 source path 用 `-` 连接。因此 `theme.color.primary.main` 在过滤 `theme` 后输出为 `color.primary-main`，内文可使用：

```markdown
{color.primary-main}
```

md-yml 输出 resolver 和 transformer 处理后的最终值，不保留 authored alias。object、array 和 explicit composite 保留结构。文件不包含 `---` delimiter、`$description` 注释、token wrapper 或 `$type` / `$value` metadata。

`filterLayer` 处理后必须至少保留 namespace 和 local key。路径中的 source segment 不能为空或包含 `.`；不同 source path 若投影到同一个 key，build 会失败。值含有 YAML 无法无损表示的数据，例如 `undefined`、非有限 number、稀疏 array 或 cycle 时，build 也会在写入该 pass 的任何产物前失败。

## $extensions

`$extensions` 用于表达 Wave 的扩展语义。构建后，扩展字段会被消费，不会原样出现在输出文件中。

支持的字段：

| 字段 | 位置 | 适用类型 | 用途 |
| --- | --- | --- | --- |
| `smoothShadow` | token | `shadow` | 从单层阴影派生多层平滑阴影 |
| `smoothGradient` | token | `gradient` | 从 2 个 stop 派生平滑渐变 |
| `inheritColor` | token | `color` | 输出继承上下文颜色 |
| `sketch.path` | group 或 token | 任意 token | 调整 Sketch 输出路径 |
| `sketch.skip` | group 或 token | 任意 token | 仅跳过 Sketch 输出 |
| `sketch.property.opacity` | token | `theme.state.*` 下的 `number` | 输出 Sketch opacity 字段 |
| `sketch.property.cornerRadius` | token | radius/dimension 类 token | 输出 Sketch corners.radii 字段 |
| `outline` | border token | `border` | 输出 CSS outline 和 Sketch 双层 shadow 模拟 |
| `composite` | group | 直接子节点必须是 token | 把一组 token 合并为组件对象 |
| `currentColor` | token | legacy | 旧项目兼容字段，新内容使用 `inheritColor` |

## smoothShadow

`smoothShadow` 用于 `shadow` token，把单层阴影派生为多层平滑阴影。

```yaml
theme:
  shadow:
    $type: shadow
    card:
      $value:
        color: "#00000033"
        offsetX: 0
        offsetY: 8
        blur: 24
        spread: 0
      $extensions:
        smoothShadow:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 4
```

字段：

| 字段 | 说明 |
| --- | --- |
| `cubicBezier` | 4 个数字，或引用 dimension 资源中的曲线 |
| `step` | 输出可见层数，整数且 `>= 1` |
| `target` | 可选目标阴影层；存在时从当前阴影插值到目标阴影 |

输入值必须是单个 shadow layer 对象，不是数组。使用 `target` 时，`step` 必须 `>= 2`。

`target` 支持的字段与 shadow layer 相同，也可用 `alpha` 单独指定目标透明度：

```yaml
$extensions:
  smoothShadow:
    cubicBezier: [0.4, 0, 0.2, 1]
    step: 4
    target:
      alpha: 0.08
      offsetX: 0
      offsetY: 16
      blur: 48
      spread: -4
```

## smoothGradient

`smoothGradient` 用于 `gradient` token，把 2 个端点扩展为多个渐变 stop。

```yaml
theme:
  gradient:
    $type: gradient
    overlay:
      $value:
        - color: "#00000000"
          position: 0
        - color: "#000000cc"
          position: 1
      $extensions:
        smoothGradient:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 7
```

字段：

| 字段 | 说明 |
| --- | --- |
| `cubicBezier` | 4 个数字，或引用 dimension 资源中的曲线 |
| `step` | stop 总数，整数且 `>= 2` |

输入 gradient 必须恰好有 2 个 stop。

## inheritColor

`inheritColor` 用于 `color` token，表示输出时继承上下文颜色。

```yaml
theme:
  color:
    $type: color
    icon:
      $value: "#000000"
      $extensions:
        inheritColor: true
    iconSubtle:
      $value: "#000000"
      $extensions:
        inheritColor:
          property:
            opacity: 0.36
          siblingSlot: foreground
```

字段：

| 字段 | 说明 |
| --- | --- |
| `inheritColor: true` | 输出继承色 |
| `property.opacity` | 输出透明度，支持数字、alias、`$ref` |
| `property.alpha` | 输出 alpha，支持数字、alias、`$ref` |
| `siblingSlot` | Sketch 输出时从同一 composite 中找兄弟色值 |

输出差异：

| 平台 | 输出 |
| --- | --- |
| `css` | `currentColor` 或 `color-mix(in srgb, currentColor X%, transparent)` |
| `json` / `jsonc` / `md-yml` | `$COLOR_FOREGROUND` 或 `{ color: "$COLOR_FOREGROUND", opacity: X }` |
| `sketch` | 写入 Sketch 颜色、`opacity` 或 `alpha` 字段 |

## sketch

`$extensions.sketch` 只控制 Sketch JSON 输出，不影响 `json`、`jsonc`、`css` 或 `md-yml` 的 key。`sketch.path` 和 `sketch.skip` 可以写在 group 或 token 上；写在 group 上时，会应用到后代 token。

```yaml
theme:
  color:
    $type: color
    $extensions:
      sketch:
        path: foundation/color
    primary:
      $value: "#1872f0"
  state:
    hover:
      $type: number
      $value: 0.16
      $extensions:
        sketch:
          path: foundation/interaction
          property:
            opacity: true
  radius:
    card:
      $type: dimension
      $value: "12px"
      $extensions:
        sketch:
          property:
            cornerRadius: true
```

字段：

| 字段 | 说明 |
| --- | --- |
| `sketch.path` | Sketch 输出中的嵌套路径，例如 `foundation/color`；可写在 group 或 token 上 |
| `sketch.skip` | `true` 时不输出到 Sketch；后代 group 或 token 可以显式写 `false` 恢复输出 |
| `sketch.property.opacity` | 在 Sketch 输出中写 `{ opacity: value }` |
| `sketch.property.cornerRadius` | 在 Sketch 输出中写 `{ corners: { radii: value } }` |

`sketch.path` 使用 slash 分组。Wave 会把它写成嵌套对象，而不是把 slash 当成一个 flat key：

```yaml
color:
  $type: color
  $extensions:
    sketch:
      path: foundation/color
  primary:
    $value: "#1872f0"
```

Sketch 输出：

```json
{
  "foundation": {
    "color": {
      "primary-main": {
        "color": "#1872f0ff"
      }
    }
  }
}
```

Sketch 颜色引用使用目标 token 的完整输出路径，因此不同 `sketch.path` 下可以存在相同叶子名，例如 `v1/color/foo` 与 `v2/color/foo`。引用会分别写为 `@/v1/color/foo` 与 `@/v2/color/foo`。

所有实际输出的 Sketch token 必须组成无冲突的对象树。两个 token 的完整输出路径相同，或一个路径是另一个路径的严格前缀时，构建会在写文件前失败。

`sketch.path` 只定义分组路径，叶子名仍使用 `filterLayer` 处理后的 flat-json key。没有 `sketch.path` 时，Sketch 输出保持根级 flat-json。

优先级：

1. token 自己的 `sketch.path`
2. 最近父级 group 的 `sketch.path`
3. 更上层祖先 group 的 `sketch.path`

`sketch.property` 不继承。需要输出 `{ opacity: value }` 或 `{ corners: { radii: value } }` 时，仍要写在对应 token 上。

`sketch.skip` 只接受 boolean，按最近声明继承，token 自己的值优先。显式 `false` 会覆盖祖先 group 的 `true`。这个开关只过滤 Sketch JSON，CSS、JSON、JSONC 和 md-yml 仍会输出该 token。

Sketch 输出不再固定包裹 `color`、`style`、`dimension` 或 `component` 顶层对象。位置由 `sketch.path` 控制，值形态由 `$type` 和 `sketch.property` 控制。

限制：

- `sketch.path` 必须是普通 slash 分组路径，例如 `foundation/color`。
- `sketch.path` 不能包含首尾 slash、空分段或 `.`。
- `sketch.property` 只支持 `opacity` 和 `cornerRadius`。
- `sketch.property.*` 的值必须是 `true`。
- `sketch.property.opacity` 可用于 `theme.state.*` 下的 `number` token。
- `sketch.property.cornerRadius` 可用于 `theme.radius.*` 或 `theme.dimension.*` 下的 radius/dimension 类 token。
- `sketch.property` 只能写在 token 上，不能写在 group 上。
- 两个 token 经过 `sketch.path` 和 `filterLayer` 后不能输出到同一路径；冲突会报错。
- 例如 `$type: number` 搭配 `sketch.property.fillColor: true` 会报错，因为 `fillColor` 不是支持的 Sketch property。
- 例如 `$type: color` 搭配 `sketch.property.opacity: true` 会报错，因为 `opacity` 只接受 state number token。

## composite

`composite` 用于把一个 group 的直接子 token 合并成组件对象。适合 button、card 等组件变体。

```yaml
component:
  button:
    outline:
      $extensions:
        composite: true
      fill:
        $value: "{theme.color.surface}"
      border:
        $value: "{theme.color.primary}"
      radius:
        $value: "9999px"
```

规则：

- `composite` 写在 group 的 `$extensions` 上。
- composite group 的直接子节点必须都是 token，不能再嵌套 group。
- JSON/JSONC/md-yml 输出会合并为对象。
- Sketch 输出不再把 composite 映射为组件样式字段；component 逻辑后续单独设计。
