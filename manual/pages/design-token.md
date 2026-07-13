---
title: Design Token
description: 配置 main.yaml、profile、$extensions，并生成 json、jsonc、css 和 sketch 输出。
category: 能力
commands:
  - wave dt init
  - wave dt build
  - wave dt status
appliesTo:
  - 本地 CLI
---

## 用途

`wave dt` 用来读取 design token，解析引用，转换扩展字段，并生成 `json`、`jsonc`、`css` 或 `sketch` 输出。

新项目推荐从模板开始：

```bash
wave dt init
wave dt build
```

开发环境中，用 `pnpm dev -- dt ...` 代替已安装的 `wave dt ...`。

## 选择入口

优先使用 `main.yaml` 作为构建入口。`wave dt init` 生成的 `main.yaml` 已包含 `$config`：

```bash
wave dt build
```

也可以显式指定入口：

```bash
wave dt build -f ./main.yaml
```

旧项目仍可指定兼容的 `themefile`，但新项目不再以 `themefile` 作为推荐入口。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `main.yaml` | default profile、token 内容和 `$config` 来源 |
| `profiles/<name>.yaml` | named profile，可选 |
| `main@night.yaml` | default profile 的 Night Mode 覆盖文件，可选 |
| `profiles/<name>@night.yaml` | named profile 的 Night Mode 覆盖文件，可选 |
| `themefile` | 旧项目兼容入口，可选 |

`$config.resource` 只提供引用解析数据，不直接决定输出内容。

## main.yaml

`main.yaml` 同时声明 `$config` 和 token 内容：

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
| `resource.palette[]` | 色板资源，例如 `tailwindcss` |
| `resource.dimension[]` | 尺寸资源，例如 `wave` |
| `resource.custom[]` | 自定义资源文件 |
| `parameter.outputDir` | 输出目录 |
| `parameter.platform[]` | 输出格式 |
| `parameter.filterLayer` | 输出 key 时跳过前 N 层路径 |
| `parameter.colorSpace` | 颜色输出格式 |
| `parameterGroup.<name>` | 多组输出参数，字段同 `parameter` |

## 旧 themefile 入口

`themefile` 只为旧项目保留兼容，不作为新项目推荐结构。

最小示例：

```text
THEME example
RESOURCE palette tailwindcss
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER platform json,css
PARAMETER colorSpace hex
```

必填指令：

| 指令 | 说明 |
| --- | --- |
| `THEME <name>` | 主题名，也是输出文件名前缀，例如 `example.json` |
| `RESOURCE <kind> <ref>` | 引用解析资源，至少需要一条 |

`RESOURCE` 支持：

| kind | ref 示例 | 说明 |
| --- | --- | --- |
| `palette` | `tailwindcss` | 色板资源 |
| `dimension` | `wave` | 尺寸、透明度、曲线等资源 |
| `custom` | `./tokens/brand.yaml` | 自定义资源文件 |

`PARAMETER` 支持：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `output` | `./build` | 输出目录 |
| `platform` | `json,css,sketch` | 输出格式，支持 `json`、`jsonc`、`css`、`sketch` |
| `filterLayer` | `1` | 输出 key 时跳过前 N 层路径 |
| `colorSpace` | `oklch` | 颜色输出格式，支持 `hex`、`oklch`、`srgb`、`hsl` |

命令行参数优先级高于配置文件：

```bash
wave dt build --platform json,css -o ./dist
```

## GROUP

`GROUP` 用来一次构建多组输出。全局 `PARAMETER` 是默认值，组内 `PARAMETER` 覆盖同名参数。

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

支持的 `$type` 包括 `color`、`shadow`、`gradient`、`border`、`typography`、`opacity`、`dimension`、`number`、`cubicBezier`。

## theme 顶级 key

`theme` 下的顶级 key 表达 token 的用途，也会影响 CSS 和 Sketch 输出。新项目优先使用这些 root：

| key | 用途 | 常见 `$type` |
| --- | --- | --- |
| `color` | 品牌色、语义色、文本色、背景色、描边色 | `color` |
| `state` | hover、pressed、disabled 等交互状态值 | `number`、`opacity` |
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

`typography` group 可以用 `$extensions.typography.defaults` 为后代 token 提供公共字段。`defaults` 只能写在有效 `$type` 为 `typography` 的 group 上，只接受 `fontFamily`、`fontSize`、`fontWeight`、`lineHeight` 和 `letterSpacing`。子 group 按字段覆盖祖先 defaults，token 自己的 `$value` 最后覆盖 defaults；合并后每个 typography token 必须包含这五个字段。可选 `color` 保留在 token `$value` 和 JSON/JSONC 输出中；CSS 额外输出 `--<token>-color`，直接引用已输出的 `theme.color.*` 时保留为 `var(--<color-token>)`；Sketch 输出最终 HEX8 到 `textStyle.textColor`，不保留 Sketch 颜色引用关系。

```yaml
theme:
  font:
    $type: typography
    $extensions:
      typography:
        defaults:
          fontFamily: "{wave.dimension.fontFamily}"
          fontSize:
            value: 14
            unit: pt
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

`lineHeight` 必须大于 0。无单位 number 或纯数字字符串表示倍率；`{ value }` 不表示倍率，必须带单位。CSS 保留倍率；Sketch 用合并后的 `fontSize` 乘以倍率，并将计算结果向上取整。带 `px` 或 `pt` 的字符串或 `{ value, unit }` 表示绝对行高：CSS 保留单位，Sketch 原样输出数值部分，不取整。Wave 不接受其他 typography 单位，也不换算 `px` 和 `pt`。

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

## 输出格式

| platform | 输出文件 | 说明 |
| --- | --- | --- |
| `json` | `{theme}.json` | 扁平 JSON |
| `jsonc` | `{theme}.jsonc` | 带注释 JSONC |
| `css` | `{theme}.css` | CSS 变量 |
| `sketch` | `{theme}2sketch.json` | Sketch JSON |

CSS 输出包含 `color`、`state`、`shadow`、`gradient`、`border`、`radius` 和 `font` roots。`theme.dimension` 不再作为 public output root；构建时会提示迁移，完整建议由 `wave dt doctor` 输出。

Typography token 会在 CSS 中输出字段变量和 shorthand 变量，在 Sketch 中输出 text shared style payload。带 `outline` extension 的 border token 会在 CSS 中输出 outline value 和 offset companion，在 Sketch 中用两层 shadow 模拟 outline。

当前目录存在 `main.yaml` 时，`wave dt doctor` 会默认检查它；也可以用 `wave dt doctor -f ./main.yaml` 显式指定。

多平台用逗号分隔：

```text
PARAMETER platform json,jsonc,css,sketch
```

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
| `json` / `jsonc` | `$COLOR_FOREGROUND` 或 `{ color: "$COLOR_FOREGROUND", opacity: X }` |
| `sketch` | 写入 Sketch 颜色、`opacity` 或 `alpha` 字段 |

## sketch

`$extensions.sketch` 只控制 Sketch JSON 输出，不影响 `json`、`jsonc`、`css` 的 key。`sketch.path` 和 `sketch.skip` 可以写在 group 或 token 上；写在 group 上时，会应用到后代 token。

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

`sketch.path` 只定义分组路径，叶子名仍使用 `filterLayer` 处理后的 flat-json key。没有 `sketch.path` 时，Sketch 输出保持根级 flat-json。

优先级：

1. token 自己的 `sketch.path`
2. 最近父级 group 的 `sketch.path`
3. 更上层祖先 group 的 `sketch.path`

`sketch.property` 不继承。需要输出 `{ opacity: value }` 或 `{ corners: { radii: value } }` 时，仍要写在对应 token 上。

`sketch.skip` 只接受 boolean，按最近声明继承，token 自己的值优先。显式 `false` 会覆盖祖先 group 的 `true`。这个开关只过滤 Sketch JSON，CSS、JSON 和 JSONC 仍会输出该 token。

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
- JSON/JSONC 输出会合并为对象。
- Sketch 输出不再把 composite 映射为组件样式字段；component 逻辑后续单独设计。

## 兼容字段

| 字段 | 状态 | 替代写法 |
| --- | --- | --- |
| `currentColor` | deprecated | `inheritColor` |

新文档和新项目不要继续使用兼容字段。

## WCAG

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
wave dt wcag mobile
wave dt wcag mobile --night
wave dt wcag --profile mobile
```

## Profile 和 Night Mode

默认构建只构建 `main.yaml`：

```bash
wave dt build
```

构建 named profile：

```bash
wave dt build --profile mobile
wave dt build --profiles all
```

Profile 文件放在：

```text
main.yaml
profiles/mobile.yaml
```

Night Mode 是覆盖文件，不是 profile。需要 night 输出时显式加 `--night`：

```bash
wave dt build --night
wave dt build --profile mobile --night
wave dt build --profiles all --night
```

Night Mode 文件放在：

```text
main@night.yaml
profiles/mobile@night.yaml
```

缺失或无效的 Night Mode 不会阻断 day build。Wave 会输出 `Night Mode unavailable/invalid and skipped`，并跳过对应 night 文件。

`variants/`、`--variant`、`--variants` 和 `--no-variants` 不再支持。旧项目需要把 variant 拆成 `profiles/<name>.yaml`。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| 找不到 `main.yaml` | 在 token 项目目录执行命令，或先运行 `wave dt init` |
| `main.yaml` 缺少 `$config` | 补齐 `$config`；如需检查 dimension 迁移，再运行 `wave dt doctor` |
| 出现 `Direct RESOURCE token generation is deprecated` | 当前目录缺少 `main.yaml`，Wave 正在使用旧兼容路径；运行 `wave dt init` 后把 token 内容迁移到 `main.yaml` |
| 引用无法解析 | 检查 `RESOURCE` 是否声明，或 token 路径是否正确 |
| Sketch opacity 不输出 | 确认 token 在 `theme.state.*` 下，且 `$type` 是 `number` |
| 仍在使用 `theme.dimension` 输出 | 迁移到 `theme.state`、`theme.shadow`、`theme.gradient` 或 `theme.radius`；运行 `wave dt doctor` 查看建议 |
| WCAG 无检查项 | 确认存在 `doctor.wcagPairs` |

## 旧入口

`wave create` 仍可用于旧项目，默认读取 `themefile`。新脚本优先使用 `wave dt`。
