---
title: 素材压缩
description: 压缩 PNG、JPG、SVG 和 GIF，并控制预览、输出与写入。
category: 素材
commands:
  - wave compress
  - wave compress doctor
  - wave compress install
appliesTo:
  - 本地 CLI
---

## 预览压缩

```bash
wave compress -f ./assets --dry-run
```

输入可以是文件或目录，默认是当前目录。`--dry-run` 展示真实压缩结果，不写文件。

## 写入输出

```bash
wave compress -f ./assets --yes
wave compress -f ./assets --output ./optimized --yes
```

默认输出到输入目录下的 `wave-compress/`，不覆盖源文件。`--yes` 只跳过确认；已有输出仍需 `--force` 才允许覆盖。

## 选择范围与质量

```bash
wave compress -f ./assets --type png --type jpg --recursive
wave compress -f ./assets --type png --quality 80
```

`--type` 只接受重复参数，不使用逗号拼接。支持 `png`、`jpg`、`svg`、`gif`。

不传 `--quality` 时使用默认安全策略；传入 1–100 后启用有损质量模式。

## SVG 图标清洗

```bash
wave compress -f ./assets --type svg --icon --yes
```

`--icon` 清理 SVG 图标颜色，便于通过 CSS 重新着色。

## 工具链

```bash
wave compress doctor
wave compress install --check
wave compress install --yes
```

先检查工具，再查看安装计划，最后确认安装。
