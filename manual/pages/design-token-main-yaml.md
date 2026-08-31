---
title: main.yaml 写法
description: main.yaml 的 $config、parameterGroup、token 结构与 theme 顶级 key 写法参考。
category: Design Token
commands:
  - wave dt build
appliesTo:
  - 本地 CLI
---

## main.yaml

`main.yaml` 同时声明 `$config` 和 token 内容。完全自包含的 token 不需要声明 resource：

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./build
    platform: [json, css]
theme:
  color:
    primary:
      $type: color
      $value: "#2563eb"
```

需要引用外部 token 时，再通过 `$config.resource` 声明依赖：

```yaml
$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: example
  resource:
    palette:
      - tailwindcss
    dimension:
      - wave
  parameter:
    outputDir: ./build
    platform:
      - json
      - css
    colorSpace: hex
theme:
  color:
    $type: color
    primary:
      $description: 品牌主色
      $value: "{tailwindcss.color.indigo.600}"
    onPrimary:
      $value: "#ffffff"
  radius:
    card:
      $type: dimension
      $value: "12px"
```

`$config` 支持：

| 字段 | 说明 |
| --- | --- |
| `theme` | 主题名，也是输出文件名前缀 |
| `resource.palette` | 可选；色板资源，使用非空字符串或非空字符串数组 |
| `resource.dimension` | 可选；尺寸资源，使用非空字符串或非空字符串数组 |
| `resource.custom` | 可选；自定义资源文件，使用非空字符串或非空字符串数组 |
| `parameter.outputDir` | 非空输出目录 |
| `parameter.platform` | 非空数组；支持 `json`、`jsonc`、`css`、`sketch`、`md-yml` |
| `parameter.filterLayer` | 大于等于 0 的整数；输出 key 时跳过前 N 层路径 |
| `parameter.colorSpace` | 支持 `hex`、`oklch`、`srgb`、`hsl` |
| `parameterGroup.<name>` | 多组输出参数，字段同 `parameter` |

`$config` 是闭合结构。未知字段、错误类型、空字符串或无效枚举值会导致 build 失败，并在错误中显示字段路径。

build 只要求 token 图中的全部引用能够唯一解析。未被引用的缺失、损坏或重复 resource 声明不会阻塞 build；`wave dt doctor` 会严格检查当前目标中的全部声明。

## parameterGroup

`parameterGroup` 用来一次构建多组输出。`parameter` 提供默认值，每个 group 覆盖同名字段。每个 group 可使用的字段与 `parameter` 相同。

```yaml
$config:
  theme: example
  resource:
    palette: tailwindcss
    dimension: wave
  parameter:
    colorSpace: hex
    filterLayer: 1
  parameterGroup:
    css:
      outputDir: ./build/css
      platform: [css]
    sketch:
      outputDir: ./build/sketch
      platform: [sketch]
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss.color.indigo.600}"
```

不传 `--platform` 时，Wave 会展开 `parameterGroup`，每个 group 生成一个 pass。仅传 `--out` 会把这些 pass 的产物写到指定目录，不改变 group 的 platform、`filterLayer` 或 `colorSpace`。

传入 `--platform` 时，Wave 为每个选中的 profile 只建立一个 pass。该 pass 使用 profile 的 base `parameter`，并忽略 `parameterGroup` 中专属的 `filterLayer`、`colorSpace` 和 `outputDir`；`--out` 仍可以覆盖 single pass 的输出目录。例如，下列命令不会分别执行 `css` 和 `sketch` group，而是使用 base `filterLayer: 1` 只输出 `example2md.yml`：

```bash
wave dt build -f ./main.yaml --platform md-yml --out ./build/md
```

Wave 会在写入前统一检查本次 build 的全部输出路径，包括 default、named profile、有效 night 和各个 parameter group。若两个 pass 最终写向同一文件，build 会直接失败，并保持已有文件不变；例如一个 group 输出 `[json, css]`、另一个 group 在相同目录输出 `[json]`，两者会因 JSON 路径重叠而失败。无效 night 仍会提示并跳过，不参与路径检查。

## token 写法

Wave 使用 DTCG 风格结构：

```yaml
theme:
  color:
    $type: color
    surface:
      $value: "#ffffff"
    text:
      $value: "{theme.color.surface}"
```

常用字段：

| 字段 | 位置 | 说明 |
| --- | --- | --- |
| `$type` | group 或 token | token 类型，可被子节点继承 |
| `$value` | token | token 值 |
| `$description` | group 或 token | 输出到 jsonc/css 注释 |
| `$deprecated` | token | 标记废弃 |
| `$ref` | token | JSON Pointer 引用，例如 `#/theme/color/primary/$value` |
| `$extends` | group | 继承另一个 group，格式 `{theme.group.path}` |
| `$extensions` | group 或 token | Wave 扩展字段 |

Wave 支持 DTCG 2025.10 的全部标准 `$type`：

| 类别 | `$type` |
| --- | --- |
| 基础值 | `color`、`dimension`、`fontFamily`、`fontWeight`、`duration`、`cubicBezier`、`number`、`strokeStyle` |
| 复合值 | `border`、`transition`、`shadow`、`gradient`、`typography` |

`opacity` 不是标准 `$type`。透明度使用 `number` token；`inheritColor.property.opacity` 和 `$extensions.sketch.property.opacity` 是 Wave 扩展字段，写法见“扩展与输出”。未知自定义 `$type` 会产生 warning；JSON/JSONC 保留其值，md-yml 保留 YAML-safe 值，CSS 只输出 scalar，自定义 object 或 array 会在 CSS 构建时失败。

## Dimension 写法

DTCG 标准 dimension 使用 object，单位只允许 `px` 或 `rem`：

```yaml
space:
  $type: dimension
  $value:
    value: 8
    unit: px
```

Wave 也接受以下简写：

```yaml
spaceNumber:
  $type: dimension
  $value: 8
spaceString:
  $type: dimension
  $value: "8"
spaceLength:
  $type: dimension
  $value: "0.5rem"
spaceObject:
  $type: dimension
  $value:
    value: 8
```

简写还支持 `pt`、`em` 和 `%`。无单位值在 JSON、JSONC 和 CSS 中默认输出为 `px`，因此 `8` 和 `{ value: 8 }` 都输出 `"8px"`。这些写法是 Wave 输入能力，不是 DTCG 标准 dimension；Sketch 原生数值属性无法表达某个单位时会停止构建，不会静默换算。

## Typed reference

完整 token alias 会继承目标 token 的类型；复合值内的引用必须指向匹配的标准类型：

```yaml
theme:
  color:
    primary:
      $type: color
      $value: "#1872f0"
  radius:
    small:
      $type: dimension
      $value: 4
  border:
    dashed:
      $type: strokeStyle
      $value:
        dashArray: [4, 8]
        lineCap: butt
    control:
      $type: border
      $value:
        color: "{theme.color.primary}"
        width: "{theme.radius.small}"
        style: "{theme.border.dashed}"
    controlAlias:
      $value: "{theme.border.control}"
```

也可以用 `$ref: "#/theme/border/control/$value"` 引用完整值。类型不匹配、引用未解析或 composite 缺少标准字段时，构建会报告对应 token path 并失败。

## theme 顶级 key

`theme` 下的顶级 key 表达 token 的用途，也会影响 CSS 和 Sketch 输出。新项目优先使用这些 root：

| key | 用途 | 常见 `$type` |
| --- | --- | --- |
| `color` | 品牌色、语义色、文本色、背景色、描边色 | `color` |
| `state` | hover、pressed、disabled 等交互状态值 | `number` |
| `shadow` | 投影、层级阴影、平滑阴影 | `shadow` |
| `gradient` | 渐变、mask 渐变、平滑渐变 | `gradient` |
| `border` | 描边宽度、描边样式、outline token | `dimension`、`border` |
| `radius` | 圆角、组件角半径 | `dimension`、`number` |
| `font` | 字体、字号、字重、行高、字距组合 | `typography` |

CSS 输出只把 `color`、`state`、`shadow`、`gradient`、`border`、`radius` 和 `font` 作为 public roots。`theme.dimension` 只保留旧项目兼容，不再作为推荐的 public output root；尺寸、透明度和曲线优先放入具体用途对应的 root，或继续作为 `$config.resource.dimension` 中的引用资源使用。

引用有两种形式：

```yaml
primary:
  $value: "{tailwindcss.color.indigo.600}"

secondary:
  $ref: "#/theme/color/primary/$value"
```

## 兼容字段

| 字段 | 状态 | 替代写法 |
| --- | --- | --- |
| `currentColor` | deprecated | `inheritColor` |

新文档和新项目不要继续使用兼容字段。
