# Design Token 使用指南

本文档是 Wave design-token 的用户指南。顶层命令和其他能力见 `MANUAL.md`，内部行为快照见 `docs/SPEC.md`。

## 核心模型

Wave 的 design-token 主入口是 `wave dt`。当前推荐以 `main.yaml` 作为工作区入口，`main.yaml` 同时包含 `$config` 和 token 内容。

数据流：

```text
main.yaml
  -> 读取 $config.resource
  -> 解析 theme token
  -> 解析 $ref 引用
  -> 转换扩展能力
  -> 输出 json / jsonc / css / sketch
```

边界：

- `main.yaml` 是 token 内容来源。
- `$config.resource` 只声明引用解析用的数据源，不直接生成输出。
- `colorSpace` 只影响输出阶段，不改变引用解析过程。
- Sketch 输出有自己的命名和属性规则，通过 `$extensions.sketch` 表达。

## 快速开始

初始化：

```bash
wave dt init
```

构建：

```bash
wave dt
wave dt build
wave dt -f ./main.yaml
```

查看资源：

```bash
wave dt show
wave dt show palette
wave dt show dimension
wave dt show tailwindcss --format flat-json
```

检查：

```bash
wave dt doctor
wave dt wcag
wave dt wcag dark --night
```

## main.yaml

最小结构：

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
    outputDir: ./theme
    night: false
    variants: false
  parameterGroup:
    css:
      platform:
        - css
      filterLayer: 2
    sketch:
      platform:
        - sketch
      filterLayer: 1

theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss.color.indigo.600}"
```

`$config` 常用字段：

| 字段 | 说明 |
| --- | --- |
| `theme` | 输出文件名前缀。 |
| `resource` | 引用解析数据源。 |
| `parameter` | 全局输出参数。 |
| `parameterGroup` | 多组输出参数，每组独立构建一次。 |

`parameter` 常用字段：

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `outputDir` | 输出目录 | `./theme` |
| `platform` | 输出格式，支持 `json`、`jsonc`、`css`、`sketch` | `json` |
| `colorSpace` | 输出色彩空间，支持 `hex`、`oklch`、`srgb`、`hsl` | `hex` |
| `filterLayer` | 输出 key 的过滤层级 | `0` |
| `night` | 是否生成 night 输出 | `auto` |
| `variants` | 是否生成 variants 输出，或指定 variant 列表 | `auto` |

命令行参数优先级高于 `parameterGroup`，`parameterGroup` 高于全局 `parameter`。

## Token 语法

Wave 使用 DTCG 风格 token：

```yaml
theme:
  color:
    $type: color
    text:
      default:
        $value: "#0f172a"
  dimension:
    $type: dimension
    radius:
      card:
        $value: 8
```

引用 resource：

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss.color.indigo.600}"
  dimension:
    $type: dimension
    space:
      md:
        $value: "{wave.dimension.px.16}"
```

引用本地 token：

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "#1872f0"
    action:
      $value: "{theme.color.primary}"
```

## 输出格式

| 平台 | 输出文件 |
| --- | --- |
| `json` | `{theme}.json` |
| `jsonc` | `{theme}.jsonc` |
| `css` | `{theme}.css` |
| `sketch` | `{theme}2sketch.json` |

示例：

```bash
wave dt --platform json --platform css
wave dt --platform sketch
wave dt --variant dark
wave dt --no-night
wave dt --no-variants
```

## Shadow 与 smoothShadow

普通 shadow：

```yaml
theme:
  color:
    $type: color
    shadow:
      $value: "#0f172b"
  style:
    shadow:
      $type: shadow
      1:
        $value:
          - color:
              $ref: "#/theme/color/shadow/$value"
              alpha: 0.08
            offsetX: 0
            offsetY: "{wave.dimension.px.4}"
            blur: "{wave.dimension.px.8}"
            spread: -2
```

`smoothShadow` 从一层 seed shadow 生成多层 shadow：

```yaml
theme:
  style:
    shadow:
      $type: shadow
      1:
        $value:
          color: "#0f172b33"
          offsetX: 0
          offsetY: 1
          blur: 2
          spread: 1
        $extensions:
          smoothShadow:
            cubicBezier: "{wave.dimension.cubicBezier.easeOutCubic}"
            step: 4
            target:
              alpha: 0.08
              offsetX: 0
              offsetY: "{wave.dimension.px.4}"
              blur: "{wave.dimension.px.8}"
              spread: -2
```

规则：

- `$value` 是第一层 seed shadow，`target` 是最后一层 shadow。
- `step` 是输出层数，包含 seed 和 target；使用 `target` 时必须大于等于 2。
- `cubicBezier` 控制插值节奏，可以直接写数组，也可以引用 `wave.dimension.cubicBezier.*`。
- 不写 `target` 时，Wave 保留旧版从 base shadow 向零层衰减的行为。

## composite 组件输出

`composite` 用来把同一组 token 聚合为组件对象。当前 Sketch 输出会把 `background`、`foreground`、`border`、`radius`、`shadow` 映射为 Sketch style 字段。

```yaml
theme:
  component:
    button:
      $extensions:
        composite: true
      background:
        $type: color
        $value: "{theme.color.primary}"
      radius:
        $type: dimension
        $value: 8
```

当前版本不使用 `$extensions.sketch.path` 重命名 component key。component 逻辑后续会单独迭代。

## Sketch 输出

Sketch 输出文件是 `{theme}2sketch.json`。它按当前 formatter 输出四类顶层对象：

| 顶层对象 | 来源 |
| --- | --- |
| `color` | `theme.color.*` |
| `style` | `theme.style.interaction.*`、`theme.style.shadow*`、`theme.style.gradient*` |
| `dimension` | `theme.dimension.*` |
| `component` | 标记 `$extensions.composite: true` 的组件组 |

默认情况下，Sketch key 由 token 子路径用 `-` 拼接。例如 `theme.color.primary.main` 输出为 `primary-main`。

## `$extensions.sketch`

`$extensions.sketch` 用来表达 Sketch 平台特有的输出规则。

### path

`path` 用于为 Sketch 输出添加分组路径。Sketch 支持 slash 分组，例如 `foundation/color/text`。

```yaml
theme:
  color:
    text:
      default:
        $type: color
        $value: "#0f172a"
        $extensions:
          sketch:
            path: "foundation/color/text"
```

输出：

```json
{
  "color": {
    "foundation": {
      "color": {
        "text": {
          "text-default": "#0f172aff"
        }
      }
    }
  }
}
```

规则：

- `path` 必须是非空字符串。
- `path` 是 Sketch 分组路径，不是文件路径，也不是完整 token 名称。
- 没有 `path` 时保持默认 flat-json key，例如 `shadow-1`。
- 有 `path` 时按 slash 创建嵌套分组，叶子节点仍使用默认 flat-json key。例如 `theme.dimension.shadow.1` 配置 `path: "aaa/bbb"` 时，输出为 `{ "aaa": { "bbb": { "shadow-1": { ... } } } }`。
- `path` 支持 `color`、`style`、`dimension` 输出。
- 当前版本不使用 `path` 重命名 `component` key。
- 如果被引用的 color token 定义了 `sketch.path`，component fill、border、inheritColor 和 shadow swatch 引用会同步使用这个 path。

### property

`property` 用于把 dimension 或 number token 映射为 Sketch 样式字段。第一版只支持白名单字段：

| 字段 | 输出 | 适用 token |
| --- | --- | --- |
| `opacity: true` | `{ opacity: value }` | `theme.dimension.*` 下的 `number` 或 `dimension` |
| `cornerRadius: true` | `{ cornerRadius: value }` | `theme.dimension.*` 下的 `number` 或 `dimension` |

opacity 示例：

```yaml
theme:
  dimension:
    interaction:
      hover:
        $type: number
        $value: 0.16
        $extensions:
          sketch:
            path: "foundation/interaction"
            property:
              opacity: true
```

输出：

```json
{
  "dimension": {
    "foundation": {
      "interaction": {
        "interaction-hover": {
          "opacity": 0.16
        }
      }
    }
  }
}
```

cornerRadius 示例：

```yaml
theme:
  dimension:
    radius:
      card:
        $type: dimension
        $value: 8
        $extensions:
          sketch:
            path: "foundation/radius"
            property:
              cornerRadius: true
```

输出：

```json
{
  "dimension": {
    "foundation": {
      "radius": {
        "radius-card": {
          "cornerRadius": 8
        }
      }
    }
  }
}
```

校验规则：

- `property` 必须是对象。
- 只允许 `opacity` 和 `cornerRadius`。
- 值必须是 `true`；`false`、`"true"`、`"ture"` 都是错误。
- `property` 只能用于 `number` 或 `dimension` token。
- `property` 必须位于 `theme.dimension.*` 或等价 dimension root 下。
- `color` token 不能使用 `property.opacity` 或 `property.cornerRadius`。

错误示例：

```yaml
theme:
  dimension:
    interaction:
      hover:
        $type: number
        $value: 0.16
        $extensions:
          sketch:
            property:
              fillColor: ture
```

这里有两个错误：`fillColor` 不是支持的属性，`ture` 也不是布尔值 `true`。

另一个错误示例：

```yaml
theme:
  dimension:
    interaction:
      hover:
        $type: color
        $value: "#000000"
        $extensions:
          sketch:
            property:
              opacity: true
```

这里会失败，因为 `opacity` 只接受 `number` 或 `dimension` token。

### legacy sketchMap

旧写法仍可使用：

```yaml
$extensions:
  sketchMap: opacity
```

等价于：

```yaml
$extensions:
  sketch:
    property:
      opacity: true
```

如果同时写了 `sketch.property` 和 `sketchMap`，以 `sketch.property` 为准。

## `$extends` 与 Sketch extensions

`$extends` 继承时，`$extensions.sketch` 会按字段合并，方便在 base 里定义默认 Sketch path 或 property，再由 child 覆盖局部字段。

```yaml
base:
  $extensions:
    sketch:
      path: "foundation/base"
      property:
        opacity: true

child:
  $extends: "{base}"
  $extensions:
    sketch:
      property:
        cornerRadius: true
```

解析后的 child：

```yaml
$extensions:
  sketch:
    path: "foundation/base"
    property:
      opacity: true
      cornerRadius: true
```

只有 `sketch` extension 做这种嵌套合并；其他同名 extension 保持覆盖语义。

## Resource 管理

`wave dt update` 更新 design-token 引用解析用的本地 resource cache。它只更新本地 cache，不修改包内 builtin，也不会让常规 build 重新判断 latest。

更新全部可更新 resource：

```bash
wave dt update
```

更新 Tailwind CSS：

```bash
wave dt update tailwindcss
wave dt update tailwindcss --version 3
wave dt update tailwindcss --version 4
```

更新 Leonardo：

```bash
wave dt update leonardo
```

查看状态：

```bash
wave dt status
```

默认路径：

```text
cache:  ~/.cache/wave/resources/
state:  ~/.local/state/wave/resources/state.json
config: ~/.config/wave/resources/
```

读取优先级：

1. 项目显式路径 resource
2. 用户本地 cache resource
3. 包内 builtin resource

从未执行过 `wave dt update` 时，Wave 使用 builtin。

## 迁移说明

- 新项目优先使用 `main.yaml` + `$config`。
- `themefile` 和 `wave create` 仍可用于旧项目兼容。
- 新的 Sketch 映射优先写 `$extensions.sketch.property`，旧 `sketchMap` 可继续工作。
- Sketch 命名路径优先写 `$extensions.sketch.path`，不要依赖 `filterLayer` 管理 Sketch 分组。
- component key 暂不受 `sketch.path` 影响。
