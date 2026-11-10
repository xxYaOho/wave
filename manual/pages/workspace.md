---
title: 工作区创建
description: 按本地配置创建设计项目目录，并控制目标位置和已有内容。
category: 工作区
commands:
  - wave workspace
appliesTo:
  - 本地 CLI
---

## 创建工作区

```bash
wave workspace
```

命令按配置询问项目名称、类型、版本和标签，然后创建目录结构与 README。不再需要 `create` 子命令。

只查看计划：

```bash
wave workspace --dry-run
```

跳过写入确认：

```bash
wave workspace --yes
```

## 指定目标

```bash
wave workspace --output ./my-project --yes
```

`--output` 直接指定最终工作区目录，不是父目录。逻辑项目名称仍来自交互答案。

目标已存在时默认拒绝。使用 `--force` 后，Wave 只覆盖本次计划生成的 README 和占位文件，保留目录中的其他文件，不递归删除内容。目标是普通文件或 symlink 时仍拒绝。

## 配置文件

默认路径：

```text
~/.config/wave/workspace.yaml
```

使用其他配置：

```bash
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```

文件不存在时使用内置默认配置。`WAVE_WORKSPACE_CONFIG` 只影响 workspace，不影响 token resource cache。
