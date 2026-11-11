# Wave

[English](./README.en.md) | 简体中文

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
| Design Token | `wave token` |
| 素材压缩 | `wave compress` |
| 动效生成 | `wave motion --format gif` / `wave motion --format apng` |
| 工作区创建 | `wave workspace` |
| 工具链检查与安装 | `wave doctor` / `wave install` |

`wave token` 默认构建当前目录的 `main.yaml`。使用 `wave token --help` 查看创建、检查、身份维护、迁移和资源命令。

每个命令层级都支持 `-m, --manual`，输出供 Agent 阅读的 scoped Markdown 手册。例如 `wave token new night -m` 只打印 Night 创建合同。

当前版本不保留 `dt`、`design-token`、`mg` 或旧位置参数入口。

## 开发

本仓库使用 mise 管理运行环境，使用 pnpm 安装依赖。

```bash
mise install
pnpm install
pnpm dev -- --help
```

常用验证命令：

```bash
pnpm check:ci
pnpm typecheck
pnpm test
pnpm bench:smoke
pnpm build
pnpm check:style
```

`pnpm check:ci` 是完整交付检查，聚合类型检查、测试、构建和 Biome 检查。`pnpm check:style` 只检查 Biome 格式、导入顺序和 lint 规则。
`pnpm bench:smoke` 是维护者使用的 Quality Harness 快速检查，用于确认 design-token benchmark 编排和真实输出仍保持等价。详细说明见 [benchmarks/README.md](./benchmarks/README.md)。

## 项目结构

```text
src/
  cli/          CLI 命令入口
  core/         pipeline、generator、compress、motion、workspace 等核心逻辑
  resources/    内置 resource
manual/         wave manual 内容源
docs/           行为快照、变更记录和重构说明
benchmarks/     Quality Harness 维护者指标工具
tests/          bun:test 测试
```

## 文档

- `wave manual`：用户手册。
- [docs/SPEC.md](./docs/SPEC.md)：当前行为快照，适合实现和 review 前阅读。
- [benchmarks/README.md](./benchmarks/README.md)：Quality Harness 说明，适合质量优化前阅读。
- [CHANGELOG.md](./CHANGELOG.md)：当前变更记录。
- [docs/CHANGELOG.md](./docs/CHANGELOG.md)：v0.15.0 及更早版本历史。
- [docs/SWISS_KNIFE_REFACTOR.md](./docs/SWISS_KNIFE_REFACTOR.md)：瑞士军刀化重构路线。

版本唯一真源是 [package.json](./package.json)。
