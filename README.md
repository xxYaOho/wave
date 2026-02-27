# wavev2

Design Token CLI 工具，用于生成主题配置文件。

## 版本

v0.2.1

## 安装

```bash
bun install
```

## 使用

### CLI 命令

```bash
# 生成主题（当前目录有 themefile 时）
bun run src/cli/index.ts theme

# 指定 themefile 路径
bun run src/cli/index.ts theme ./my-theme/themefile

# 使用 -f 指定文件
bun run src/cli/index.ts theme -f ./my-theme/themefile
```

### Themefile 格式

```yaml
THEME my-theme
PALETTE leonardo
DIMENSION wave

PARAMETER platform general
PARAMETER filterLayer 1
```

### YAML 主题配置（v0.2.1 新增）

支持通过 `main.yaml`、`main@night.yaml` 和 `variants/*.yaml` 定义主题配置：

#### main.yaml

```yaml
theme:
  color:
    $type: color
    primary:
      $value: "{leonardo.global.color.corerainBlue.light.600}"
    secondary:
      $value: "#666666"
```

#### 引用语法

| 引用 | 解析目标 |
|------|------|
| `{leonardo.global.color.xxx.yyy}` | leonardo 色板颜色 |
| `{wave.global.dimension.xxx.yyy}` | wave 维度数值 |

#### color+alpha 复合值

```yaml
alpha-1:
  $value:
    color: "#000000"
    alpha: 0.36
```
输出：`#0000005c`（带透明度的 hex 颜色）

### 内置资源

- **Palette**: leonardo, tailwindcss4
- **Dimension**: wave

## 开发

```bash
# TypeScript 类型检查
bun run typecheck
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
