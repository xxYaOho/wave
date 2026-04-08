# Wave

面向 UI/UX 设计师的 Design Token CLI 工具。

**一分钟生成专业级设计令牌。**

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
$ wave theme
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

**前置要求**: [Bun](https://bun.sh) 运行时

```bash
# 克隆仓库
git clone https://github.com/yourusername/wave.git
cd wave

# 安装依赖
bun install
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
bun run wave theme
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

---

## 下一步

- **完整指南**: [docs/GUIDE.md](./docs/GUIDE.md) - 学习所有功能
- **技术规范**: [docs/SPEC.md](./docs/SPEC.md) - 系统行为参考
- **变更记录**: [docs/CHANGELOG.md](./docs/CHANGELOG.md) - 版本更新
- **未来评估**: [docs/future-evaluations.md](./docs/future-evaluations.md) - 技术方向备忘

---

## 快速命令

```bash
# 生成主题（当前目录）
wave theme

# 指定 themefile
wave theme -f ./path/to/themefile

# 仅生成 CSS
wave theme --platform css

# 生成多个格式
wave theme --platform json,jsonc,css,sketch

# 跳过 night 模式
wave theme --no-night

# 查看内置资源列表
wave list

# 查看内置资源详情
wave show tailwindcss4
wave show wave

# 创建主题模板
wave theme --init
```

---

**当前版本**: v0.10.3

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
