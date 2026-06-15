# Wave

Wave 是面向 UI/UX 设计师的本地设计交付 CLI。它把 design token 生成、素材压缩、PNG 帧动效生成、项目工作区创建和本地工具链诊断放在一个低记忆入口里。

```bash
wave <command> [options]
```

## 能做什么

| 能力 | 命令 | 说明 |
| --- | --- | --- |
| Design Token | `wave dt` | 读取 `main.yaml`，生成 `json`、`jsonc`、`css`、`sketch` 等输出。 |
| 素材压缩 | `wave compress` | 压缩 PNG、JPG、SVG、GIF，支持 dry-run、递归扫描和覆盖保护。 |
| 动效生成 | `wave motion` / `wave mg` | 从 PNG 帧生成 GIF 或 APNG。 |
| 工作区创建 | `wave workspace` | 按 `~/.config/wave/workspace.yaml` 创建本地设计项目目录。 |
| 工具链 | `wave doctor` / `wave install` | 检查和安装本地依赖工具。 |

## 安装开发环境

本仓库使用 mise 管理运行环境，使用 pnpm 安装依赖。

```bash
mise install
pnpm install
```

验证 CLI：

```bash
pnpm dev -- --help
```

构建单文件 CLI：

```bash
pnpm build
```

## 快速开始

### 生成 design token

在项目目录准备 `main.yaml`：

```yaml
$scheme: ~
theme:
  color:
    $type: color
    primary:
      $value: "#0066cc"
```

生成输出：

```bash
wave dt
```

常用选项：

```bash
wave dt -f ./main.yaml
wave dt --platform json --platform css
wave dt --variant dark
wave dt --no-night
wave dt show
wave dt doctor
```

### 压缩设计素材

```bash
wave compress ./assets --dry-run
wave compress ./assets --type png --recursive
wave compress ./assets --type png --yes
wave compress ./assets --type svg --icon --yes
```

### 生成动效

```bash
wave motion gif ./frames --fps 24 --out loading.gif
wave motion apng ./frames --fps 24 --out loading.png
wave mg gif ./frames
```

### 创建本地项目工作区

```bash
wave workspace
```

Workspace 默认读取：

```text
~/.config/wave/workspace.yaml
```

配置不存在时使用内置默认配置。需要调整命名、版本号、目录结构或 Finder 打开行为时，见 [MANUAL.md](./MANUAL.md)。

## 命令索引

```text
design-token   Build and inspect design tokens
compress       Compress PNG, JPG, SVG, and GIF assets
motion         Build GIF/APNG from PNG frames
workspace      Create local design project workspaces
doctor         Check local Wave environment and tools
install        Show or run recommended tool installation
```

别名：

```text
dt             Alias of design-token
mg             Alias of motion
```

Legacy 入口仍可使用：

```bash
wave create
wave init
wave show
```

新脚本和文档优先使用模块化入口：`wave dt`、`wave compress`、`wave motion`、`wave workspace`。

## 项目结构

```text
src/
  cli/                 CLI 命令入口
  core/                核心行为：pipeline、resolver、compress、motion、workspace
  resources/           内置 resource
  utils/               receipt、文件扫描等通用工具
docs/
  GUIDE.md             功能指南
  SPEC.md              当前行为快照和内部心智模型
  SWISS_KNIFE_REFACTOR.md
MANUAL.md              用户手册
tests/                 bun:test 测试
```

## 常用开发命令

```bash
pnpm dev -- --help
pnpm dev -- dt --help
pnpm dev -- compress --help
pnpm dev -- motion --help
pnpm dev -- workspace --help
pnpm typecheck
bun test
```

Workspace 相关隔离验证：

```bash
WAVE_WORKSPACE_CONFIG=/tmp/workspace.yaml pnpm dev -- workspace
```

## 文档

- [MANUAL.md](./MANUAL.md)：用户手册，记录日常命令和可编辑配置。
- [docs/GUIDE.md](./docs/GUIDE.md)：完整功能指南。
- [docs/SPEC.md](./docs/SPEC.md)：系统行为快照，适合实现和 review 前阅读。
- [docs/CHANGELOG.md](./docs/CHANGELOG.md)：变更记录。
- [docs/SWISS_KNIFE_REFACTOR.md](./docs/SWISS_KNIFE_REFACTOR.md)：瑞士军刀化重构路线。

## 版本

版本唯一真源是 [package.json](./package.json)。运行以下命令查看当前 CLI 版本：

```bash
wave --version
```
