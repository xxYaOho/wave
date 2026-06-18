---
title: 快速开始
description: 从安装依赖到运行第一个 Wave 命令。
category: 开始
commands:
  - wave --help
  - wave dt --help
appliesTo:
  - 本地 CLI
---

## 用途

Wave 把 design token、素材压缩、PNG 帧动效、工作区创建和本地工具链检查放在一个 CLI 中。

## 准备环境

```bash
mise install
pnpm install
pnpm dev -- --help
```

开发环境中，用 `pnpm dev --` 代替已安装的 `wave` 命令。

## 常用入口

Design Token 命令需要在已有 `themefile` 的 token 项目目录中运行；新项目先执行 `wave dt init`。

```bash
wave dt build -f ./themefile
```

素材和动效命令需要替换为你自己的素材目录：

```bash
wave compress ./assets --dry-run
wave motion gif ./frames --fps 24 --out loading.gif
```

其他入口：

```bash
wave workspace --help
wave doctor --status
```

## 选择下一步

- 需要生成设计变量，进入 Design Token。
- 需要压缩交付素材，进入素材压缩。
- 需要把 PNG 帧变成 GIF 或 APNG，进入动效生成。
- 需要创建本地项目目录，进入工作区创建。
- 不确定本机工具是否齐全，先运行 `wave doctor --status`。
