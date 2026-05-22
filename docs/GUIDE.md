# Wave 使用指南

面向 UI/UX 设计师的本地设计交付 CLI 使用指南。

---

## 目录

- [准备工作](#准备工作)
- [基础用法](#基础用法)
- [本地工具链](#本地工具链)
- [素材压缩](#素材压缩)
- [动效生成](#动效生成)
- [引用系统](#引用系统)
- [进阶主题](#进阶主题)
- [内置资源](#内置资源)
- [故障排除](#故障排除)
- [最佳实践](#最佳实践)

---

## 准备工作

### 安装

1. **安装 mise**: <https://mise.jdx.dev/>

2. **安装 Wave**:

```bash
git clone <repository-url>
cd wave
mise install
pnpm install
```

3. **验证安装**:

```bash
pnpm dev -- --version
```

> 说明：Bun 是 Wave CLI 的运行时；pnpm 负责依赖安装和 lockfile 管理；mise 负责安装 Bun、pnpm 和本地图片/动效工具。

### 项目结构

推荐的项目结构：

```
my-design-system/
├── themefile           # 配置声明
├── main.yaml           # 主题定义
├── main@night.yaml     # Night 模式（可选）
├── variants/           # 变体目录（可选）
│   ├── dark.yaml
│   └── high-contrast.yaml
└── dist/               # 输出目录
    └── (生成的 token 文件)
```

---

## 基础用法

### themefile 详解

`themefile` 是 Wave 的配置入口，声明数据源和输出参数。

**基本结构**:

```
THEME <主题名称>
RESOURCE palette <色板名称>
RESOURCE dimension <尺寸系统名称>

PARAMETER <参数名> <参数值>
```

**完整示例**:

```
THEME orca
RESOURCE palette leonardo
RESOURCE dimension wave

PARAMETER output ./dist
PARAMETER platform json
PARAMETER colorSpace oklch
PARAMETER filterLayer 1
```

**可用参数**:

| 参数 | 说明 | 默认值 | 可选值 |
|------|------|--------|--------|
| `output` | 输出目录 | `./<THEME>` | 任意路径 |
| `platform` | 输出格式 | `json` | `json`, `jsonc`, `css`, `sketch`（逗号分隔可多选） |
| `colorSpace` | 色彩空间 | `hex` | `hex`, `oklch`, `srgb`, `hsl` |
| `filterLayer` | 过滤层级 | `0` | 数字 |
| `night` | Night 模式 | `auto` | `auto`, `false` |
| `variants` | 启用变体 | - | 逗号分隔的变体名 |

### 内置资源查看命令

使用 `show` 命令查看内置资源：

```bash
# 浏览所有内置资源
wave show

# 列出指定类别的资源
wave show palette
wave show dimension

# 查看指定资源（category 前缀可选，同名冲突时才需要）
wave show tailwindcss4
wave show leonardo
wave show wave

# 指定输出格式
wave show tailwindcss4 --format yaml
wave show wave --format json
wave show leonardo --format flat-json  # 扁平化的 key-value 格式
```

### main.yaml 基础

`main.yaml` 定义主题的具体内容，使用 DTCG (Design Tokens Community Group) 格式。

**基本结构**:

```yaml
$scheme: ~
theme:
  color:
    $type: color
    primary:
      $value: "#0066cc"
    secondary:
      $value: "#666666"
  
  dimension:
    $type: dimension
    spacing:
      small:
        $value: 8
      medium:
        $value: 16
```

**Token 属性**:

| 属性 | 说明 | 示例 |
|------|------|------|
| `$value` | 值（必需） | `"#0066cc"`, `16`, `"{引用}"` |
| `$type` | 类型 | `color`, `dimension`, `shadow`, `gradient` |
| `$description` | 描述 | `"主品牌色"` |
| `$deprecated` | 废弃标记 | `true` 或 `"使用新名称替代"` |

### 生成主题

```bash
# 当前目录有 themefile 时
wave create

# 指定 themefile 路径
wave create -f ./my-theme/themefile

# 指定主题名称与 themefile 路径
wave create my-theme -f ./my-theme/themefile
```

也可以使用 design-token 模块入口：

```bash
# 等价于 wave dt build
wave dt

# 显式构建设计令牌
wave dt build

# 通过 dt 入口运行 WCAG 对比度检查
wave dt wcag
wave dt wcag dark --night
```

当前版本的 `wave dt build` 仍复用 `themefile` + `main.yaml` 主链路。`create`、`show`、`init` 仍保留为兼容入口。

**输出文件**:

- `{theme}.json` - JSON 格式（紧凑，默认）
- `{theme}.jsonc` - JSON with Comments（带注释）
- `{theme}.css` - CSS 变量
- `{theme}2sketch.json` - Sketch API 兼容格式

---

## 本地工具链

Wave 不捆绑图片压缩和动效编码工具。它通过本机工具完成压缩和编码，并提供 doctor/install 入口降低配置成本。

### 检查环境

```bash
# 检查 Wave 运行时和本地工具摘要
wave doctor

# 紧凑状态
wave doctor --status

# 结构化输出
wave doctor --json
```

### 查看安装计划

```bash
wave install --check
wave compress install --check
wave motion install --check
```

### 执行安装

```bash
wave install --yes
wave compress install --yes
wave motion install --yes
```

这些命令调用项目 `.mise.toml` 中的 mise task。缺少 mise 时，Wave 会提示先安装 mise，不会输出 Bun 运行时堆栈。

工具分组：

| 模块 | 需要的本地工具 |
|------|----------------|
| `compress` | `oxipng`, `pngquant`, `svgo`, `gifsicle`, `jpegtran` 或 `mozjpeg` |
| `motion` | `gifski`, `apngasm` |

---

## 素材压缩

`wave compress` 用于压缩已有 PNG/JPG/SVG/GIF 文件，不负责从帧生成动效。

```bash
# 预览当前目录支持的文件，不落盘
wave compress . --dry-run

# 压缩目录中的素材并写入默认输出目录
wave compress ./assets --yes

# 只处理 PNG
wave compress ./assets --type png --yes

# 递归扫描子目录
wave compress ./assets --recursive --yes

# 显式指定输出目录
wave compress ./assets --out ./optimized --yes

# JSON 输出，适合脚本读取
wave compress ./assets --json
```

真实子命令是 `wave compress run`。为了降低记忆成本，`wave compress ./assets` 会在内部归一化为 `wave compress run ./assets`。

默认行为：

- 不传 `--yes` 时只做 preview，不写文件。
- `--dry-run` 只展示预览，不询问也不写文件。
- `--yes` 会写入预览结果。
- 不传 `--recursive` 时，目录输入只扫描当前一级文件。
- 不传 `--out` 时，目录输入输出到 `<input-dir>/wave-compress/`；文件输入输出到 `<file-parent>/wave-compress/`。
- 若优化结果比原文件更大，Wave 会把该文件标为 `unchanged`，落盘时复制原文件字节，不使用更大的优化产物。

安全模式与质量模式：

| 模式 | 触发方式 | 工具选择 |
|------|----------|----------|
| safe | 默认 | PNG 用 `oxipng`，JPG 用 `jpegtran` 或 `mozjpeg`，SVG 用 `svgo`，GIF 用 `gifsicle` |
| quality | 传 `--quality 1-100` | PNG 用 `pngquant`，JPG 用 `mozjpeg` |

检查压缩工具：

```bash
wave compress doctor
wave compress doctor --status
wave compress doctor --json
```

---

## 动效生成

`wave motion` 用于把 PNG 帧目录编码为 GIF 或 APNG。`wave mg` 是同等 alias。

```bash
# 生成 GIF
wave motion gif ./frames

# 生成 APNG
wave motion apng ./frames

# 使用 alias
wave mg gif ./frames

# 指定帧率、输出路径
wave motion gif ./frames --fps 24 --out loading.gif

# 仅展示计划，不生成文件
wave motion apng ./frames --dry-run

# 覆盖已有输出
wave motion gif ./frames --overwrite
```

默认行为：

- 输入必须是 PNG 帧目录。
- 帧文件按文件名自然排序。
- 至少需要 2 帧。
- 所有帧尺寸必须一致。
- 默认 `fps=24`，`quality=80`，`loop=forever`。
- 不传 `--out` 时，GIF 输出到帧目录同级的 `<frames-dir-name>.gif`，APNG 输出到 `<frames-dir-name>.png`。
- 输出已存在时默认报错；传 `--overwrite` 才覆盖。
- 非 PNG 文件会被忽略并报告 warning。
- 无效 PNG 会报告 `WMG_FRAME_FORMAT_UNSUPPORTED`，不会泄漏运行时堆栈。
- GIF 后端不支持 `--loop once`，会明确报错；APNG 支持 `forever` 和 `once`。

检查动效工具和帧目录：

```bash
wave motion doctor
wave motion doctor ./frames
wave motion doctor ./frames --verbose
wave motion doctor ./frames --json
```

---

## 引用系统

Wave 提供三种引用方式，实现 token 之间的关联。

### 外部引用

引用内置 Palette 和 Dimension 中的值。

**语法**: `{source.path.to.value}`

**示例**:

```yaml
theme:
  color:
    primary:
      # 引用 leonardo 色板
      $value: "{leonardo.global.color.corerainBlue.light.600}"
    
    text:
      disabled:
        # 引用 wave 尺寸系统的 alpha 值
        $value:
          color: "{leonardo.global.color.deepGray.light.800}"
          alpha: "{wave.global.dimension.alpha.400}"
```

**可用源**:

| 源 | 用途 | 示例路径 |
|----|------|---------|
| `leonardo` | 颜色 | `leonardo.global.color.{name}.{light\|dark}.{number}` |
| `wave` | 尺寸/透明度 | `wave.global.dimension.{category}.{name}` |

### 内部引用

引用同一文件内定义的其他 token。

**语法**: `{theme.path.to.token}`

**示例**:

```yaml
theme:
  color:
    primary:
      main:
        $value: "#0066cc"
    
    button:
      background:
        # 引用文件内定义的 primary.main
        $value: "{theme.color.primary.main}"
```

**循环引用检测**:

如果 A 引用 B，B 又引用 A，Wave 会报错：

```
Circular reference detected: theme.color.a -> theme.color.b -> theme.color.a
```

### DTCG $ref 引用（v0.4.0+）

符合 DTCG 规范的 JSON Pointer 格式引用。

**语法**: `$ref: "#/source/path/$value"`

**示例**:

```yaml
theme:
  color:
    shadow:
      $value: "#000000"
    
    gradient-mask:
      $type: gradient
      $value:
        - color:
            # 引用 shadow 的值，并覆盖 alpha
            $ref: "#/theme/color/shadow/$value"
            alpha: 0.5
          position: 0
        - color:
            $ref: "#/theme/color/shadow/$value"
            alpha: 1
          position: 1
```

**特性**:

- 支持属性合并（`$ref` + `alpha`/`color`）
- 支持嵌套对象和数组
- 自动循环引用检测
- 兼容外部源（`#/leonardo/...`, `#/wave/...`）

### 属性合并

当 `$value` 是对象时，可以组合多个属性。

**color + alpha**:

```yaml
semi-transparent:
  $value:
    color: "#000000"           # 基础颜色
    alpha: 0.5                 # 透明度（0-1）
# 输出: "#00000080"
```

**结合引用**:

```yaml
theme:
  color:
    text:
      default:
        $value: "{leonardo.global.color.deepGray.light.800}"
      
      disabled:
        $value:
          color: "{theme.color.text.default}"
          alpha: "{wave.global.dimension.alpha.400}"
```

---

## 进阶主题

### Night 模式

自动检测并生成夜间主题。

**文件命名**:

- `main.yaml` - 默认主题
- `main@night.yaml` - Night 主题

**生成结果**:

- `{theme}.json` - 默认主题
- `{theme}-night.json` - Night 主题

**示例**:

```yaml
# main.yaml
theme:
  color:
    background:
      $value: "#ffffff"

# main@night.yaml
theme:
  color:
    background:
      $value: "#121212"
```

**禁用 Night 模式**:

```bash
wave create --no-night
```

### Variants 变体

支持主题变体（如 dark、high-contrast）。

**目录结构**:

```
project/
├── themefile
├── main.yaml
└── variants/
    ├── dark.yaml
    ├── dark@night.yaml
    └── high-contrast.yaml
```

**生成结果**:

- `{theme}.json` - 基础主题
- `{theme}-dark.json` - Dark 变体
- `{theme}-high-contrast.json` - 高对比度变体
- `{theme}-dark-night.json` - Dark + Night 组合

**指定变体**:

```bash
# 生成所有变体
wave create

# 仅生成指定变体
wave create --variants dark

# 禁用变体
wave create --no-variants
```

### colorSpace 配置

全局控制输出色彩空间。

**配置方式**:

```
# themefile
THEME my-theme
RESOURCE palette leonardo

PARAMETER colorSpace oklch
```

**支持的格式**:

| colorSpace | 输出格式 | 示例 |
|------------|----------|------|
| `hex` | Hex 字符串 | `"#0066cc"` |
| `oklch` | OKLCH 函数 | `"oklch(55% 0.15 250)"` |
| `srgb` | RGB 函数 | `"rgb(0 102 204)"` |
| `hsl` | HSL 函数 | `"hsl(210 100% 40%)"` |

**输入灵活**:

无论输入是 hex、HSL 对象还是 OKLCH 对象，输出都按 `colorSpace` 参数转换。

```yaml
# 输入可以是任意格式
color1:
  $value: "#0066cc"

color2:
  $value:
    colorSpace: hsl
    components: [210, 100, 40]

# 输出统一为配置的 colorSpace
```

### 复合值

#### Shadow

```yaml
shadow:
  $type: shadow
  $value:
    - color: "#000000"
      alpha: 0.2
      offsetX: 0
      offsetY: 2
      blur: 4
      spread: 0
```

#### Gradient

```yaml
gradient:
  $type: gradient
  $value:
    - color: "#0066cc"
      position: 0
    - color: "#0099ff"
      position: 1
```

### Sketch API 格式导出

Wave 支持导出为 Sketch API 兼容格式，包含颜色、阴影、渐变等完整设计令牌。

**配置方式:**

```
PARAMETER platform sketch
```

**输出文件:**

`{theme}2sketch.json` - Sketch API 兼容格式

**输出内容:**

- `color` 组：扁平键值对，如 `primary-main`、`text-default`
- `style` 组：嵌套结构，包含 interaction、shadow、gradient 等

**注意事项:**

- 颜色自动转换为 8位 hex（如 `#0066ccff`）
- shadow 支持多层（通过 smoothShadow 扩展生成）
- 输出顺序与 `main.yaml` 定义顺序一致

---

## 内置资源

### Palette

#### leonardo

基于 Leonardo 色彩系统的色板，包含：

- **corerainBlue** - 主品牌蓝
- **lightBlue** - 浅蓝
- **deepGray** - 深灰（中性色）
- **red** - 红色（错误）
- **orange** - 橙色（警告）
- **yellow** - 黄色（注意）
- **green** - 绿色（成功）

每色系包含 `light` 和 `dark` 两种模式，每种模式 0-1000 的色阶。

**引用示例**:

```yaml
$value: "{leonardo.global.color.corerainBlue.light.600}"
```

#### tailwindcss4

Tailwind CSS v4 的默认色板。

### Dimension

#### wave

内置尺寸系统，包含：

| 类别 | 用途 |
|------|------|
| `alpha` | 透明度值（0-1） |
| `spacing` | 间距尺寸 |
| `radius` | 圆角尺寸 |
| `elevation` | 阴影层级 |

**引用示例**:

```yaml
$value:
  color: "#000000"
  alpha: "{wave.global.dimension.alpha.400}"
```

---

## 故障排除

### 错误：Theme not found

**原因**: Wave 找不到 `themefile`

**解决**:

```bash
# 确保在正确目录执行
cd project-directory

# 或使用 -f 指定路径
wave create -f ./path/to/themefile
```

### 错误：Unresolved theme references

**原因**: 引用的路径不存在

**示例错误**:

```
Unresolved theme references found:
  - {theme.color.nonexistent} at theme.color.text.missing
```

**解决**: 检查引用路径拼写，确保目标 token 已定义。

### 错误：Circular reference detected

**原因**: Token 之间存在循环引用

**解决**: 重新设计 token 结构，避免 A→B→A 的循环。

### 警告：Reference not found

**原因**: Palette 或 Dimension 中的引用路径错误

**解决**: 检查 `leonardo` 或 `wave` 的引用路径是否正确。

---

## 最佳实践

### 项目组织

**推荐结构**:

```
design-tokens/
├── README.md
├── themefile
├── main.yaml              # 基础主题
├── main@night.yaml        # Night 主题
├── variants/
│   ├── dark.yaml
│   └── high-contrast.yaml
└── package.json
```

### 命名规范

**Token 命名**:

```yaml
# 使用 kebab-case 风格的分层命名
theme:
  color:
    # 基础色
    primary:
      main: ...
      light: ...
      dark: ...
    
    # 语义化颜色
    text:
      primary: ...
      secondary: ...
      disabled: ...
    
    # 背景色
    background:
      default: ...
      elevated: ...
    
    # 边框色
    border:
      default: ...
      focus: ...
```

### 版本管理

**建议**:

1. 将生成的 token 文件纳入版本控制，或作为构建产物
2. 使用语义化版本管理主题（与 Wave 版本独立）
3. 在 `CHANGELOG.md` 中记录主题变更

**自动化**:

```json
// package.json
{
  "scripts": {
    "build:tokens": "wave create",
    "watch:tokens": "chokidar 'main.yaml' -c 'wave create'"
  }
}
```

---

## 相关文档

- [SPEC.md](./SPEC.md) - 技术规范
- [CHANGELOG.md](./CHANGELOG.md) - 版本变更
- [README.md](../README.md) - 快速入门
