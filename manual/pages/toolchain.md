---
title: 安装与工具链
description: 安装开发依赖，检查和安装 Wave 需要的本地工具。
category: 开始
commands:
  - wave doctor
  - wave install --check
  - wave install --help
appliesTo:
  - 本地 CLI
---

## 用途

Wave 自身由 Bun 运行，项目依赖由 pnpm 管理，本地工具链由 mise 和系统工具提供。Wave 不把图片压缩和动效编码工具打包进 CLI。

## 开发环境

```bash
mise install
pnpm install
pnpm dev -- --version
```

## 检查环境

```bash
wave doctor
wave doctor --status
wave doctor --json
```

`doctor` 会检查 Wave 运行环境和推荐工具。模块命令也提供独立检查：

```bash
wave compress doctor
wave motion doctor
```

## 查看安装计划

```bash
wave install --check
wave compress install --check
wave motion install --check
```

## 执行安装

确认安装计划后，再给对应 install 命令添加 `--yes` 执行安装。安装命令会调用项目中的 mise task。缺少 mise 时，Wave 会提示先安装 mise。

## 工具分组

| 模块 | 本地工具 |
| --- | --- |
| compress | `oxipng`, `pngquant`, `svgo`, `gifsicle`, `jpegtran` 或 `mozjpeg` |
| motion | `gifski`, `apngasm` |
