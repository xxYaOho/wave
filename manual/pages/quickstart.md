---
title: 快速开始
description: 从本地环境检查进入第一个 Wave 设计交付任务。
category: 开始
commands:
  - wave --help
  - wave token --help
appliesTo:
  - 本地 CLI
---

## 准备环境

仓库开发环境使用 mise 和 pnpm：

```bash
mise install
pnpm install
pnpm dev -- --help
```

开发时用 `pnpm dev --` 代替已安装的 `wave`。

## 选择任务

### 构建 Design Token

```bash
wave token new
wave token
```

已有项目可以直接指定源文档：

```bash
wave token build -f ./main.yaml
```

### 压缩素材

```bash
wave compress -f ./assets --dry-run
```

### 生成动效

```bash
wave motion -f ./frames --format gif --dry-run
wave motion -f ./frames --format apng --dry-run
```

### 创建工作区

```bash
wave workspace --dry-run
```

## 检查环境

```bash
wave doctor --status
```

模块工具链分别使用 `wave compress doctor` 和 `wave motion doctor`。

## 获取使用手册

```bash
wave --help
wave token --help
wave token new night -m
wave manual
```

`--help` 显示简洁帮助；`-m` 打印当前范围的 Markdown 手册；`wave manual` 启动可视化网页。
