---
title: 素材压缩
description: 压缩 PNG、JPG、SVG 和 GIF，支持预览、递归扫描和 SVG 图标清洗。
category: 素材
commands:
  - wave compress --help
  - wave compress doctor
  - wave compress install --check
appliesTo:
  - 本地 CLI
---

## 用途

`wave compress` 压缩已有设计素材，不生成动效。它默认先预览，再询问是否写入。

## 预览

把 `./assets` 换成你的素材文件或目录：

```bash
wave compress ./assets --dry-run
```

`--dry-run` 只展示压缩结果，不写入文件。

## 写入输出

```bash
wave compress ./assets --yes
wave compress ./assets --type png --recursive --yes
wave compress ./assets --out ./optimized --yes
```

默认输出到输入目录下的 `wave-compress/`，不覆盖源文件。

## 限制类型

```bash
wave compress ./assets --type png
wave compress ./assets --type jpg --type png
wave compress ./assets --type svg
wave compress ./assets --type gif
```

## SVG 图标清洗

```bash
wave compress ./assets --type svg --icon --yes
```

`--icon` 用于清理 SVG 图标颜色，让图标更容易通过 CSS 重新着色。

## 检查和安装工具

```bash
wave compress doctor
wave compress install --check
```

确认安装计划后，再添加 `--yes` 执行安装。

压缩依赖本机工具，例如 `oxipng`、`pngquant`、`svgo`、`gifsicle`、`jpegtran` 或 `mozjpeg`。
