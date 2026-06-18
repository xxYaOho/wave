---
title: 配置路径
description: Wave 使用到的本地配置、缓存和输出路径。
category: 参考
commands:
  - wave dt status
  - wave workspace --help
appliesTo:
  - 本地 CLI
---

## Workspace 配置

默认路径：

```text
~/.config/wave/workspace.yaml
```

覆盖路径：

把 `/path/to/workspace.yaml` 换成真实配置路径。命令会进入 workspace 创建交互流程。

```bash
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```

## Resource cache 状态

查看 design-token resource cache：

```bash
wave dt status
```

输出包含：

- cache 路径
- state 路径
- config 路径
- tailwindcss 缓存状态
- leonardo 缓存状态

## Design Token 输出

`themefile` 中可设置输出目录：

```text
THEME example
RESOURCE palette tailwindcss
RESOURCE dimension wave
PARAMETER output ./dist
PARAMETER platform json,css
```

进入已有 `themefile` 的 token 项目目录后，命令行也可覆盖：

```bash
wave dt build -f ./themefile -o ./dist
```

## Compress 输出

默认输出到输入目录下的：

```text
wave-compress/
```

也可以指定：

```bash
wave compress ./assets --out ./optimized --yes
```
