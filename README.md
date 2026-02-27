# wavev2

Design Token CLI 工具，用于生成主题配置文件。

## 版本

v0.2.0

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

#### 参数说明

| 参数 | 说明 | 可选值 |
|------|------|--------|
| platform | 输出平台 | `general` (json/jsonc), `css` |
| filterLayer | 过滤层级 | 数字 |
| output | 输出目录 | 路径 |
| night | Night 模式 | `auto`, `false` |
| variants | 变体 | 逗号分隔的变体名 |
| brand | 品牌 | 品牌名 |

### 内置资源

- **Palette**: leonardo, tailwindcss4
- **Dimension**: wave

## 开发

```bash
# TypeScript 类型检查
bun run typecheck
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
