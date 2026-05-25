# Wave

面向 UI/UX 设计师的本地设计交付 CLI。

Wave 现在覆盖三类高频工作：生成 design token、压缩设计素材、从 PNG 帧生成 GIF/APNG 动效。

```
themefile → main.yaml → tokens.json
```

---

## 一分钟预览

定义主题（`main.yaml`）：

```yaml
theme:
  color:
    primary:
      $value: "#0066cc"
    text:
      default:
        $value: "#333333"
```

生成令牌：

```bash
$ pnpm dev -- create
✓ Generated: theme.json
```

输出（`theme.jsonc`）：

```json
{
  "color-primary": "#0066cc",
  "color-text-default": "#333333"
}
```

---

## 安装

**前置要求**: [mise](https://mise.jdx.dev/) 管理的 Bun 运行时与 pnpm 包管理器

```bash
# 克隆仓库
git clone https://github.com/yourusername/wave.git
cd wave

# 安装工具链与依赖
mise install
pnpm install
```

---

## 第一个主题

### 1. 创建 themefile

在项目目录创建 `themefile`：

```
THEME my-theme
RESOURCE palette leonardo
RESOURCE dimension wave
```

也支持自定义资源：

```
THEME my-theme
RESOURCE palette leonardo
RESOURCE dimension wave
RESOURCE custom ./brand-colors.yml
```

### 2. 创建 main.yaml

同一目录创建 `main.yaml`：

```yaml
$scheme: ~
theme:
  color:
    $type: color
    primary:
      $value: "{leonardo.global.color.corerainBlue.light.600}"
    background:
      $value: "#ffffff"
```

### 3. 生成

```bash
pnpm dev -- create
```

输出：
- `my-theme.json` - 紧凑格式（默认）
- `my-theme.jsonc` - 带注释格式
- `my-theme.css` - CSS 变量格式
- `my-theme2sketch.json` - Sketch API 兼容格式

多平台输出：
```
PARAMETER platform json,jsonc,css,sketch
```

---

## 核心概念

| 概念 | 说明 | 示例 |
|------|------|------|
| **themefile** | 配置声明文件 | `THEME`, `RESOURCE`, `PARAMETER` |
| **main.yaml** | 主题内容定义 | `theme.color.primary.$value` |
| **Palette** | 内置色板 | `leonardo`, `tailwindcss4` |
| **Dimension** | 内置尺寸 | `wave` |
| **Custom** | 自定义资源 | `./tokens/brand.yml` |
| **Toolchain** | 本地工具检查与安装入口 | `wave doctor`, `wave install` |
| **Compress** | PNG/JPG/SVG/GIF 本地压缩 | `wave compress ./assets` |
| **Motion** | PNG 帧生成 GIF/APNG | `wave motion gif ./frames` |

---

## 下一步

- **完整指南**: [docs/GUIDE.md](./docs/GUIDE.md) - 学习所有功能
- **技术规范**: [docs/SPEC.md](./docs/SPEC.md) - 系统行为参考
- **变更记录**: [docs/CHANGELOG.md](./docs/CHANGELOG.md) - 版本更新
- **vNext 蓝图**: [docs/SWISS_KNIFE_REFACTOR.md](./docs/SWISS_KNIFE_REFACTOR.md) - 瑞士军刀化重构设计

---

## 快速命令

```bash
# 生成主题（当前目录）
wave create

# design-token 模块入口（当前目录有 main.yaml 时自动读取）
wave design-token
wave dt
wave dt wcag

# 指定 themefile
wave create -f ./path/to/themefile

# 指定 main.yaml
wave dt -f ./path/to/main.yaml

# 仅生成 CSS
wave create --platform css

# 生成多个格式
wave create --platform json,jsonc,css,sketch

# 跳过 night 模式
wave create --no-night

# 浏览内置资源
wave show

# 查看内置资源详情
wave show tailwindcss4
wave show wave

# 创建主题模板
wave init

# 检查本地工具链
wave doctor
wave install --check

# 压缩素材
wave compress ./assets --dry-run
wave compress ./assets --type png --yes
wave compress ./assets --type png --yes --force

# 从 PNG 帧生成动效
wave motion gif ./frames --fps 24 --out loading.gif
wave motion apng ./frames --fps 24 --out loading.png
wave mg gif ./frames
```

---

**当前版本**: 运行 `wave --version` 查看

Bun 是 Wave CLI 的运行时，pnpm 负责依赖安装和 lockfile 管理。
