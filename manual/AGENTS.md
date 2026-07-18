# Manual 维护规范

## 范围

`manual/` 是 `wave manual` 的用户可见内容来源。

这里只写使用手册。不要把内部计划、实现笔记、发布报告或 agent handoff 内容放进 manual。

## 真实来源

修改 manual 前，必须从当前项目文件核对行为：

- CLI 行为：`src/cli/commands/`
- design-token 主链路：`src/core/pipeline/`、`src/core/schema/`、`src/core/transformer/`、`src/core/generator/`
- 测试和示例：`tests/`、`tests/fixtures/`
- 行为快照：`docs/SPEC.md`

不要凭印象编写 flag、配置字段、`$extensions`、输出结构或默认路径。源码、测试和旧 manual 冲突时，以源码和测试为准，并同步修正文档。

## 内容规则

- 使用中文。
- 面向使用本地 CLI 的 UI/UX 设计师。
- 优先给可复制的命令和配置示例，少写抽象描述。
- 每个页面只解决一个用户任务，或只承担一个参考主题。
- 使用真实命令、真实路径、真实字段名。
- 不向用户暴露内部文档、graphify 输出、Superconductor 状态、agent 流程或实现计划。
- 不在多个页面重复维护同一张参考表；需要时指向 canonical 页面。
- 不把路线图写成已经可用的行为。

## 结构

- `manual.config.yaml` 控制站点信息、首页卡片和导航。
- `pages/*.md` 是用户可见页面。
- `AGENTS.md` 只给维护者使用，禁止加入导航。

每个用户可见页面必须登记在 `manual.config.yaml` 的导航中。首页卡片只能指向导航中已经登记的页面。导航中登记的页面必须真实存在。

## 页面 Frontmatter

每个 `pages/*.md` 文件必须以 frontmatter 开头：

```yaml
---
title: 页面标题
description: 一句话说明这个页面能帮用户完成什么。
category: 能力
commands:
  - wave example --help
appliesTo:
  - 本地 CLI
---
```

规则：

- `title` 默认与导航文案一致，除非有明确理由。
- `description` 说明页面帮助用户完成什么。
- `commands` 优先放安全的查看命令或 dry-run 命令。
- `appliesTo` 保持简短；普通 CLI 文档使用 `本地 CLI`。

## 导航

导航保持小而稳定，按能力域分五组：

- `开始`：上手和安装。
- `Design Token`：design-token 概览、写法参考子页和内置资源。
- `素材`：素材压缩和动效生成。
- `工作区`：工作区创建。
- `参考`：命令索引、路径、排障和参考页。

只有内容足够独立时才新增页面。如果只是现有主题的一个小节，扩展现有页面。

## Design Token 文档

design-token 用户参考拆分为五个文件，共同构成唯一真源：

- `pages/design-token.md`：概览，覆盖用途、入口选择、文件职责、旧 themefile 入口。
- `pages/design-token-main-yaml.md`：`main.yaml` 的 `$config`、GROUP、token 结构、theme 顶级 key、兼容字段。
- `pages/design-token-color-typography.md`：颜色和 alpha、Typography、虚线 border。
- `pages/design-token-extensions-output.md`：输出格式、`$extensions` 全部扩展字段。
- `pages/design-token-quality-theming.md`：`doctor.wcagPairs`、Profile 和 Night Mode、常见错误。

新增或修改 design-token 行为时，必须在同一变更中更新对应子页，不要新建第六个 design-token 文件。

`$extensions` 只记录 `src/core/schema/theme.ts` 和 transformer 测试支持的字段。`currentColor`、`sketchMap` 这类兼容字段只能标为 legacy 或 deprecated，不能作为新写法推广。

## 示例

示例必须符合当前行为。

推荐：

```bash
wave dt build -f ./themefile --platform json,css
wave compress ./assets --dry-run
wave motion gif ./frames --fps 24 --out loading.gif
```

避免：

```bash
wave dt build -f ./main.yaml
wave compress ./assets --yes
wave motion gif
```

只有当章节明确讨论写入输出时，才使用 `--yes` 这类写入命令。

## 验证

修改 manual 内容后运行：

```bash
pnpm manual:build
bun test tests/manual-loader.test.ts tests/manual-app.test.ts tests/cli-manual.test.ts
```

如果同时修改 CLI 行为，还要运行相关 CLI 测试和 `pnpm typecheck`。

交付前启动 manual，并检查受影响页面：

```bash
pnpm build
dist/wave manual --no-open
```

检查：

- 页面按预期出现在导航中。
- 搜索能找到新增术语。
- 代码示例渲染为代码块。
- 内部路径和内部文档没有暴露给用户。
- `/design-token` 等深链刷新正常。

## 审查清单

提交 manual 变更前确认：

- 内容对应明确用户任务或参考需求。
- 每条命令真实存在，或明确只是示例路径。
- 每个配置字段都有源码或测试支撑。
- 页面不与 `docs/SPEC.md` 冲突。
- 用户页面没有泄漏内部计划或 agent 流程。
- manual build 成功。
