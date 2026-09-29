---
title: 命令索引
description: Wave 常用命令和能力入口索引。
category: 参考
commands:
  - wave --help
  - wave dt --help
  - wave compress --help
  - wave motion --help
  - wave workspace --help
appliesTo:
  - 本地 CLI
---

## 顶层命令

```bash
wave --help
wave --version
wave doctor
wave install --check
wave show
```

## Design Token

全局检查和查看：

```bash
wave dt show
wave dt status
wave dt doctor
```

新建 token 项目时运行：

```bash
wave dt init
```

进入已有 token 项目目录后运行：

```bash
wave dt build
wave dt wcag
```

维护 token 身份和旧写法迁移时运行（两者默认只输出报告，加 `--write` 才写回文件）：

```bash
wave dt ids
wave dt migrate-extensions
```

需要创建 named profile 时，先登记基础身份，再生成完整源值快照：

```bash
wave dt ids -f ./main.yaml
wave dt ids --write -f ./main.yaml
wave dt new-profile mobile -f ./main.yaml
wave dt build --profile mobile -f ./main.yaml
```

`new-profile` 会写入新文件；完整前提、差量规则与名称限制见 [WCAG 与主题模式](/design-token/quality-theming)。`migrate-extensions` 只迁移旧扩展字段名，不迁移旧独立 profile。

`wave dt doctor` 默认检查 main 与全部 profile 的结构和身份健康；`--profile` 只检查选中项，`--json` 和 `--status` 保留相同诊断与错误退出状态。

需要刷新本地 resource cache 时运行 `wave dt update`。

`wave design-token` 与 `wave dt` 等价。

## 素材压缩

把 `./assets` 换成你的素材目录：

```bash
wave compress ./assets --dry-run
wave compress doctor
wave compress install --check
```

## 动效生成

把 `./frames` 换成至少包含 2 张 PNG 帧的目录：

```bash
wave motion gif ./frames --fps 24 --out loading.gif
wave motion apng ./frames --fps 24 --out loading.png
wave motion doctor
wave motion install --check
```

`wave mg` 与 `wave motion` 等价。

## 工作区

把 `/path/to/workspace.yaml` 换成真实配置路径。`wave workspace` 会进入交互流程。

```bash
wave workspace --help
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```
