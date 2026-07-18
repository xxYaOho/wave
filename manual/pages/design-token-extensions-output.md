---
title: 扩展与输出
description: $extensions 扩展字段与 json、jsonc、css、sketch 输出格式参考。
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

