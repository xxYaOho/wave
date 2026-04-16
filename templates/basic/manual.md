# Wave Theme 使用手册

## themefile 配置

### 基本结构

```
THEME <主题名称>
RESOURCE palette <调色板名称>
RESOURCE dimension <尺寸系统名称>

PARAMETER output <输出目录>
PARAMETER platform <输出格式>
PARAMETER colorSpace <颜色空间>
```

### 参数说明

#### THEME

- **说明**: 定义主题名称
- **示例**: `THEME my-brand`
- **规则**: 名称只能包含字母、数字、连字符和下划线

#### RESOURCE palette

- **说明**: 指定调色板资源
- **可选值**:
  - `tailwindcss4` - Tailwind CSS v4 色彩系统
  - `leonardo` - Leonardo 色彩系统
  - `<自定义路径>` - 自定义调色板 YAML 文件路径

#### RESOURCE dimension

- **说明**: 指定尺寸系统资源
- **可选值**:
  - `wave` - Wave 内置尺寸系统（alpha、spacing、rem 等）
  - `<自定义路径>` - 自定义尺寸 YAML 文件路径

#### PARAMETER output

- **说明**: 指定生成文件的输出目录
- **示例**: `PARAMETER output ./dist`
- **默认值**: `~/Downloads/<THEME>`
- **注意**: 支持 `~` 作为 HOME 目录简写

#### PARAMETER platform

- **说明**: 指定输出平台格式，多个格式用逗号分隔
- **可选值**: `json`, `jsonc`, `css`, `sketch`
- **示例**: `PARAMETER platform json,css,sketch`
- **默认值**: `json`
- **格式说明**:
  - `json` - 紧凑 JSON 格式
  - `jsonc` - 带注释的 JSON 格式
  - `css` - CSS 变量格式
  - `sketch` - Sketch API 兼容格式（输出 `{theme}2sketch.json`）

#### PARAMETER colorSpace

- **说明**: 指定颜色输出空间
- **可选值**: `hex`, `oklch`, `srgb`, `hsl`
- **示例**: `PARAMETER colorSpace oklch`
- **默认值**: `hex`

#### PARAMETER filterLayer

- **说明**: 指定颜色层级过滤（用于生成简化版主题）
- **示例**: `PARAMETER filterLayer 3`
- **注意**: 仅保留前 N 层颜色定义

---

## main.yaml 编写

### 文件作用

`main.yaml` 是主题令牌的核心定义文件，与 `themefile` 放在同一目录。

### 基本结构

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"
    secondary:
      $value: "{tailwindcss4.color.blue.500}"

  dimension:
    $type: dimension
    spacing:
      sm:
        $value: "{wave.spacing.1}"
      md:
        $value: "{wave.spacing.2}"
```

### 颜色令牌

#### 基本语法

```yaml
theme:
  color:
    $type: color
    <令牌名称>:
      $value: "{<命名空间>.<路径>}"
```

#### 示例

```yaml
theme:
  color:
    $type: color
    brand:
      $value: "{tailwindcss4.color.indigo.600}"
    brand-light:
      $value: "{tailwindcss4.color.indigo.400}"
    brand-dark:
      $value: "{tailwindcss4.color.indigo.800}"
```

### 尺寸令牌

#### 基本语法

```yaml
theme:
  dimension:
    $type: dimension
    <令牌名称>:
      $value: "{<命名空间>.<路径>}"
```

#### 示例

```yaml
theme:
  dimension:
    $type: dimension
    padding:
      sm:
        $value: "{wave.spacing.1}"
      md:
        $value: "{wave.spacing.2}"
      lg:
        $value: "{wave.spacing.4}"
    border-radius:
      sm:
        $value: "{wave.rem.0_5}"
      md:
        $value: "{wave.rem.1}"
```

### 引用语法

#### 引用资源值

使用花括号 `{namespace.path.to.token}` 引用 RESOURCE 定义的资源：

```yaml
$value: "{tailwindcss4.color.indigo.600}"
$value: "{wave.spacing.2}"
$value: "{wave.alpha.50}"
```

#### 复合值（color + alpha）

使用对象形式组合颜色和透明度：

```yaml
theme:
  color:
    $type: color
    text-disabled:
      $value:
        color: "{tailwindcss4.color.gray.600}"
        alpha: 0.5
```

也可以混合引用：

```yaml
$value:
  color: "{theme.color.base}"
  alpha: "{wave.dimension.alpha.400}"
```

#### Shadow 令牌

```yaml
theme:
  shadow:
    $type: shadow
    sm:
      $value:
        - color:
            $ref: "#/tailwindcss4/color/gray/900/$value"
            alpha: 0.1
          offsetX: 0
          offsetY: 1
          blur: 2
          spread: 0
```

#### 引用其他令牌（$ref）

使用 `$ref` 引用其他令牌，支持**内部引用**（同一文件）和**外部引用**（RESOURCE 定义的资源）：

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"
    # 内部引用：引用同一文件内的 primary
    primary-hover:
      $ref: "#/theme/color/primary/$value"
    # 外部引用：直接引用 leonardo 色板
    secondary:
      $ref: "#/leonardo/global/color/corerainBlue/light/600/$value"
```

**属性合并**：`$ref` 可以与其他属性组合，实现基础值 + 局部覆盖：

```yaml
theme:
  color:
    base:
      $value: "#000000"
    # 引用 base，但修改透明度
    semi-transparent:
      $ref: "#/theme/color/base/$value"
      alpha: 0.5  # 输出: "#00000080"
```

#### Group 继承（$extends）

使用 `$extends` 让一个 Group 继承另一个 Group 的所有属性，适用于创建组件变体：

```yaml
theme:
  component:
    button:
      base:
        $type: color
        background:
          $value: "{tailwindcss4.color.gray.200}"
        text:
          $value: "{tailwindcss4.color.gray.700}"
        radius:
          $type: dimension
          $value: { value: 4, unit: px }

      primary:
        $extends: "{theme.component.button.base}"
        background:
          $value: "{tailwindcss4.color.indigo.600}"
        # text 和 radius 从 base 继承
```

**继承规则：**

- `$extends` 只能在 Group 上使用（不能在有 `$value` 的对象上使用）
- 使用完整路径格式 `{theme.path.to.group}`
- 子 Group 的属性会覆盖父 Group 的同名属性
- `$type` 和 `$description` 可以被继承或覆盖

**无效示例：**

```yaml
# 错误：$extends 不能用在 token 上
color:
  primary:
    $extends: "{theme.color.base}"  # ❌ 错误
    $value: "#ff0000"

# 错误：路径必须是完整路径
button:
  $extends: "{component.button.base}"  # ❌ 缺少 rootKey
```

---

## 高级功能

### Night 模式

创建 `main@night.yaml` 文件定义夜间模式颜色：

```yaml
# main@night.yaml
theme:
  color:
    $type: color
    background:
      $value: "{tailwindcss4.color.gray.900}"
    text:
      $value: "{tailwindcss4.color.gray.100}"
```

Wave 会自动检测 `main@night.yaml` 并生成夜间主题文件。

#### 控制 Night 模式生成

```bash
# 生成包含 night 模式（默认）
wave create my-theme

# 禁用 night 模式
wave create my-theme --no-night
```

### Variants（变体主题）

在 `variants/` 目录下创建额外的 YAML 文件作为变体主题：

```yaml
# variants/compact.yaml
theme:
  dimension:
    $type: dimension
    spacing:
      sm:
        $value: "{wave.spacing.0_5}"
```

Wave 会自动检测 `variants/` 目录中的 YAML 文件并生成对应的主题文件。

#### 控制 Variants 生成

```bash
# 自动生成所有变体（默认）
wave create my-theme

# 禁用变体
wave create my-theme --no-variants

# 指定特定变体
wave create my-theme --variants=compact,dense
```

### $extensions 扩展

Wave 支持通过 `$extensions` 实现高级效果。

#### smoothShadow - 平滑阴影

将单个阴影扩展为按贝塞尔曲线采样的多层阴影：

```yaml
theme:
  shadow:
    $type: shadow
    elevated:
      $value:
        color: "#000000"
        alpha: 0.2
        offsetX: 0
        offsetY: 6
        blur: 12
        spread: 0
      $extensions:
        smoothShadow:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 3
```

- `cubicBezier`: 贝塞尔曲线控制点 `[x1, y1, x2, y2]`，与 CSS 一致；也支持引用 dimension 资源如 `"{wave.dimension.cubicBezier.easeInCubic}"`
- `step`: 生成的阴影层数（≥1）

**注意**: `$extensions` 拼写必须正确，错误的 `$extentions` 会被忽略。

#### smoothGradient - 平滑渐变

将两个端点的渐变扩展为平滑过渡的多点渐变：

```yaml
theme:
  gradient:
    $type: gradient
    hero:
      $value:
        - color: "#ff0000"
          position: 0
        - color: "#0000ff"
          position: 1
      $extensions:
        smoothGradient:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 5
```

- `step`: 总节点数（包含起点和终点，≥2）

#### inheritColor - 继承色扩展

用于表达"从父级/上下文继承颜色"的设计意图。

**布尔简写（最常见）：**
```yaml
theme:
  color:
    interactive:
      $type: color
      $value: "#0066cc"
      $extensions:
        inheritColor: true
```

**带透明度：**
```yaml
theme:
  color:
    semiTransparent:
      $type: color
      $value: "#cc0000"
      $extensions:
        inheritColor:
          opacity: 0.5
```


#### currentColor - 当前颜色扩展（已弃用，请使用 inheritColor）

支持在运行时应用当前颜色：

```yaml
theme:
  color:
    $type: color
    interactive:
      $value: "#0066cc"
      $extensions:
        currentColor:
          opacity: 0.8
```

```yaml
theme:
  shadow:
    $type: shadow
    focus:
      $value:
        - color: "#0066cc"
          offsetX: 0
          offsetY: 0
          blur: 4
          spread: 0
      $extensions:
        currentColor:
          shadow:
            color: "#0066cc"  # 会在运行时替换为当前颜色
```

---

## 完整示例

### 项目结构

```
my-theme/
├── themefile
├── main.yaml
├── main@night.yaml
└── variants/
    └── compact.yaml
```

### themefile

```
THEME my-brand
RESOURCE palette tailwindcss4
RESOURCE dimension wave

PARAMETER output ./dist
PARAMETER platform json,css
PARAMETER colorSpace oklch
```

### main.yaml

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"
    secondary:
      $value: "{tailwindcss4.color.blue.500}"
    background:
      $value: "{tailwindcss4.color.white}"
    text:
      $value: "{tailwindcss4.color.gray.900}"

  dimension:
    $type: dimension
    spacing:
      xs:
        $value: "{wave.spacing.0_5}"
      sm:
        $value: "{wave.spacing.1}"
      md:
        $value: "{wave.spacing.2}"
      lg:
        $value: "{wave.spacing.4}"
    radius:
      sm:
        $value: "{wave.rem.0_5}"
      md:
        $value: "{wave.rem.1}"
```

### 生成命令

```bash
# 进入主题目录
cd my-theme

# 生成主题
wave create my-brand

# 或使用 --file 指定 themefile 路径
wave create -f ./themefile
```

### 输出结构

根据 `PARAMETER platform` 配置生成对应文件：

```
dist/
├── my-brand.json              # JSON 格式
├── my-brand.css               # CSS 变量格式
├── my-brand2sketch.json       # Sketch API 格式
├── my-brand-night.json        # Night 模式
├── my-brand-night.css
├── my-brand-night2sketch.json # Night 模式 Sketch
├── my-brand-compact.json      # 变体主题
└── my-brand-compact.css
```

---

## 故障排除

### 错误：File not found

- 检查 `themefile` 是否存在
- 检查 RESOURCE 引用的路径是否正确

### 错误：Parse error

- 检查 YAML 语法
- 检查 `$value` 引用的命名空间是否正确

### 颜色未按预期转换

- 检查 `colorSpace` 参数设置
- 确认源资源中的颜色格式
