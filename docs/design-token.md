# Design Token 使用指南

本文档是 Wave design-token 的专题说明。用户入口见 `wave manual`，内部行为快照见 `docs/SPEC.md`。

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
wave dt wcag mobile --night
```

当前目录存在 `main.yaml` 时，`wave dt doctor` 会默认检查它；也可以用 `wave dt doctor -f ./main.yaml` 显式指定。

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
  radius:
    card:
      $type: dimension
      $value: 8
```

引用 resource：

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss.color.indigo.600}"
  radius:
    md:
      $type: dimension
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
wave dt --platform json,css
wave dt --platform sketch
wave dt build --profile mobile
wave dt build --profiles all
wave dt build --night
```

CSS 输出包含 `theme.color`、`theme.state`、`theme.shadow`、`theme.gradient`、`theme.border`、`theme.radius` 和 `theme.font`。`theme.dimension` 不再作为 public output root；运行 `wave dt doctor` 可查看迁移建议。

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

## composite

`composite` 用来把同一组 token 聚合为组件对象。当前版本不再把 component token 映射为 Sketch component style 字段；component 逻辑后续会单独迭代。

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

`composite` 仍可作为 token 组织语义存在，但 Sketch formatter 不再包含 component 特例。

## Sketch 输出

Sketch 输出文件是 `{theme}2sketch.json`。默认情况下，Sketch 输出是根级 flat-json：key 由 token 路径经过 `filterLayer` 后用 `-` 拼接。

例如 `theme.color.primary.main` 在 `filterLayer: 2` 下输出为 `primary-main`。

Sketch 输出不固定包裹 `color`、`style`、`dimension` 或 `component` 顶层对象。输出位置由 `$extensions.sketch.path` 控制，值形态由 `$type` 和 `$extensions.sketch.property` 控制。

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
  "foundation": {
    "color": {
      "text": {
        "text-default": "#0f172aff"
      }
    }
  }
}
```

规则：

- `path` 必须是普通 slash 分组路径，例如 `foundation/color`。
- `path` 是 Sketch 分组路径，不是文件路径，也不是完整 token 名称。
- `path` 不能包含首尾 slash、空分段或 `.`。
- 没有 `path` 时保持默认 flat-json key，例如 `shadow-1`。
- 有 `path` 时按 slash 创建嵌套分组，叶子节点仍使用默认 flat-json key。例如 `theme.shadow.raised` 配置 `path: "aaa/bbb"` 时，输出为 `{ "aaa": { "bbb": { "shadow-raised": { ... } } } }`。
- 两个 token 经过 `path` 和 `filterLayer` 后不能输出到同一路径；冲突会报错。

### property

`property` 用于把指定 token 映射为 Sketch 样式字段。当前只支持白名单字段：

| 字段 | 输出 | 适用 token |
| --- | --- | --- |
| `opacity: true` | `{ opacity: value }` | `theme.state.*` 下的 `number` |
| `cornerRadius: true` | `{ corners: { radii: value } }` | radius/dimension 类 token |

opacity 示例：

```yaml
theme:
  state:
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
  "foundation": {
    "interaction": {
      "hover": {
        "opacity": 0.16
      }
    }
  }
}
```

cornerRadius 示例：

```yaml
theme:
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
  "foundation": {
    "radius": {
      "radius-card": {
        "corners": {
          "radii": 8
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
- `property.opacity` 只能用于 `theme.state.*` 下的 `number` token。
- `property.cornerRadius` 可用于 `theme.radius.*` 或 `theme.dimension.*` 下的 radius/dimension 类 token。
- `color` token 不能使用 `property.opacity` 或 `property.cornerRadius`。

错误示例：

```yaml
theme:
  state:
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
  state:
    hover:
      $type: color
      $value: "#000000"
      $extensions:
        sketch:
          property:
            opacity: true
```

这里会失败，因为 `opacity` 只接受 `theme.state.*` 下的 `number` token。

## `$extends` 与 Sketch extensions

`$extends` 继承时，`$extensions.sketch` 遵循普通 extension 覆盖语义，不做 Sketch 专属深层合并。

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
    property:
      cornerRadius: true
```

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
- `variants/`、`--variant`、`--variants` 和 `--no-variants` 不再支持；旧 variant 拆到 `profiles/<name>.yaml`。
- `theme.dimension` 不再作为 public output root；迁移到 `theme.state`、`theme.shadow`、`theme.gradient` 或 `theme.radius`，并用 `wave dt doctor` 检查迁移建议。
- Sketch 属性映射写 `$extensions.sketch.property`，旧 `sketchMap` 不再作为映射来源。
- Sketch 分组路径写 `$extensions.sketch.path`；叶子名仍由 `filterLayer` 后的 flat-json key 决定。
- component token 不再映射为 Sketch component style 字段。
