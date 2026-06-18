---
title: 动效生成
description: 从 PNG 帧目录生成 GIF 或 APNG。
category: 能力
commands:
  - wave motion --help
  - wave motion doctor
  - wave motion install --check
appliesTo:
  - 本地 CLI
---

## 用途

`wave motion` 从 PNG 帧目录生成 GIF 或 APNG。`wave mg` 是 `wave motion` 的别名。

## 生成 GIF

把 `./frames` 换成至少包含 2 张 PNG 帧的目录：

```bash
wave motion gif ./frames --fps 24 --out loading.gif
wave mg gif ./frames
```

## 生成 APNG

把 `./frames` 换成至少包含 2 张 PNG 帧的目录：

```bash
wave motion apng ./frames --fps 24 --out loading.png
wave mg apng ./frames
```

## 默认行为

- 输入必须是 PNG 帧目录。
- 不修改源帧目录。
- 输出文件已存在时默认报错。
- 使用 `--force` 才允许覆盖已有输出。
- 使用 `--dry-run` 只展示计划，不生成文件。

## 检查和安装工具

```bash
wave motion doctor
wave motion doctor ./frames
wave motion install --check
```

确认安装计划后，再添加 `--yes` 执行安装。

动效生成依赖本机工具，例如 `gifski` 和 `apngasm`。
