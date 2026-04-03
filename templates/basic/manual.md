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
- **可选值**: `json`, `jsonc`, `css`
- **示例**: `PARAMETER platform json,css`
- **默认值**: `json`

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

#### 引用其他令牌（$ref）
使用 `$ref` 引用同一文件内定义的其他令牌：

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"
    primary-hover:
      $ref: "#/theme/color/primary"  # 引用上面的 primary
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
wave theme my-theme

# 禁用 night 模式
wave theme my-theme --no-night
```

### Variants（变体主题）

在同一目录下创建额外的 YAML 文件作为变体主题：

```yaml
# compact.yaml
theme:
  dimension:
    $type: dimension
    spacing:
      sm:
        $value: "{wave.spacing.0_5}"
```

Wave 会自动检测目录中的变体文件并生成对应的主题文件。

#### 控制 Variants 生成

```bash
# 自动生成所有变体（默认）
wave theme my-theme

# 禁用变体
wave theme my-theme --no-variants

# 指定特定变体
wave theme my-theme --variants=compact,dense
```

---

## 完整示例

### 项目结构

```
my-theme/
├── themefile
├── main.yaml
├── main@night.yaml
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
wave theme my-brand

# 或使用 --file 指定 themefile 路径
wave theme -f ./themefile
```

### 输出结构

```
dist/
├── my-brand.json
├── my-brand.css
├── my-brand-night.json
├── my-brand-night.css
├── my-brand-compact.json
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
