---
title: Design Token
description: 配置 themefile、main.yaml、$extensions，并生成 json、jsonc、css 和 sketch 输出。
category: 能力
commands:
  - wave dt init
  - wave dt build -f ./themefile
  - wave dt status
appliesTo:
  - 本地 CLI
---

## 用途

`wave dt` 是 design token 主入口。推荐结构是：

- `themefile` 声明资源和输出参数。
- `main.yaml` 定义 token 内容。
- `RESOURCE` 只提供引用解析数据，不直接决定输出。

新项目先运行：

```bash
wave dt init
wave dt build -f ./themefile
```

开发环境中，用 `pnpm dev -- dt ...` 代替已安装的 `wave dt ...`。

## themefile

`themefile` 是构建入口，负责声明主题名、资源和输出参数。

```text
THEME example
RESOURCE palette tailwindcss
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER platform json,css
PARAMETER colorSpace hex
```

### 必填指令

| 指令 | 说明 |
| --- | --- |
| `THEME <name>` | 输出文件名前缀，例如 `example.json` |
| `RESOURCE <kind> <ref>` | 声明引用解析资源，至少需要一条 |

`RESOURCE` 支持：

| kind | ref 示例 | 说明 |
| --- | --- | --- |
| `palette` | `tailwindcss` | 色板资源 |
| `dimension` | `wave` | 尺寸、透明度、曲线等资源 |
| `custom` | `./tokens/brand.yaml` | 自定义资源文件 |

### PARAMETER

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `output` | `./build` | 输出目录 |
| `platform` | `json,css,sketch` | 输出格式，支持 `json`、`jsonc`、`css`、`sketch` |
| `filterLayer` | `1` | 输出 key 时跳过前 N 层路径 |
| `colorSpace` | `oklch` | 颜色输出格式，支持 `hex`、`oklch`、`srgb`、`hsl` |

命令行参数优先级高于 `themefile`：

```bash
wave dt build -f ./themefile --platform json,css -o ./dist
```

### GROUP

`GROUP` 用于一次构建输出多组不同参数。全局 `PARAMETER` 是默认值，组内 `PARAMETER` 覆盖同名参数。

```text
THEME example
RESOURCE palette tailwindcss
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER colorSpace hex

GROUP "css" {
  PARAMETER platform css
  PARAMETER filterLayer 2
  PARAMETER output ./build/css
}

GROUP "sketch" {
  PARAMETER platform sketch
  PARAMETER filterLayer 2
  PARAMETER output ./build/sketch
}
```

`GROUP` 块内只接受 `PARAMETER`、注释和空行。

## main.yaml

`main.yaml` 保存 token 内容。通过 `themefile` 构建时，`main.yaml` 不需要 `$config`。

```yaml
theme:
  color:
    $type: color
    primary:
      $description: 品牌主色
      $value: "{tailwindcss.color.indigo.600}"
    onPrimary:
      $value: "#ffffff"
  dimension:
    radius:
      $type: dimension
      card:
        $value: "12px"
```

直接运行 `wave dt build` 时，当前目录的 `main.yaml` 需要包含 `$config`：

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
      $value: "{tailwindcss.color.indigo.600}"
```

`$config` 支持：

| 字段 | 位置 | 说明 |
| --- | --- | --- |
| `theme` | `$config.theme` | 主题名，也是输出文件名前缀 |
| `resource.palette` | `$config.resource.palette[]` | 色板资源，例如 `tailwindcss` |
| `resource.dimension` | `$config.resource.dimension[]` | 尺寸资源，例如 `wave` |
| `resource.custom` | `$config.resource.custom[]` | 自定义资源文件 |
| `parameter.outputDir` | `$config.parameter.outputDir` | 输出目录；等价于 `themefile` 的 `PARAMETER output` |
| `parameter.platform` | `$config.parameter.platform[]` | 输出格式 |
| `parameter.filterLayer` | `$config.parameter.filterLayer` | 输出 key 时跳过前 N 层路径 |
| `parameter.colorSpace` | `$config.parameter.colorSpace` | 颜色输出格式 |
| `parameterGroup.<name>` | `$config.parameterGroup` | 多组输出参数，字段同 `parameter` |

不确定用哪种入口时，优先使用 `wave dt build -f ./themefile`。

## token 基本写法

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

支持的 `$type` 包括 `color`、`shadow`、`gradient`、`border`、`opacity`、`dimension`、`number`、`cubicBezier`。

引用有两种形式：

```yaml
primary:
  $value: "{tailwindcss.color.indigo.600}"

secondary:
  $ref: "#/theme/color/primary/$value"
```

颜色 token 可以使用 DTCG 颜色对象，把颜色和透明度分开写。`color` 和 `alpha` 都可以使用引用：

```yaml
inverse:
  surface:
    $description: 反色背景，常用于 Snackbar 或 Toast
    $value:
      color: "{tailwindcss.color.slate.900}"
      alpha: "{wave.dimension.alpha.800}"
```

构建时，Wave 会先解析 `color` 和 `alpha`，再按 `colorSpace` 输出最终颜色。例如 `colorSpace hex` 会输出 8 位 hex。

## $extensions

`$extensions` 用于表达 Wave 的扩展语义。构建后，扩展字段会被消费，不会原样出现在输出文件中。

支持的字段：

| 字段 | 位置 | 适用类型 | 用途 |
| --- | --- | --- | --- |
| `smoothShadow` | token | `shadow` | 从单层阴影派生多层平滑阴影 |
| `smoothGradient` | token | `gradient` | 从 2 个 stop 派生平滑渐变 |
| `inheritColor` | token | `color` | 输出继承上下文颜色 |
| `sketch.path` | token | 任意 token | 调整 Sketch 输出路径 |
| `sketch.property.opacity` | token | `theme.dimension.*` 下的 `number` 或 `dimension` | 输出 Sketch opacity 字段 |
| `sketch.property.cornerRadius` | token | `theme.dimension.*` 下的 `number` 或 `dimension` | 输出 Sketch cornerRadius 字段 |
| `composite` | group | 直接子节点必须是 token | 把一组 token 合并为组件对象 |
| `currentColor` | token | legacy | 旧项目兼容字段，新内容使用 `inheritColor` |
| `sketchMap` | token | legacy | 旧项目兼容字段，新内容使用 `sketch.property` |

### smoothShadow

用于 `shadow` token，把单层阴影派生为多层平滑阴影。

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

### smoothGradient

用于 `gradient` token，把 2 个端点扩展为多个渐变 stop。

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

### inheritColor

用于 `color` token，表示输出时继承上下文颜色。

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
| `json` / `jsonc` | `$COLOR_FOREGROUND` 或 `{ color: "$COLOR_FOREGROUND", opacity: X }` |
| `sketch` | 写入 Sketch 颜色、`opacity` 或 `alpha` 字段 |

### sketch

用于控制 Sketch JSON 输出。它不影响 `json`、`jsonc`、`css` 的 key。

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "#1872f0"
      $extensions:
        sketch:
          path: foundation/color
  dimension:
    interaction:
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
| `sketch.path` | Sketch 输出中的嵌套路径，例如 `foundation/color` |
| `sketch.property.opacity` | 在 Sketch dimension 输出中写 `{ opacity: value }` |
| `sketch.property.cornerRadius` | 在 Sketch dimension 输出中写 `{ cornerRadius: value }` |

`sketch.path` 使用 slash 分组。Wave 会把它写成嵌套对象，而不是把 slash 当成一个 flat key：

```yaml
primary:
  $value: "#1872f0"
  $extensions:
    sketch:
      path: foundation/color/primary-main
```

Sketch 输出：

```json
{
  "color": {
    "foundation": {
      "color": {
        "primary-main": "#1872f0ff"
      }
    }
  }
}
```

`filterLayer` 仍影响 `json`、`jsonc` 和 `css` 的 key；显式 `sketch.path` 不受 `filterLayer` 改名影响。

限制：

- `sketch.path` 必须是非空字符串。
- `sketch.property` 只支持 `opacity` 和 `cornerRadius`。
- `sketch.property.*` 的值必须是 `true`。
- `sketch.property.*` 只能用于 `theme.dimension.*` 下的 `number` 或 `dimension` token。
- legacy `$extensions.sketchMap: opacity` / `cornerRadius` 仍兼容；新内容使用 `$extensions.sketch.property`。

### composite

用于把一个 group 的直接子 token 合并成组件对象。适合 button、card 等组件变体。

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
- JSON/JSONC 输出会合并为对象。
- Sketch 输出会把 composite 映射为组件样式字段。

### 兼容字段

| 字段 | 状态 | 替代写法 |
| --- | --- | --- |
| `currentColor` | deprecated | `inheritColor` |
| `sketchMap` | 兼容旧项目 | `sketch.property` |

新文档和新项目不要继续使用兼容字段。

## doctor.wcagPairs

`doctor` 是独立 root key，用于 WCAG 对比度检查，不参与 token 输出。

```yaml
doctor:
  wcagPairs:
    primary-on-surface:
      foreground: "{theme.color.primary}"
      background: "{theme.color.surface}"
```

规则：

- `doctor` 可选。
- 如果存在 `doctor`，必须包含 `wcagPairs`。
- 每个 pair 必须包含 `foreground` 和 `background`。
- 两个值都必须是 alias 字符串，并指向 color token。

运行：

```bash
wave dt wcag
wave dt wcag dark
wave dt wcag dark --night
```

## 输出格式

| platform | 输出文件 | 说明 |
| --- | --- | --- |
| `json` | `{theme}.json` | 扁平 JSON |
| `jsonc` | `{theme}.jsonc` | 带注释 JSONC |
| `css` | `{theme}.css` | CSS 变量 |
| `sketch` | `{theme}2sketch.json` | Sketch JSON |

多平台用逗号分隔：

```text
PARAMETER platform json,jsonc,css,sketch
```

## 变体和 night

默认构建会检查：

```text
main.yaml
main@night.yaml
variants/*.yaml
variants/*@night.yaml
```

常用命令：

```bash
wave dt build -f ./themefile --no-night
wave dt build -f ./themefile --no-variants
wave dt build -f ./themefile --variant dark
wave dt build -f ./themefile --variants dark,brand
```

`--variant <name>` 可重复使用，适合只构建一个或少量变体；`--variants <names>` 使用逗号分隔列表。

night 和 variants 的开启、关闭或筛选当前通过命令行参数控制，不写入 `themefile` 或 `$config.parameter`。

只有项目中已经存在对应文件时，才指定对应变体或 night。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| 找不到 `main.yaml` | 在 token 项目目录执行命令，或用 `-f ./themefile` |
| `main.yaml` 缺少 `$config` | 改用 `wave dt build -f ./themefile`，或补齐 `$config` |
| 引用无法解析 | 检查 `RESOURCE` 是否声明，或 token 路径是否正确 |
| Sketch opacity 不输出 | 确认 token 在 `theme.dimension.*` 下，且 `$type` 是 `number` 或 `dimension` |
| WCAG 无检查项 | 确认存在 `doctor.wcagPairs` |

## 旧入口

`wave create` 仍可用于旧项目，默认读取 `themefile`。新脚本优先使用 `wave dt`。
