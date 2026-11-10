---
title: 配置路径
description: 查找 Wave 的 workspace 配置、resource 缓存和默认输出位置。
category: 参考
commands:
  - wave token status
  - wave workspace --help
appliesTo:
  - 本地 CLI
---

## Workspace 配置

```text
~/.config/wave/workspace.yaml
```

覆盖路径：

```bash
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```

## Resource Cache

```bash
wave token status
```

输出包含 cache、state、config 路径，以及 Tailwind CSS 和 Leonardo 的缓存状态。

## Token 输出

在 `main.yaml` 中配置：

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, css]
```

命令行覆盖本次输出目录：

```bash
wave token build -f ./main.yaml --output ./dist
```

平台列表只在 `$config` 中维护，不使用 CLI `--platform`。

## Profile 与 Night 输出

默认位置：

```text
profiles/<name>.yaml
<Day 所在目录>/<stem>@night.yaml
```

两者都允许 `--output` 自定义文件。自定义位置不扩大隐式发现范围；后续消费方式见对应创建手册。

## Compress 输出

```text
<input>/wave-compress/
```

覆盖输出目录：

```bash
wave compress -f ./assets --output ./optimized --yes
```

## Motion 输出

```text
<frames>/wave-mg/<frames-name>@<fps>fps.gif
<frames>/wave-mg/<frames-name>@<fps>fps.png
```

使用 `--output` 指定完整输出文件路径。
