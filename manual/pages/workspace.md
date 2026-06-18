---
title: 工作区创建
description: 按配置创建本地设计项目目录。
category: 能力
commands:
  - wave workspace --help
appliesTo:
  - 本地 CLI
---

## 用途

`wave workspace` 用来创建本地设计项目目录。它按配置生成目录结构和项目 README。

## 创建工作区

```bash
wave workspace
wave workspace create
```

命令会进入交互流程，根据项目名称、版本号和配置创建目录。

## 配置文件

默认配置路径：

```text
~/.config/wave/workspace.yaml
```

如果文件不存在，Wave 使用内置默认配置。

## 使用自定义配置路径

把 `/path/to/workspace.yaml` 换成真实配置路径。命令会进入创建工作区的交互流程。

```bash
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```

`WAVE_WORKSPACE_CONFIG` 只影响 workspace 配置，不影响 design-token resource cache。

## 输出结果

创建成功后，Wave 会打印工作区路径和生成的主要文件。配置允许控制目录模板、命名、版本号和 Finder 打开行为。
