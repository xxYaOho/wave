---
title: 动效生成
description: 从 PNG 帧目录生成 GIF 或 APNG，并控制格式、输出和覆盖。
category: 素材
commands:
  - wave motion
  - wave motion doctor
  - wave motion install
appliesTo:
  - 本地 CLI
---

## 生成动效

```bash
wave motion -f ./frames --format gif
wave motion -f ./frames --format apng
```

输入目录至少需要两张 PNG 帧。非交互环境必须显式提供 `--format gif|apng`；TTY 中省略格式时可以交互选择。

## 输出

```bash
wave motion -f ./frames --format gif --output ./loading.gif
wave motion -f ./frames --format apng --output ./loading.png
```

默认输出到帧目录下的 `wave-mg/`，文件名包含帧目录名和 FPS。已有输出默认拒绝覆盖，确认后使用 `--force`。

只查看计划：

```bash
wave motion -f ./frames --format gif --dry-run
```

## 编码参数

```bash
wave motion -f ./frames --format gif --fps 24 --quality 80 --loop forever
```

| 参数 | 默认值 |
| --- | --- |
| `--fps <n>` | 24 |
| `-q, --quality <n>` | 80 |
| `--loop <mode>` | `forever`，也可选 `once` |

命令不会修改源帧。

## 工具链与帧检查

```bash
wave motion doctor
wave motion doctor -f ./frames
wave motion install --check
wave motion install --yes
```

`motion doctor` 的 `-f` 是可选 PNG 帧目录，用于同时检查帧输入。
