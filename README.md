# Wave

Wave 是面向 UI/UX 设计师的本地设计交付 CLI。它把 design token 生成、素材压缩、PNG 帧动效生成、项目工作区创建和本地工具链诊断放在一个入口里。

```bash
wave <command> [options]
```

## 使用手册

日常使用说明统一维护在本地手册中：

```bash
wave manual
```

开发环境中可以运行：

```bash
pnpm dev -- manual
```

手册内容源在 [manual/](./manual)。README 只保留项目入口，不重复维护各命令的详细用法。

## 能力

| 能力 | 命令 |
| --- | --- |
| Design Token | `wave dt` |
| 素材压缩 | `wave compress` |
| 动效生成 | `wave motion` / `wave mg` |
| 工作区创建 | `wave workspace` |
| 工具链检查与安装 | `wave doctor` / `wave install` |

Legacy 入口仍可用于旧项目：`wave create`、`wave init`、`wave show`。新脚本优先使用模块化入口。

## 开发

本仓库使用 mise 管理运行环境，使用 pnpm 安装依赖。

```bash
mise install
pnpm install
pnpm dev -- --help
```

常用验证命令：

```bash
pnpm typecheck
bun test
pnpm build
```

## 项目结构

```text
src/
  cli/          CLI 命令入口
  core/         pipeline、generator、compress、motion、workspace 等核心逻辑
  resources/    内置 resource
manual/         wave manual 内容源
docs/           行为快照、变更记录和重构说明
tests/          bun:test 测试
```

## 文档

- `wave manual`：用户手册。
- [docs/SPEC.md](./docs/SPEC.md)：当前行为快照，适合实现和 review 前阅读。
- [docs/CHANGELOG.md](./docs/CHANGELOG.md)：变更记录。
- [docs/SWISS_KNIFE_REFACTOR.md](./docs/SWISS_KNIFE_REFACTOR.md)：瑞士军刀化重构路线。

版本唯一真源是 [package.json](./package.json)。
