---
title: 扩展与输出
description: $extensions 扩展字段与 json、jsonc、css、sketch、md-yml 输出格式参考。
category: Design Token
commands:
  - wave dt doctor
  - wave dt migrate-extensions
appliesTo:
  - 本地 CLI
---

## 输出格式

| platform | 输出文件 | 说明 |
| --- | --- | --- |
| `json` | `{theme}.json` | 扁平 JSON |
| `jsonc` | `{theme}.jsonc` | 带注释 JSONC |
| `css` | `{theme}.css` | CSS 变量 |
| `sketch` | `{theme}2sketch.json` | Sketch 资产清单（payload v2） |
| `md-yml` | `{theme}2md.yml` | Markdown frontmatter 用 YAML token fragment |

CSS 输出包含 `color`、`state`、`shadow`、`gradient`、`border`、`radius` 和 `font` roots。`theme.dimension` 不再作为 public output root；构建时会提示迁移，完整建议由 `wave dt doctor` 输出。

Typography token 在 CSS 中输出字段变量（`-family`、`-size`、`-weight`、`-line-height`、`-letter-spacing`、可选 `-color`），不输出聚合 shorthand 变量；在 Sketch 中输出 text 资产记录。带 `$extensions.platform.sketch.outline` 的 border token 会在 CSS 中输出 outline value 和 offset companion，在 Sketch 中生成双层 shadow 模拟 outline。

### 标准类型的平台输出

JSON 和 JSONC 输出扁平 key/value；dimension 和 composite 内的 dimension 字段保留单位字符串。md-yml 使用同样的最终值，但按 namespace 分组。CSS 输出可直接消费的值。Sketch 输出是一份资产清单，只有可同步资产会生成记录：

| `$type` | JSON / JSONC | CSS | Sketch |
| --- | --- | --- | --- |
| `color` | 目标色彩空间字符串，或 clean DTCG color object | CSS Color 4 value | `kind: color` 记录，HEX8 颜色 |
| `dimension` | `"8px"` | `8px` | radius 分组或 sketch property 维度生成 `kind: layer` 记录；其余不产生记录 |
| `fontFamily` | string 或 string array | font stack | 不产生记录 |
| `fontWeight` | number | number | 不产生记录（text 记录内仅接受 100-900 整百） |
| `duration` | `"200ms"` | `200ms` | 不产生记录 |
| `cubicBezier` | number array | `cubic-bezier(...)` | 不产生记录 |
| `number` | number | number | radius 分组或 sketch property 维度生成 `kind: layer` 记录；其余不产生记录 |
| `strokeStyle` | string 或 `{ dashArray, lineCap }` | 主变量与 dash/line-cap companion | 不产生记录 |
| `border` | `{ color, width, style }` | border shorthand 与必要 companion | 仅带 `platform.sketch.outline` 的 border 生成 `kind: layer` 记录 |
| `transition` | `{ duration, delay, timingFunction }` | transition value | 不产生记录 |
| `shadow` | 单层 object 或 layer array | box-shadow value | `kind: layer` 记录（`shadows` 字段） |
| `gradient` | stop array | linear-gradient value | `kind: layer` 记录（`gradient` 字段） |
| `typography` | 五个标准字段与可选 Wave `color` | 字段变量 | `kind: text` 记录 |

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
  text-emphasis: '#112233'
radius:
  md: 8px
font:
  font-family:
    - system-ui
    - sans-serif
  heading-h1:
    color: "{color.text-emphasis}"
    fontFamily: "{font.font-family}"
    fontSize: 2.5rem
    fontWeight: 700
    letterSpacing: 0px
    lineHeight: 1.2
```

输出的第一层是 namespace，剩余 source path 用 `-` 连接。因此 `theme.color.primary.main` 在过滤 `theme` 后输出为 `color.primary-main`，内文可使用：

```markdown
{color.primary-main}
```

md-yml 会保留可投影到同一文件的 theme direct reference，并把路径改写为输出路径。例如 `theme.font.heading.h1` 从 `theme.font.$extensions.typography.defaults` 继承 `fontFamily: "{theme.font.font-family}"` 后，输出为 `fontFamily: "{font.font-family}"`。完整 token、composite 子字段和数组成员中的 direct reference 使用同一规则。

引用只有在目标也输出到当前 payload，且 consumer slot 没有被计算改写时才保留。external resource reference、`$ref + override`、`smoothShadow` / `smoothGradient`、`inheritColor` / `currentColor` 等 computed value 仍输出 resolver 和 transformer 处理后的最终值。object、array 和 explicit composite 保留结构。文件不包含 `---` delimiter、`$description` 注释、token wrapper 或 `$type` / `$value` metadata。

`filterLayer` 处理后必须至少保留 namespace 和 local key。路径中的 source segment 不能为空或包含 `.`；不同 source path 若投影到同一个 key，build 会失败。值含有 YAML 无法无损表示的数据，例如 `undefined`、非有限 number、稀疏 array 或 cycle 时，build 也会在写入该 pass 的任何产物前失败。

## $extensions

`$extensions` 用于表达 Wave 的扩展语义。构建后，扩展字段会被消费，不会原样出现在输出文件中。

支持的字段：

| 字段 | 位置 | 适用类型 | 用途 |
| --- | --- | --- | --- |
| `smoothShadow` | token | `shadow` | 从单层阴影派生多层平滑阴影 |
| `smoothGradient` | token | `gradient` | 从 2 个 stop 派生平滑渐变 |
| `inheritColor` | token | `color` | 输出继承上下文颜色 |
| `platform.sketch.path` | group 或 token | 任意 token | 调整 Sketch 资产 name 的分组前缀 |
| `platform.sketch.skip` | group 或 token | 任意 token | 仅跳过 Sketch 输出 |
| `platform.sketch.property.opacity` | token | `theme.state.*` 下的 `number` | 输出 Sketch opacity 字段 |
| `platform.sketch.property.cornerRadius` | token | radius/dimension 类 token | 输出 Sketch corners.radii 字段 |
| `platform.sketch.outline` | border token | `border` | 输出 CSS outline 和 Sketch 双层 shadow 模拟 |
| `composite` | group | 直接子节点必须是 token | 把一组 token 合并为组件对象 |
| `currentColor` | token | legacy | 旧项目兼容字段，新内容使用 `inheritColor` |

旧写法 `$extensions.sketch.*` 和 `$extensions.outline` 会被构建直接拒绝，并提示迁移命令。在项目目录运行一次即可完成改名（默认只预览，加 `--write` 写回）：

```bash
wave dt migrate-extensions --write
```

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

## platform.sketch

`$extensions.platform.sketch` 只控制 Sketch JSON 输出，不影响 `json`、`jsonc`、`css` 或 `md-yml` 的 key。`path` 和 `skip` 可以写在 group 或 token 上；写在 group 上时，会应用到后代 token。

```yaml
theme:
  color:
    $type: color
    $extensions:
      platform:
        sketch:
          path: foundation/color
    primary:
      $value: "#1872f0"
  state:
    hover:
      $type: number
      $value: 0.16
      $extensions:
        platform:
          sketch:
            path: foundation/interaction
            property:
              opacity: true
  radius:
    card:
      $type: dimension
      $value: "12px"
      $extensions:
        platform:
          sketch:
            property:
              cornerRadius: true
```

字段：

| 字段 | 说明 |
| --- | --- |
| `platform.sketch.path` | Sketch 资产 name 的 slash 分组前缀，例如 `foundation/color`；可写在 group 或 token 上 |
| `platform.sketch.skip` | `true` 时不输出到 Sketch；后代 group 或 token 可以显式写 `false` 恢复输出 |
| `platform.sketch.property.opacity` | 在 layer 记录中写 `opacity` 数值 |
| `platform.sketch.property.cornerRadius` | 在 layer 记录中写 `corners.radii` 数值 |
| `platform.sketch.outline` | border token 专用；按 `offset` 生成双层 shadow 模拟 outline，并让 CSS 输出 outline 变量 |

`path` 使用 slash 分组，作为资产 name 的前缀。假设 `filterLayer: 1`，上面的 color token 会生成 name 为 `foundation/color/primary-main` 的资产；没有 `path` 时，name 就是 `filterLayer` 处理后的叶子 key。

优先级：

1. token 自己的 `path`
2. 最近父级 group 的 `path`
3. 更上层祖先 group 的 `path`

`property` 不继承。需要输出 `opacity` 或 `corners.radii` 时，仍要写在对应 token 上。

`skip` 只接受 boolean，按最近声明继承，token 自己的值优先。显式 `false` 会覆盖祖先 group 的 `true`。这个开关只过滤 Sketch 输出，CSS、JSON、JSONC 和 md-yml 仍会输出该 token。

限制：

- `path` 必须是普通 slash 分组路径，例如 `foundation/color`；不能包含首尾 slash、空分段或 `.`。
- `property` 只支持 `opacity` 和 `cornerRadius`，值必须是 `true`，且只能写在 token 上。
- `property.opacity` 可用于 `theme.state.*` 下的 `number` token。
- `property.cornerRadius` 可用于 `theme.radius.*` 或 `theme.dimension.*` 下的 radius/dimension 类 token。
- `outline` 只在 border token 上生效。
- 未知字段、未知 property 或用错位置的写法都会构建报错。例如 `$type: number` 搭配 `property.fillColor: true` 会报错，因为 `fillColor` 不是支持的 Sketch property；`$type: color` 搭配 `property.opacity: true` 会报错，因为 `opacity` 只接受 state number token。
- `platform.*` 下的未知平台（例如 `platform.figma`）只会产生 warning，不影响构建；这是为未来平台预留的兼容位。

## Sketch 资产清单

`sketch` 平台输出一份 JSON 资产清单：根部是 `meta` 和 `assets`，`assets` 里一行一条资产，方便人工审阅和 git diff。

```json
{
  "meta": { "themeId": "6f1c2a54b7d84e0f9a1c32d45e6b70f8", "version": 2 },
  "assets": [
    { "uuid": "0f8e6d5c4b3a29180f7e6d5c4b3a2918", "name": "foundation/color/primary-main", "kind": "color", "color": "#1872f0ff" },
    { "name": "foundation/interaction/hover", "kind": "layer", "opacity": 0.16 }
  ]
}
```

- `meta.themeId` 来自 `main.yaml` 根部的文档级 `$id`；未声明时为 `null`，Sync Token 会提示补登记。`version` 固定为 `2`。
- 每条记录携带 `name` 与 `kind`；token 已登记 token 级 `$id` 时还会携带 `uuid`，未登记则省略该字段。
- `kind` 只有三种：`color`（颜色 token，对应 Swatch）、`text`（typography token，对应共享文字样式）、`layer`（阴影、渐变、outline border、圆角维度等，对应共享图层样式）。
- 只有可同步资产进入清单：普通 border、普通 dimension、transition 等不产生记录。
- text 记录只含字体字段（`fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`kerning`），不含文字颜色；`fontWeight` 只接受 100-900 的整百刻度，其他值在 Sketch 构建时直接报错，CSS 和 JSON 不受影响。
- layer 记录由 `shadows`、`gradient`、`opacity`、`corners` 等字段组合而成；同一记录内 `fills` 与 `gradient` 互斥。
- 记录按 token 在主题文件中的顺序排列，改名或调整 `path` 之外的内容不会打乱顺序。

资产 name 在同一份清单内必须唯一：两个 token 生成了完全相同的 name 时构建报错。name 里的 slash 只是普通字符，前缀重叠不算冲突，例如 `shadow` 与 `shadow/elevation-1` 可以共存。

已登记 `$id` 的颜色 token 之间会在 layer 记录的颜色位置用 `{ "$ref": "<uuid>" }` 相互绑定，由 Sync Token 生成 Swatch；未登记的目标降级为 HEX8 颜色快照。详见[颜色与字体](/design-token/color-typography)。

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
