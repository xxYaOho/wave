---
class: material
ingested: true
metadata: ~
---

# DTCG 标准类型端到端支持设计

日期：2026-07-29

## 目标

Wave 应完整识别 DTCG Format Module 2025.10 定义的标准 token 类型，验证标准值，并为 JSON、JSONC、CSS 和 Sketch 提供明确输出。任何复合值都必须经过专用 formatter 或明确失败，不能再由通用字符串转换生成 `[object Object]`。

本次同时修复 Orca 中误写的 `stockStyle`，将其完整边框值改为 `$type: border`，并补齐标准 stroke style 的 `lineCap`。

## 设计原则

1. DTCG `$type` 合同、Wave `theme.*` 用途分类和 generator 平台过滤互相独立。本次只修改类型系统及其平台投影。
2. 标准类型使用标准值合同。Wave 已有的平台能力作为明确扩展保留，不冒充 DTCG 标准或文件级 conformance。
3. transformer 保留类型语义和单位信息。CSS、JSON、JSONC、Sketch 各自决定单位默认值和最终表示。
4. schema 是输入合同的主防线，formatter 是损坏产物的最后防线。
5. 不通过别名长期兼容拼写错误；`stockStyle` 不注册为类型或 legacy alias。

## 范围

### 本次包含

- 补齐 DTCG 2025.10 标准类型的 schema、transformer 和 formatter 合同。
- 移除没有真实 consumer 的 `$type: opacity` 声明和文档。
- 支持 standalone `strokeStyle`，并让 `border.style` 复用同一值合同。
- 为 CSS 复合类型增加专用 formatter 和 object 泄漏防线。
- 迁移 Orca 的 `main.yaml`、`profiles/viz-jzy.yaml`、`profiles/example_viz.yaml`。
- 更新 fixtures、测试、内部 SPEC 和用户手册。

### 本次不包含

- 不修改 `theme.*` taxonomy。
- 不新增 `theme.motion` 或其他 public root。
- 不修改 `includeRootKeys` 或 `$config`。
- 不移除 Wave extensions，例如 `smoothShadow`、`smoothGradient`、`inheritColor`、`sketch`、`outline` 和 typography defaults。
- 不把整个多-pass build 改造成文件系统事务。

## 标准类型矩阵

Wave 支持以下 DTCG 标准类型：

| `$type` | 标准值合同 | Wave 输出责任 |
| --- | --- | --- |
| `color` | `{ colorSpace, components, alpha?, hex? }` | 验证 Color Module 2025.10；按目标色彩空间输出 |
| `dimension` | `{ value: number, unit: "px" | "rem" }` | formatter 根据平台输出单位值 |
| `fontFamily` | string 或 string array | CSS font stack；JSON/Sketch 保留字体列表语义 |
| `fontWeight` | `1..1000`，或标准命名 weight | CSS 使用可用数值；JSON/Sketch 使用规范化数值 |
| `duration` | `{ value: number, unit: "ms" | "s" }` | CSS/JSON 输出带单位字符串；Sketch 保留明确单位 |
| `cubicBezier` | 四个 number；两个 x 坐标位于 `[0, 1]` | CSS 输出 `cubic-bezier(...)`；JSON/Sketch 保留数组 |
| `number` | 有限 JSON number | 各平台输出 number |
| `strokeStyle` | 标准字符串，或 `{ dashArray, lineCap }` | CSS 输出 fallback 和 companion；JSON/Sketch 保留结构 |
| `border` | `{ color, width, style }` | 复用 color、dimension、strokeStyle 合同 |
| `transition` | `{ duration, delay, timingFunction }` | 复用 duration 和 cubicBezier 合同 |
| `shadow` | 单层 shadow，或 shadow object/reference 数组 | 验证并投影全部标准字段 |
| `gradient` | gradient stop object/reference 数组 | clamp position 后投影 |
| `typography` | `{ fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }` | 标准值验证后应用现有平台投影 |

`opacity` 不属于该标准类型集合。仓库和 Orca 没有 `$type: opacity` consumer，因此从已知类型和用户文档中移除。`inheritColor.opacity` 与 `sketch.property.opacity` 是扩展字段，不受影响。

标准 `typography` 仍按 DTCG composite 校验。Wave 另保留三项明确扩展：`$extensions.typography` 的 authoring defaults/baseFontSize、materialized value 的 optional `color`，以及带单位 `lineHeight`。这些能力属于 Wave 方言，不改写 DTCG 标准 typography 的五字段合同。

## DTCG 兼容边界

本次目标是支持 DTCG 2025.10 的全部标准类型和值合同，不宣称 Wave 输入文件完全符合 DTCG。curly complete-token reference、JSON Pointer `$ref` 和 `$extensions` 容器均属于标准；Wave 方言额外保留 dimension 简写、未知自定义类型 warning 和现有 vendor extension 内容。标准 `$type` 一旦出现，其显式值和 composite 子值必须满足 DTCG 合同；只有本设计逐项列出的 Wave 方言例外可以扩展输入形式，且不放宽其余标准字段、引用类型或额外属性规则。

DTCG 标准路径要求 token 具有可确定的 effective type：来自 token `$type`、最近父 group `$type`，或完整 token alias 的目标类型。Wave 既有无类型兼容行为不在本次裁剪范围内，但不计入标准兼容 fixture。

## 标准值合同

### Color

标准 color value 必须包含 `colorSpace` 和对应长度的 `components`；`alpha` 与 6 位 `hex` 可选。component 可以是该色彩空间允许范围内的 number，也可以是字符串 `"none"`；省略 `alpha` 等价于 `1`。schema 必须按 Color Module 2025.10 支持的色彩空间、component 数量与范围校验，不能要求 `hex` 存在，也不能在 schema 阶段因 `"none"` 拒绝合法输入。

transformer 保留 `"none"` 和可选 fallback。配置的输出 `colorSpace` 能表达或转换源色彩空间时直接投影；目标为 `hex` 或 Sketch 且 `"none"` 无法计算时，使用合法 `hex` fallback。没有 fallback 时 CSS/Sketch 明确失败，错误包含 token path、输出格式、目标 colorSpace 和不可转换原因；JSON/JSONC 保留标准 object。不能把标准合法输入误报为 schema error。

### Primitive 与时间

- `fontFamily` 按标准接受 string 或 string array；schema 不增加标准未规定的非空限制。无法形成有效 font stack 的值由对应平台 formatter 明确失败。
- `fontWeight` 接受 `1..1000`，或大小写敏感的标准名称；名称按官方映射规范化为 `100`、`200`、`300`、`400`、`500`、`600`、`700`、`800`、`900`、`950`。其中包含 `hairline`、`book`、`demi-bold`、`extra-black` 等全部别名。
- `duration` 只接受 finite number 与 `ms | s` 的 object；不复用 length 单位。
- `cubicBezier` 接受四个 finite number，第一、第三项位于 `[0, 1]`，y 坐标不额外限幅。
- `number` 接受 finite JSON number。

### Composite

所有标准 composite 都是 closed shape：必须字段齐全，除标准列出的 optional 字段外，额外属性一律报错。

- `border`：必需 `color`、`width`、`style`，分别使用 color、dimension、strokeStyle 合同。
- `transition`：必需 `duration`、`delay`、`timingFunction`，分别使用 duration、duration、cubicBezier 合同。
- `shadow`：单个 object 或 object/reference array；每层必需 `color`、`offsetX`、`offsetY`、`blur`、`spread`，可选 `inset: boolean`。
- `gradient`：stop object/reference array；每个 stop 只含 `color` 和 `position`。position 使用 number 合同，解析后小于 `0` 的值归一化为 `0`，大于 `1` 的值归一化为 `1`，不能拒绝或直接乘成百分比。数组引用按 DTCG 保持单元素解析语义，不展开或 flatten。
- `typography`：标准值必需 `fontFamily`、`fontSize`、`fontWeight`、`letterSpacing`、`lineHeight`；前四项分别使用 fontFamily、dimension、fontWeight、dimension 合同，标准 `lineHeight` 必须是 number。Wave 方言额外允许 optional `color`，并允许 `lineHeight` 使用现有 `px | pt | rem` dimension；其余 authored extra property 仍报错。defaults materialize 后必须补齐五个标准字段，可附带合法 `color`。

shadow 与 gradient 数组中的 composite reference 不展开数组。实现必须保留足够的引用 provenance，以便在 resolved validation 中区分合法的单元素引用和会形成嵌套数组的非法结果。

## Dimension 合同

### 标准输入

标准 DTCG dimension 保持原样接受：

```yaml
$type: dimension
$value:
  value: 8
  unit: px
```

标准单位为 `px` 和 `rem`。

### Wave 平台扩展

Wave 继续接受以下 dimension 简写：

- finite number；
- 十进制 numeric string；
- 带 `px`、`rem`、`pt`、`em`、`%` 的 length string；
- `{ value }`；
- `{ value, unit }`，其中扩展单位为 `pt`、`em`、`%`。

这些形式是 Wave 输入能力，不是 DTCG 标准 dimension。standalone dimension 及 border、strokeStyle、shadow、typography 中所有 dimension 子值使用同一扩展输入合同。无单位值由输出平台补全；CSS、JSON 和 JSONC 默认使用 `px`。

示例：

```text
8                                  -> JSON/JSONC "8px"
{ value: 8, unit: "px" }           -> JSON/JSONC "8px"
{ value: 0.5, unit: "rem" }        -> JSON/JSONC "0.5rem"
```

Sketch 需要数值属性时按现有 Sketch 投影规则输出数值；普通结构化值保留明确单位。typography 的 `rem` 继续使用明确的 baseFontSize 转换；Wave lineHeight extension 维持现有 `px | pt | rem` 合同，不扩展到 `em | %`。其他无法由 Sketch 表达的 `em | rem | %` 必须平台失败，不能静默改写成错误的绝对值。

同一 dimension parser 和 validator 应供 standalone dimension、border width、strokeStyle dashArray、shadow 尺寸字段，以及 typography 的 `fontSize`、`letterSpacing` 使用，并在这些位置统一允许上述 Wave 扩展。typography `lineHeight` 先接受标准 number，再走独立的现有 `px | pt | rem` 扩展策略。duration 使用独立的时间 parser 和 validator，并由 transition 的 `duration`、`delay` 字段复用。

## Stroke Style 与 Border

### Stroke style

标准字符串值为 `solid`、`dashed`、`dotted`、`double`、`groove`、`ridge`、`outset` 和 `inset`。object 值必须同时包含：

```yaml
$type: strokeStyle
$value:
  dashArray:
    - value: 4
      unit: px
    - value: 8
      unit: px
  lineCap: butt
```

`lineCap` 只接受 `round`、`butt`、`square`。`dashArray` 成员接受标准 dimension 或 Wave dimension 扩展。schema 不增加 DTCG 未规定的正负或全零限制；若目标平台不能表示某个合法值，由该 formatter 返回平台错误。

奇数长度的 dashArray 按 DTCG 语义重复一次，transformer 统一物化为偶数数组；JSON、JSONC、CSS 和 Sketch 均输出物化后的数组，避免平台之间解释不同。

### Border

border 必须包含 `color`、`width` 和 `style`，且拒绝额外字段。`style` 可以是内联 stroke style value，也可以引用 standalone `strokeStyle` token。raw schema 允许引用占位，resolved schema 同时校验引用目标类型与最终值。

Wave 不再用 formatter 默认值掩盖缺失字段：缺少 width 不输出 `undefined`，缺少 color 不自动变为 `currentColor`。

Orca 的 antline 使用完整 border composite，因此迁移为：

```yaml
$type: border
$value:
  color: "{theme.color.border.default}"
  width: "{theme.border.width.sm}"
  style:
    dashArray:
      - value: 4
        unit: px
      - value: 8
        unit: px
    lineCap: butt
```

## 平台输出

### JSON 与 JSONC

JSON 和 JSONC 是 flat platform output，不复制 source token wrapper。所有 dimension 子值保留单位字符串，shadow 不再把 `0px` 特判为裸 `0`。以下表格是必须锁定的输出 shape：

| 类型 | 输出示例 |
| --- | --- |
| `color` | 可转换时输出配置 `colorSpace` 的规范化字符串；含 `"none"` 且无法跨空间转换、又无 `hex` fallback 时，保留清理后的标准 DTCG color object |
| `dimension` | `"8px"` |
| `fontFamily` | `"Inter"` 或 `["Inter", "sans-serif"]` |
| `fontWeight` | `700` |
| `duration` | `"200ms"` |
| `cubicBezier` | `[0.4, 0, 0.2, 1]` |
| `number` | `0.5` |
| `strokeStyle` | `{ "dashArray": ["4px", "8px"], "lineCap": "butt" }` |
| `border` | `{ "color": "#000000", "width": "1px", "style": { ... } }` |
| `transition` | `{ "duration": "200ms", "delay": "0ms", "timingFunction": [0.4, 0, 0.2, 1] }` |
| `shadow` | `{ "color": "#00000080", "offsetX": "0px", "offsetY": "4px", "blur": "8px", "spread": "0px", "inset": false }`；多层时为数组 |
| `gradient` | `[{ "color": "#000000", "position": 0 }, { "color": "#ffffff", "position": 1 }]` |
| `typography` | `{ "fontFamily": "Inter", "fontSize": "16px", "fontWeight": 400, "letterSpacing": "0px", "lineHeight": 1.5 }`；Wave `color` 存在时保留为目标颜色值 |

color string 的序列化由配置的输出 `colorSpace` 唯一决定：`hex` 使用 `#rrggbb`，alpha 小于 `1` 时使用 `#rrggbbaa`；`oklch`、`srgb`、`hsl` 分别使用 Wave 现有 canonical `oklch(...)`、`rgb(...)`、`hsl(...)` 语法与舍入规则。含 `"none"` 且不能转换、又没有 `hex` fallback 时，JSON/JSONC 输出只含标准字段的 `{ colorSpace, components, alpha?, hex? }`，不得附带内部 metadata。每个分支都用精确 snapshot 锁定。

同一 color 规则递归适用于 border、shadow、gradient 和 Wave typography `color` 子值：JSON/JSONC 在不可转换且无 fallback 时把该 color slot 保留为清理后的 DTCG object，composite 其余结构不变；CSS 能构造标准 CSS Color 4 表达式时直接使用，否则平台失败；Sketch 仍要求可转换值或合法 hex fallback。

### CSS

CSS 使用以下明确投影：

```text
number       -> 0.5
fontWeight   -> 700
duration     -> 200ms
cubicBezier  -> cubic-bezier(0.4, 0, 0.2, 1)
```

fontFamily array 按 CSS font-family 语法连接。generic family keyword 保持不加引号；其他 family 对引号和反斜杠做 CSS escaping，并在包含空白或 CSS 特殊字符时加引号。空 string 或空 array 无法形成有效 CSS value 时明确失败。

stroke style object 输出：

```css
--border-antline-style: dashed;
--border-antline-style-dash-array: 4px 8px;
--border-antline-style-line-cap: butt;
```

含 object style 的 border 输出：

```css
--border-antline: 1px dashed #000000;
--border-antline-dash-array: 4px 8px;
--border-antline-line-cap: butt;
```

transition 输出可直接作为 CSS transition value 使用：

```css
--transition-emphasis: 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
```

现有 composite formatter 同步收紧：shadow 按 `inset? offsetX offsetY blur spread color` 输出并保留 optional `inset`；gradient 使用 clamp 后的 position 生成百分比；typography 继续输出现有 font companions，但输入必须先通过标准字段加明确 Wave extension 的 materialized composite 校验。

CSS 字段级平台限制固定如下：border width、transition duration、shadow blur、typography fontSize 和 typography lineHeight 必须为非负可表达值；transition delay、shadow offset/spread 和 letterSpacing 可为负；object strokeStyle 的负 dash value 在 CSS 平台失败。标准 schema 仍接受 DTCG 允许的 number/dimension，限制只在消费这些字段的 CSS formatter 生效。

gradient 语义归一化在 transformer 完成：先 clamp position；若缺少 position `0` 或 `1`，使用最近端点颜色补出派生 stop。单 stop gradient 因而物化为同色的 `0`、`1` 两个 stop，CSS 始终得到合法的至少双 stop gradient；JSON、JSONC 与 Sketch 输出同一物化结果。

standalone strokeStyle object 的碰撞集合为主变量、`-dash-array`、`-line-cap`；border object 的碰撞集合为主变量、`-dash-array`、`-line-cap`。所有 companion variable 都参与真实 token key collision 检查。CSS formatter 的通用 fallback 只接受 scalar；object 或 array 必须由专用 formatter 消费，否则构建失败。错误包含 token path、type 和 value shape。

### Sketch

Sketch 输出使用以下固定 payload shape；没有原生语义的类型放在 `{ value }` 中，不伪装成其他 Sketch style：

| 类型 | Sketch payload |
| --- | --- |
| `color` | `{ "color": "#rrggbbaa" }`；已有可发射 color reference 时保留 `@/path` |
| generic `dimension` | `{ "value": "8px" }`；映射到 corner/radius 等原生数值属性时输出 number |
| `fontFamily` / `fontWeight` / `duration` / `cubicBezier` / `number` | `{ "value": <与 JSON 相同的规范化值> }` |
| `strokeStyle` | `{ "value": { "dashArray": ["4px", "8px"], "lineCap": "butt" } }` |
| `border` | `{ "value": { "color": "#rrggbbaa" 或 "@/path", "width": "1px", "style": <规范化 strokeStyle> } }` |
| `transition` | `{ "value": { "duration": "200ms", "delay": "0ms", "timingFunction": [0.4, 0, 0.2, 1] } }` |
| `shadow` | `{ "shadow": [{ "x": 0, "y": 4, "blur": 8, "spread": 0, "color": "#rrggbbaa", "inset": false }] }` |
| `gradient` | `{ "gradient": [{ "color": "#rrggbbaa", "position": 0 }, { "color": "#rrggbbaa", "position": 1 }] }`；缺失端点已在 transformer 物化 |
| `typography` | 现有 `{ "textStyle": { "fontFamily", "fontSize", "fontWeight", "lineHeight", "kerning", "textColor"? } }` |

Sketch 原生 number 属性只接受可无损投影的单位；typography `rem` 按 baseFontSize 转换。其余不可表达单位明确失败。`lineCap`、`dashArray` 和 shadow `inset` 必须保留，不能套用 CSS fallback。新增 generic structured payload 只承诺 Wave generator 合同；下游 Sync Token 是否消费这些类型需另做 consumer 任务，不在本次伪装为已验证。

## 未知自定义类型

Wave 保留自定义类型的扩展能力：

- schema 对未知 `$type` 产生 warning；
- JSON/JSONC 保留其值；
- CSS 可输出 scalar；
- CSS 遇到 object 或 array 明确失败；
- Sketch 可保留的值输出 `{ value: ... }`。

只有本设计列出的 DTCG 标准类型承诺严格值校验和专用 formatter。未知类型不能借通用转换伪装成已支持类型。

## 架构职责

### Schema

- 维护唯一的标准类型集合。
- 为 primitive、dimension-like 和 composite values 提供可复用 validator。
- raw phase 接受合法引用占位；resolved phase 同时校验引用目标类型、数组解析语义和最终值。
- curly complete-token reference 必须指向 expected effective type 的 token；whole-token alias 可从目标继承 type。JSON Pointer 指向完整 token 时遵循同样的类型检查，指向 property-level value 时按 resolved value shape 校验。
- raw phase 对 authored composite 做 closed-shape 检查；resolved phase 在排除 resolver 已知 `_` 前缀内部 metadata 后校验 semantic value。内部 metadata 不能让 authored extra property 获得豁免。
- issue 始终包含准确 token path。

### Transformer

- 保留 unit、lineCap、dashArray 和 composite field 语义。
- 只做跨平台共享的语义归一化，例如 color normalization 和命名 font weight 到数值的映射。
- 不提前把所有 `{ value, unit }` 转成 CSS string。

### Formatter

- 各平台独立决定 dimension 默认单位与最终结构。
- 复合类型必须使用专用 formatter。
- formatter 拒绝未归一化或无法表达的值，不提供掩盖输入错误的默认值。

## 错误合同

- 标准类型值不符合标准或明确的 Wave extension 时，schema 返回 error。required main/profile pass 在 formatter 之前失败；现有 optional Night pass 保持 warning + skip，不升级为全 build fatal。
- reference 在 raw phase 通过占位校验，resolved 后按 expected type 和最终值重新验证；只靠形状相同不能让 `number` token 冒充 `fontWeight` 或让未知 array token 冒充 `cubicBezier`。
- formatter 防线错误包含 token path、type、value shape 和失败字段。
- fatal selected pass 的 schema 或 formatter 失败不创建或覆盖该次 `generateTokens()` 规划的任何文件。optional Night skip 不删除或覆盖既有 Night 文件，并输出明确 warning；跨 pass 清理旧产物不在本次范围内。
- 单次 `generateTokens()` 在所有目标 formatter 成功后才写文件。整个多-pass build 的跨 pass 事务化不属于本次范围。

## 测试与验收

### Schema

- 每个标准类型覆盖合法值、非法值、group inherited type、curly reference 和 `$ref`。
- dimension 覆盖标准单位、Wave 扩展单位、无单位默认、非法 unit 和非有限数。
- color 覆盖所有标准 colorSpace、`"none"` component、optional alpha/hex、无 hex 的非 sRGB color，以及需要 hex 的平台失败。
- fontWeight 覆盖全部大小写敏感 alias 映射和 `1..1000` 边界。
- strokeStyle 覆盖 string、奇数 dashArray、lineCap、负数/全零标准输入和引用；平台限制只在对应 formatter 断言。
- border、transition、shadow、gradient、typography 覆盖必需字段、optional `shadow.inset`、额外字段拒绝、成员类型和 typed sub-value reference。
- gradient 覆盖 `<0`、`0..1`、`>1` clamp，以及 array reference 不展开、不 flatten。
- typography 方言单独覆盖 defaults/baseFontSize materialize、optional color、`px | pt | rem` lineHeight、相应 typed reference，以及除此之外的额外字段拒绝。
- `$type: opacity` 恢复为 unknown-type warning；opacity extension fields 保持有效。

### Formatter

- JSON/JSONC、CSS、Sketch 覆盖全部标准类型。
- JSON/JSONC 与 Sketch 对上述每种 payload shape 做精确 snapshot。
- CSS companion variable 覆盖主变量及每个 companion 的 collision failure。
- CSS 对未知复合值、漏网标准复合值和嵌套 object 明确失败。
- 所有 CSS 输出不包含 `[object Object]`。
- fatal schema/formatter fixture 在输出目录放置 sentinel 并记录文件 hash；失败后 sentinel、旧文件 hash 和目录文件集合均不变。optional Night invalid fixture 只产生 skip warning，不写 Night 文件。

### Integration

- dedicated fixture 同时覆盖全部新增标准类型与引用链。
- fixture 将标准类型放在现有可发射 root 下，只验证类型与平台合同。public-root 过滤仍由 `$config`/generator 决定；被过滤的 token 不代表类型不受支持，本次不借 fixture 修改 `includeRootKeys`。
- `orca-realistic` fixture 使用标准 border + stroke style，并保持 CSS/Sketch 输出合同。
- 真实 Orca 的 default、named profiles、CSS 和 Sketch smoke 全部通过。
- Orca smoke 目录递归搜索 `[object Object]` 无匹配。
- `pnpm check:ci` 通过。

## 文档

- `docs/SPEC.md` 记录标准类型矩阵、Wave dimension 扩展和平台输出快照。
- 用户手册区分 DTCG 标准写法与 Wave 简写。
- 删除 `$type: opacity` 的支持声明，保留 opacity extension 文档。
- 不把 `theme.*` taxonomy 或 public-root 配置写成 DTCG 类型规则。

## 迁移与提交边界

Wave 与 Orca 分仓提交：

1. Wave 先完成 schema、transformer、formatter、tests 和 docs，并通过 gate。
2. Orca 再迁移三处 source token，使用 Wave 新版本生成隔离 smoke。
3. 只更新 smoke 证明受影响的 tracked artifacts，不触碰 Orca 现有无关改动。
4. 两个仓库分别使用 Conventional Commits，保持原子提交。
