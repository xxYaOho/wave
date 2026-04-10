# Sketch 图层属性参考

设计解析器参数参考，基于 SketchAPI 真实采样 + 官方文档整理。

---

## 目录

1. [图层类型](#1-图层类型)
2. [通用字段](#2-通用字段)
3. [Frame 专属字段](#3-frame-专属字段)
4. [Text 专属字段](#4-text-专属字段)
5. [Image 专属字段](#5-image-专属字段)
6. [SymbolInstance 专属字段](#6-symbolinstance-专属字段)
7. [exportFormats](#7-exportformats)
8. [flow（Prototype）](#8-flowprototype)
9. [style](#9-style)
   - [fills](#91-fills)
   - [borders](#92-borders)
   - [shadows / innerShadows](#93-shadows--innershadows)
   - [blurs](#94-blurs)
   - [corners](#95-corners)
   - [borderOptions](#96-borderoptions)
   - [progressiveAlpha](#97-progressivealpha)
   - [tint](#98-tint)
10. [枚举速查](#10-枚举速查)

---

## 1. 图层类型

`type` 字段决定图层种类，影响可用字段范围。

| `type`           | 含义                                       |
| ---------------- | ------------------------------------------ |
| `Artboard`       | Frame / Graphic（新版统称，旧称 Artboard） |
| `Group`          | 普通组                                     |
| `Text`           | 文本图层                                   |
| `Shape`          | 形状图层（含多路径）                       |
| `ShapePath`      | 单路径图层                                 |
| `Image`          | 图片图层（Bitmap）                         |
| `SymbolMaster`   | Symbol 母版                                |
| `SymbolInstance` | Symbol 实例                                |
| `HotSpot`        | 热区                                       |
| `Slice`          | 切片                                       |

> `type === "Artboard"` 时，用 `isFrame` / `isGraphicFrame` 区分 Frame 和 Graphic，不要依赖 `groupBehavior`。

---

## 2. 通用字段

所有图层类型均包含以下字段。

### 2.1 基础信息

| 字段          | 类型    | 说明                             |
| ------------- | ------- | -------------------------------- |
| `id`          | string  | 图层唯一 ID                      |
| `name`        | string  | 图层名称                         |
| `nameIsFixed` | boolean | 名称是否手动锁定（不随内容变化） |
| `type`        | string  | 图层类型，见第 1 节              |
| `hidden`      | boolean | 是否隐藏                         |
| `locked`      | boolean | 是否锁定                         |
| `selected`    | boolean | 当前是否被选中                   |

### 2.2 几何

| 字段        | 类型   | 说明                                  |
| ----------- | ------ | ------------------------------------- |
| `frame`     | object | 位置与尺寸：`{ x, y, width, height }` |
| `transform` | object | 旋转与翻转，见下                      |

```json
// frame
{ "x": 1441, "y": -913, "width": 87, "height": 87 }

// transform（rotation 单位为度，顺时针为正）
{ "rotation": 0, "flippedHorizontally": false, "flippedVertically": false }
```

### 2.3 布局约束

| 字段                                    | 类型    | 说明                                                   |
| --------------------------------------- | ------- | ------------------------------------------------------ |
| `horizontalSizing`                      | number  | 水平尺寸模式：`0`=Fixed `1`=Fill `2`=Fit `3`=Relative  |
| `verticalSizing`                        | number  | 垂直尺寸模式：同上                                     |
| `horizontalPins`                        | number  | 水平约束 bitmask：`0`=None `1`=Left `2`=Right `3`=Both |
| `verticalPins`                          | number  | 垂直约束 bitmask：`0`=None `1`=Top `2`=Bottom `3`=Both |
| `ignoresStackLayout`                    | boolean | 是否脱离父级 Stack 布局                                |
| `preservesSpaceInStackLayoutWhenHidden` | boolean | 隐藏时是否在 Stack 中保留占位                          |

### 2.4 遮罩

| 字段              | 类型    | 说明                            |
| ----------------- | ------- | ------------------------------- |
| `masksSiblings`   | boolean | 是否作为遮罩层                  |
| `maskMode`        | number  | 遮罩模式：`0`=Outline `1`=Alpha |
| `breaksMaskChain` | boolean | 是否忽略上层遮罩                |

### 2.5 其他

| 字段             | 类型                | 说明                          |
| ---------------- | ------------------- | ----------------------------- |
| `sharedStyleId`  | string \| null      | 关联的共享样式 ID             |
| `exportFormats`  | array               | 导出配置，见第 7 节           |
| `flow`           | object \| undefined | Prototype 跳转配置，见第 8 节 |
| `flowStartPoint` | boolean             | 是否为 Prototype 起始帧       |
| `style`          | object              | 样式对象，见第 9 节           |

---

## 3. Frame 专属字段

`type === "Artboard"` 时额外包含：

| 字段            | 类型           | 说明                            |
| --------------- | -------------- | ------------------------------- |
| `layers`        | array          | 子图层列表                      |
| `clipsContents` | boolean        | 是否裁剪超出内容                |
| `background`    | object         | Frame 专属背景色，见下          |
| `stackLayout`   | object \| null | Stack 布局配置，`null` 表示无   |
| `smartLayout`   | string \| null | 旧版 Smart Layout，已废弃，忽略 |
| `groupBehavior` | number         | 旧字段，忽略，用 `isFrame` 替代 |

### background

```json
{
  "enabled": true,
  "includedInExport": true,
  "color": "#ffffffff"
}
```

> ⚠️ `background` 与 `style.fills` 是两套独立系统。渲染时 `background`（若 `enabled`）作为最底层，`style.fills` 叠加其上。

---

## 4. Text 专属字段

`type === "Text"` 时，顶层额外包含：

| 字段         | 类型    | 说明         |
| ------------ | ------- | ------------ |
| `text`       | string  | 文本内容     |
| `fixedWidth` | boolean | 是否固定宽度 |

`style` 额外包含以下文本专属字段：

| 字段                | 类型                        | 说明                                                           |
| ------------------- | --------------------------- | -------------------------------------------------------------- |
| `textColor`         | string                      | 文本颜色（`#rrggbbaa`）                                        |
| `textColorName`     | string \| null              | 色彩变量名，无则为 `null`                                      |
| `fontSize`          | number                      | 字号（pt）                                                     |
| `fontFamily`        | string                      | 字体族名，`"system"` 表示系统字体                              |
| `fontWeight`        | number                      | 字重 `0~12`，见第 10 节                                        |
| `fontStyle`         | `"italic"` \| undefined     | 斜体，未设置为 `undefined`                                     |
| `fontVariant`       | `"small-caps"` \| undefined | 小型大写，未设置为 `undefined`                                 |
| `fontStretch`       | string \| undefined         | 宽度变体，见第 10 节                                           |
| `lineHeight`        | number \| null              | 行高，`null` = 字体默认值                                      |
| `kerning`           | number \| null              | 字距，`null` = 由字体定义                                      |
| `paragraphSpacing`  | number                      | 段落间距                                                       |
| `textTransform`     | string                      | 大小写转换：`"none"` \| `"uppercase"` \| `"lowercase"`         |
| `textUnderline`     | string \| undefined         | 下划线，格式见第 10 节                                         |
| `textStrikethrough` | string \| undefined         | 删除线，格式同上                                               |
| `alignment`         | string                      | 水平对齐：`"left"` \| `"right"` \| `"center"` \| `"justified"` |
| `verticalAlignment` | string                      | 垂直对齐：`"top"` \| `"center"` \| `"bottom"`                  |
| `fontAxes`          | object \| null              | 可变字体轴，非可变字体为 `null`                                |
| `sharedStyleName`   | string \| null              | 关联共享样式名                                                 |

```json
{
  "type": "Text",
  "id": "...",
  "name": "label",
  "text": "Hello",
  "frame": { "x": 0, "y": 0, "width": 67, "height": 22 },
  "hidden": false,
  "locked": false,
  "sharedStyleId": null,
  "style": {
    "opacity": 1,
    "blendingMode": "Normal",
    "styleType": "Text",
    "textColor": "#000000ff",
    "textColorName": null,
    "fontSize": 16,
    "fontFamily": "PingFang SC",
    "fontWeight": 5,
    "fontStyle": null,
    "fontVariant": null,
    "fontStretch": null,
    "lineHeight": null,
    "kerning": null,
    "paragraphSpacing": 0,
    "textTransform": "none",
    "textUnderline": null,
    "textStrikethrough": null,
    "alignment": "left",
    "verticalAlignment": "top",
    "fontAxes": null,
    "sharedStyleName": null
  }
}
```

---

## 5. Image 专属字段

`type === "Image"` 时额外包含：

| 字段           | 类型   | 说明                  |
| -------------- | ------ | --------------------- |
| `image`        | object | 图片数据              |
| `image.base64` | string | base64 编码的图片内容 |

```json
{
  "type": "Image",
  "id": "...",
  "name": "photo",
  "frame": { "x": 0, "y": 0, "width": 200, "height": 200 },
  "image": { "base64": "iVBORw0KGgo..." }
}
```

---

## 6. SymbolInstance 专属字段

`type === "SymbolInstance"` 时额外包含：

| 字段        | 类型   | 说明                    |
| ----------- | ------ | ----------------------- |
| `symbolId`  | string | 对应 SymbolMaster 的 ID |
| `overrides` | array  | Override 列表，见下     |

### overrides[]

| 字段            | 类型    | 说明                                      |
| --------------- | ------- | ----------------------------------------- |
| `path`          | string  | Override 路径，格式：`SYMBOL-ID/LAYER-ID` |
| `property`      | string  | Override 属性类型，见下表                 |
| `value`         | any     | 当前覆盖值                                |
| `defaultValue`  | any     | 未覆盖时的默认值                          |
| `isDefault`     | boolean | 是否未被覆盖（使用默认值）                |
| `colorOverride` | boolean | 是否为颜色类 override                     |

**`property` 枚举：**

| 值                      | 说明                                                     |
| ----------------------- | -------------------------------------------------------- |
| `stringValue`           | 文本内容                                                 |
| `symbolID`              | 嵌套 Symbol 替换                                         |
| `image`                 | 图片替换                                                 |
| `layerStyle`            | 图层样式 ID                                              |
| `textStyle`             | 文字样式 ID                                              |
| `textColor`             | 文字颜色                                                 |
| `textSize`              | 文字大小（string 类型传值）                              |
| `textDecoration`        | 文字装饰：`"none"` \| `"underline"` \| `"strikethrough"` |
| `textHAlign`            | 文字水平对齐                                             |
| `isVisible`             | 显隐                                                     |
| `fillColor`             | Group / Frame tint 颜色                                  |
| `color:fill-{n}`        | 第 n 个填充的颜色（n 从 0 起）                           |
| `color:border-{n}`      | 第 n 个描边的颜色                                        |
| `color:shadow-{n}`      | 第 n 个阴影的颜色                                        |
| `color:innershadow-{n}` | 第 n 个内阴影的颜色                                      |
| `horizontalSizing`      | 水平尺寸模式                                             |
| `verticalSizing`        | 垂直尺寸模式                                             |

```json
{
  "type": "SymbolInstance",
  "id": "...",
  "name": "Button/Primary",
  "symbolId": "MASTER-UUID",
  "overrides": [
    {
      "path": "MASTER-UUID/TEXT-LAYER-UUID",
      "property": "stringValue",
      "value": "Click me",
      "defaultValue": "Button",
      "isDefault": false,
      "colorOverride": false
    }
  ]
}
```

---

## 7. exportFormats

| 字段         | 类型   | 说明                                                            |
| ------------ | ------ | --------------------------------------------------------------- |
| `fileFormat` | string | `"png"` \| `"jpg"` \| `"svg"` \| `"pdf"` \| `"eps"` \| `"webp"` |
| `size`       | string | 倍率如 `"1x"` `"2x"`，或固定尺寸如 `"100w"` `"200h"`            |
| `suffix`     | string | 文件名后缀，如 `"@2x"`                                          |
| `prefix`     | string | 文件名前缀                                                      |
| `name`       | string | 自定义文件名（覆盖图层名）                                      |

```json
"exportFormats": [
  { "fileFormat": "png", "size": "1x", "suffix": "" },
  { "fileFormat": "png", "size": "2x", "suffix": "@2x" },
  { "fileFormat": "svg", "size": "1x", "suffix": "" }
]
```

---

## 8. flow（Prototype）

图层设置了 Prototype 跳转时存在，未设置则为 `undefined`。

| 字段                | 类型               | 说明                                 |
| ------------------- | ------------------ | ------------------------------------ |
| `targetId`          | string \| `"back"` | 目标图层 ID；`"back"` 表示返回上一页 |
| `animationType`     | string             | 动画类型，见下表                     |
| `animationDuration` | number             | 动画时长（秒）                       |

**`animationType` 枚举：**

| 值                | 说明     |
| ----------------- | -------- |
| `none`            | 无动画   |
| `slideFromRight`  | 从右滑入 |
| `slideFromLeft`   | 从左滑入 |
| `slideFromBottom` | 从下滑入 |
| `slideFromTop`    | 从上滑入 |

```json
"flow": {
  "targetId": "FRAME-UUID",
  "animationType": "slideFromRight",
  "animationDuration": 0.3
}
```

---

## 9. style

所有图层共享的样式对象。

| 字段               | 类型                | 说明                          |
| ------------------ | ------------------- | ----------------------------- |
| `id`               | string              | 样式 ID                       |
| `type`             | `"Style"`           | 固定值                        |
| `styleType`        | string              | `"Layer"` \| `"Text"`         |
| `opacity`          | number              | 不透明度 `0~1`                |
| `blendingMode`     | string              | 混合模式，见第 10 节          |
| `fills`            | array               | 填充列表，见 9.1              |
| `borders`          | array               | 描边列表，见 9.2              |
| `shadows`          | array               | 外阴影列表，见 9.3            |
| `innerShadows`     | array               | 内阴影列表，见 9.3            |
| `blurs`            | array               | 模糊列表（0 或 1 项），见 9.4 |
| `corners`          | object              | 圆角配置，见 9.5              |
| `borderOptions`    | object              | 描边线型，见 9.6              |
| `progressiveAlpha` | object \| undefined | 渐进透明度，见 9.7            |
| `tint`             | object \| undefined | Group/Frame 整体着色，见 9.8  |
| `fontAxes`         | object \| null      | 可变字体轴（Text 专属）       |

---

### 9.1 fills

| 字段           | 类型    | 说明                                            |
| -------------- | ------- | ----------------------------------------------- |
| `fillType`     | string  | `"Color"` \| `"Gradient"` \| `"Pattern"`        |
| `color`        | string  | 纯色（`#rrggbbaa`），仅 `fillType=Color` 时有效 |
| `gradient`     | object  | 渐变配置，仅 `fillType=Gradient` 时有效         |
| `pattern`      | object  | 图片填充，仅 `fillType=Pattern` 时有效          |
| `enabled`      | boolean | 是否启用，`false` 时跳过                        |
| `blendingMode` | string  | 混合模式                                        |

> ⚠️ 无论 `fillType` 是什么，`color` / `gradient` / `pattern` 三个字段始终存在。解析时**以 `fillType` 为准**决定读哪个字段，其余忽略。

**gradient 结构：**

```json
{
  "gradientType": "Linear",
  "from": { "x": 0.5, "y": 0 },
  "to": { "x": 0.5, "y": 1 },
  "aspectRatio": 0,
  "stops": [
    { "position": 0, "color": "#000000ff" },
    { "position": 1, "color": "#ffffffff" }
  ]
}
```

**pattern 结构：**

```json
{
  "patternType": "Fill",
  "image": null,
  "tileScale": 1
}
```

**完整示例：**

```json
[
  {
    "fillType": "Color",
    "color": "#ffffffff",
    "enabled": true,
    "blendingMode": "Normal",
    "gradient": {
      "gradientType": "Linear",
      "from": { "x": 0.5, "y": 0 },
      "to": { "x": 0.5, "y": 1 },
      "aspectRatio": 0,
      "stops": [
        { "position": 0, "color": "#ffffffff" },
        { "position": 1, "color": "#000000ff" }
      ]
    },
    "pattern": { "patternType": "Fill", "image": null, "tileScale": 1 }
  },
  {
    "fillType": "Gradient",
    "color": "#ffffffff",
    "enabled": true,
    "blendingMode": "Normal",
    "gradient": {
      "gradientType": "Linear",
      "from": { "x": 0.5, "y": 0 },
      "to": { "x": 0.5, "y": 1 },
      "aspectRatio": 0,
      "stops": [
        { "position": 0, "color": "#000000ff" },
        { "position": 1, "color": "#ffffffff" }
      ]
    },
    "pattern": { "patternType": "Fill", "image": null, "tileScale": 1 }
  }
]
```

---

### 9.2 borders

| 字段                 | 类型    | 说明                                                                                              |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `fillType`           | string  | `"Color"` \| `"Gradient"`                                                                         |
| `position`           | string  | `"Inside"` \| `"Outside"` \| `"Center"`                                                           |
| `color`              | string  | 纯色，仅 `fillType=Color` 时有效；`fillType=Gradient` 时为占位值（通常 `#979797ff`），**忽略**    |
| `gradient`           | object  | 渐变配置，结构同 fills.gradient                                                                   |
| `thickness`          | number  | 描边宽度（px）                                                                                    |
| `enabled`            | boolean | 是否启用                                                                                          |
| `blendingMode`       | string  | 混合模式                                                                                          |
| `hasIndividualSides` | boolean | 是否单独控制四边                                                                                  |
| `sides`              | object  | 各边开关：`{ left, top, right, bottom }`，值 `1`=显示 `0`=隐藏，`hasIndividualSides=false` 时忽略 |

**完整示例：**

```json
[
  {
    "fillType": "Color",
    "position": "Inside",
    "color": "#ff2f2fff",
    "thickness": 1,
    "enabled": true,
    "blendingMode": "Normal",
    "hasIndividualSides": false,
    "sides": { "left": 1, "top": 1, "right": 1, "bottom": 1 },
    "gradient": {
      "gradientType": "Linear",
      "from": { "x": 0.5, "y": 0 },
      "to": { "x": 0.5, "y": 1 },
      "aspectRatio": 0,
      "stops": [
        { "position": 0, "color": "#ffffffff" },
        { "position": 1, "color": "#000000ff" }
      ]
    }
  },
  {
    "fillType": "Gradient",
    "position": "Center",
    "color": "#979797ff",
    "thickness": 1,
    "enabled": true,
    "blendingMode": "Normal",
    "hasIndividualSides": false,
    "sides": { "left": 1, "top": 1, "right": 1, "bottom": 1 },
    "gradient": {
      "gradientType": "Linear",
      "from": { "x": 0.5, "y": 0 },
      "to": { "x": 0.5, "y": 1 },
      "aspectRatio": 0,
      "stops": [
        { "position": 0, "color": "#c8c8c8ff" },
        { "position": 1, "color": "#727272ff" }
      ]
    }
  },
  {
    "fillType": "Color",
    "position": "Outside",
    "color": "#e9ff52ff",
    "thickness": 1,
    "enabled": true,
    "blendingMode": "Normal",
    "hasIndividualSides": false,
    "sides": { "left": 1, "top": 1, "right": 1, "bottom": 1 },
    "gradient": { "...": "同上结构" }
  }
]
```

---

### 9.3 shadows / innerShadows

两个数组结构相同，通过 `isInnerShadow` 区分。

| 字段            | 类型    | 说明                          |
| --------------- | ------- | ----------------------------- |
| `x`             | number  | 水平偏移                      |
| `y`             | number  | 垂直偏移                      |
| `blur`          | number  | 模糊半径                      |
| `spread`        | number  | 扩展大小                      |
| `color`         | string  | 阴影颜色（`#rrggbbaa`）       |
| `enabled`       | boolean | 是否启用                      |
| `isInnerShadow` | boolean | `false`=外阴影，`true`=内阴影 |
| `blendingMode`  | string  | 混合模式                      |

```json
[
  {
    "x": 0,
    "y": 4,
    "blur": 8,
    "spread": 0,
    "color": "#00000040",
    "enabled": true,
    "isInnerShadow": false,
    "blendingMode": "Normal"
  },
  {
    "x": 0,
    "y": 1,
    "blur": 2,
    "spread": 0,
    "color": "#00000040",
    "enabled": true,
    "isInnerShadow": true,
    "blendingMode": "Normal"
  }
]
```

---

### 9.4 blurs

数组含 **0 或 1 项**。

| 字段                    | 类型    | 说明                                                     |
| ----------------------- | ------- | -------------------------------------------------------- |
| `blurType`              | string  | `"Gaussian"` \| `"Motion"` \| `"Zoom"` \| `"Background"` |
| `radius`                | number  | 模糊半径                                                 |
| `enabled`               | boolean | 是否启用                                                 |
| `motionAngle`           | number  | 运动角度，`Motion` 类型使用                              |
| `center`                | object  | 模糊中心 `{ x, y }`，`Zoom` 类型使用                     |
| `saturation`            | number  | 饱和度，`Background` 类型使用                            |
| `brightness`            | number  | 亮度，`Background` 类型使用                              |
| `progressive`           | boolean | 是否渐进模糊                                             |
| `isCustomGlass`         | boolean | 是否自定义毛玻璃                                         |
| `distortion`            | number  | 扭曲度                                                   |
| `depth`                 | number  | 深度                                                     |
| `chromaticAberration`   | number  | 色差                                                     |
| `hasSpecularHighlights` | boolean | 是否有高光                                               |

```json
// Gaussian
{ "blurType": "Gaussian", "radius": 10, "enabled": true, "center": { "x": 0.5, "y": 0.5 }, "motionAngle": 0, "saturation": 1, "progressive": false, "isCustomGlass": true, "brightness": 1, "distortion": 0.5, "depth": 0.5, "chromaticAberration": 0, "hasSpecularHighlights": true }

// Background（毛玻璃）
{ "blurType": "Background", "radius": 10, "enabled": true }
```

---

### 9.5 corners

| 字段         | 类型     | 说明                                            |
| ------------ | -------- | ----------------------------------------------- |
| `style`      | number   | `0`=Round `1`=Smooth（iOS 平滑圆角）            |
| `radii`      | number[] | 四角半径，顺时针：`[左上, 右上, 右下, 左下]`    |
| `hasRadii`   | boolean  | 是否有非零圆角                                  |
| `concentric` | boolean  | 是否同心圆角（跟随父 Frame 曲率）               |
| `smoothing`  | number   | 平滑系数，`style=1` 时生效，`0.6` 为 iOS 标准值 |

```json
{
  "style": 0,
  "radii": [8, 8, 8, 8],
  "hasRadii": true,
  "concentric": false,
  "smoothing": 0.6
}
```

---

### 9.6 borderOptions

控制描边线型，主要作用于路径 / 形状图层。

| 字段             | 类型     | 说明                                      |
| ---------------- | -------- | ----------------------------------------- |
| `lineEnd`        | string   | 线端：`"Butt"` \| `"Round"` \| `"Square"` |
| `lineJoin`       | string   | 转角：`"Miter"` \| `"Round"` \| `"Bevel"` |
| `dashPattern`    | number[] | 虚线间隔，空数组=实线，如 `[4, 2]`        |
| `startArrowhead` | string   | 起点箭头，见第 10 节                      |
| `endArrowhead`   | string   | 终点箭头，见第 10 节                      |

```json
{
  "lineEnd": "Butt",
  "lineJoin": "Miter",
  "dashPattern": [],
  "startArrowhead": "None",
  "endArrowhead": "None"
}
```

---

### 9.7 progressiveAlpha

图层的渐进透明度（渐变遮罩），结构与 `gradient` 相同，未设置时为 `undefined`。

```json
{
  "gradientType": "Linear",
  "from": { "x": 0.5, "y": 0 },
  "to": { "x": 0.5, "y": 1 },
  "aspectRatio": 0,
  "stops": [
    { "position": 0, "color": "#000000ff" },
    { "position": 1, "color": "#00000000" }
  ]
}
```

---

### 9.8 tint

Group / Frame / Graphic 的整体着色，结构同单个 fill 对象，未设置时为 `undefined`。

```json
{
  "fillType": "Color",
  "color": "#FFA500ff",
  "enabled": true,
  "blendingMode": "Normal"
}
```

---

## 10. 枚举速查

### blendingMode

| 值            | 中文     | 值           | 中文   |
| ------------- | -------- | ------------ | ------ |
| `Normal`      | 正常     | `Overlay`    | 叠加   |
| `Darken`      | 变暗     | `SoftLight`  | 柔光   |
| `Multiply`    | 正片叠底 | `HardLight`  | 强光   |
| `ColorBurn`   | 颜色加深 | `Difference` | 差值   |
| `Lighten`     | 变亮     | `Exclusion`  | 排除   |
| `Screen`      | 滤色     | `Hue`        | 色相   |
| `ColorDodge`  | 颜色减淡 | `Saturation` | 饱和度 |
| `PlusDarker`  | 加深     | `Color`      | 颜色   |
| `PlusLighter` | 减淡     | `Luminosity` | 明度   |

### gradient.gradientType

| 值        | 含义     |
| --------- | -------- |
| `Linear`  | 线性渐变 |
| `Radial`  | 径向渐变 |
| `Angular` | 角度渐变 |

### pattern.patternType

| 值        | 含义     |
| --------- | -------- |
| `Tile`    | 平铺     |
| `Fill`    | 拉伸填满 |
| `Stretch` | 拉伸     |
| `Fit`     | 等比适应 |

### fontWeight（0~12）

| Sketch 值 | CSS weight | 字重名     |
| --------- | ---------- | ---------- |
| `0`       | 100        | Thin       |
| `1~2`     | 200        | ExtraLight |
| `3`       | 300        | Light      |
| `4~5`     | 400        | Regular    |
| `6`       | 500        | Medium     |
| `7`       | 600        | SemiBold   |
| `8`       | 700        | Bold       |
| `9~10`    | 800        | ExtraBold  |
| `11~12`   | 900        | Black      |

> 并非所有字重对所有字体都可用，设置不存在的字重时自动取最近值。

### fontStretch

| 值             | 含义 |
| -------------- | ---- |
| `"compressed"` | 极窄 |
| `"condensed"`  | 窄   |
| `"narrow"`     | 较窄 |
| `undefined`    | 正常 |
| `"expanded"`   | 宽   |
| `"poster"`     | 极宽 |

### textUnderline / textStrikethrough

格式：`"<line-style> [<line-pattern>] [by-word]"`

- `line-style`：`single` / `thick` / `double`
- `line-pattern`（可选）：`dot` / `dash` / `dash-dot` / `dash-dot-dot`
- `by-word`（可选）：仅装饰单词，跳过空格

示例：`"single"` / `"double dash-dot"` / `"single dot by-word"`

### borderOptions.lineEnd

| 值       | 含义 |
| -------- | ---- |
| `Butt`   | 平头 |
| `Round`  | 圆头 |
| `Square` | 方头 |

### borderOptions.lineJoin

| 值      | 含义 |
| ------- | ---- |
| `Miter` | 尖角 |
| `Round` | 圆角 |
| `Bevel` | 斜角 |

### borderOptions.startArrowhead / endArrowhead

| 值             | 含义     |
| -------------- | -------- |
| `None`         | 无       |
| `OpenArrow`    | 开放箭头 |
| `FilledArrow`  | 实心箭头 |
| `Line`         | 竖线     |
| `OpenCircle`   | 空心圆   |
| `FilledCircle` | 实心圆   |
| `OpenSquare`   | 空心方块 |
| `FilledSquare` | 实心方块 |
