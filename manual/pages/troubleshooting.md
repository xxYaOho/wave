---
title: 故障排除
description: 使用正确的检查入口定位环境、源文档、写入和工具链问题。
category: 参考
commands:
  - wave doctor
  - wave token doctor
  - wave token wcag
  - wave compress doctor
  - wave motion doctor
appliesTo:
  - 本地 CLI
---

## 不知道从哪里开始

```bash
wave --help
wave -m
wave doctor --status
```

`--help` 查看简洁命令帮助，`-m` 打印当前范围的 Markdown 手册，`doctor` 检查本地工具链。

## 找不到 main.yaml

`wave token` 默认读取当前目录的 `main.yaml`。新项目先运行：

```bash
wave token new
wave token
```

已有项目使用 `-f`：

```bash
wave token build -f /path/to/main.yaml
wave token build -f /path/to/workspace-directory
```

## main.yaml 缺少 $config

入口必须包含有效 `$config`：

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, css]
```

使用 `wave token doctor -f ./main.yaml` 检查结构和 resource。

## Profile 无法构建

```bash
wave token doctor -f /path/to/profile.yaml
wave token ids -f /path/to/main.yaml
```

检查：

- profile 位于 base main 所在目录或其子目录。
- `$config.base` 等于 main 原有根 `$id`。
- `$override` 使用已登记的 token `$id`。
- 新 token 类型可在 profile 自身判定。

需要创建 profile 时，先登记 base，再运行 `wave token new profile <name> -f ./main.yaml`。

## Night 没有被构建

确认 overlay 位于 Day 源文档旁，并命名为 `<stem>@night.yaml`。然后显式选择原 Day 源：

```bash
wave token build -f /path/to/day-or-profile.yaml --night
```

自定义 `--output` 位置不会被自动发现。Profile Night 不能只通过构建 main 来消费。

## 输出已存在

新建源文档和动效默认不覆盖已有目标。先使用 `--dry-run` 查看计划，确认覆盖后再加 `--force`：

```bash
wave token new night -f ./main.yaml --force
wave motion -f ./frames --format gif --force
```

`--yes` 只跳过确认，不授予覆盖权限。

## 工具缺失

```bash
wave compress doctor
wave compress install --check
wave motion doctor
wave motion install --check
```

确认安装计划后，才运行对应的 `install --yes`。

## 命令不存在

当前唯一 token 入口是 `wave token`，motion 不提供 `mg`。常见迁移：

| 旧写法 | 当前写法 |
| --- | --- |
| `wave dt build` | `wave token build` |
| `wave dt init` | `wave token new` |
| `wave night` | `wave token new night` |
| `wave compress run` | `wave compress` |
| `wave motion gif` | `wave motion --format gif` |
| `wave workspace create` | `wave workspace` |
| `--out` | `--output` |
