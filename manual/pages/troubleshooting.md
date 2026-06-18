---
title: 故障排除
description: 常见错误、检查命令和处理方式。
category: 参考
commands:
  - wave doctor
  - wave dt doctor
  - wave compress doctor
  - wave motion doctor
appliesTo:
  - 本地 CLI
---

## 不知道从哪里开始

先运行：

```bash
wave --help
wave doctor --status
```

`--help` 查看命令入口，`doctor` 检查本地环境。

## 找不到 main.yaml

`wave dt` 默认读取当前目录的 `main.yaml`。如果项目是通过 `wave dt init` 创建的，优先使用生成的 `themefile`：

```bash
wave dt build -f ./themefile
```

直接指定 `main.yaml` 时，这个文件需要包含 `$config`。`wave dt init` 生成的 `main.yaml` 只保存 token 内容，不包含 `$config`。如果不确定，先使用 `themefile` 入口。

新项目可以先运行：

```bash
wave dt init
```

然后构建：

```bash
wave dt build -f ./themefile
```

## main.yaml 缺少 $config

直接把 `main.yaml` 作为输入时，文件需要包含 `$config`。如果看到 `Missing required $config in main.yaml entry`，可以改用 `themefile` 构建：

```bash
wave dt build -f ./themefile
```

也可以在 `main.yaml` 中补齐 `$config`，再运行 `wave dt`。

## 压缩工具缺失

运行：

```bash
wave compress doctor
wave compress install --check
```

确认安装计划后执行：

确认安装计划后，再运行 `wave compress install --yes`。

## 动效工具缺失

运行：

```bash
wave motion doctor
wave motion install --check
```

确认安装计划后执行：

确认安装计划后，再运行 `wave motion install --yes`。

## 输出文件已存在

部分命令默认不覆盖已有输出。确认可以覆盖时再使用覆盖选项：

```bash
wave motion gif ./frames --force
```

素材压缩优先使用 `--out` 输出到新目录：

```bash
wave compress ./assets --out ./optimized --yes
```
