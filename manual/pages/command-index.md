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

进入已有 `themefile` 的 token 项目目录后运行：

```bash
wave dt build -f ./themefile
wave dt wcag
```

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

## 旧入口

```bash
wave create
wave init
wave show
```

旧入口仍可使用。新脚本优先使用模块化入口。
