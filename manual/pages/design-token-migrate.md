---
title: 迁移 Token 源文档
description: 使用 token migrate 命令组迁移旧扩展字段，并控制源文件写回。
category: Design Token
commands:
  - wave token migrate
  - wave token migrate extensions
appliesTo:
  - 本地 CLI
---

## 命令组

`wave token migrate` 不包含默认迁移对象。当前支持：

```bash
wave token migrate extensions -f ./main.yaml
```

`extensions` 将旧 `$extensions` 的 Sketch 家族写法迁移为 `platform.sketch`。它不迁移旧独立 profile，也不改变 token 值或输出平台。

## 报告与写回

默认只输出变更报告：

```bash
wave token migrate extensions -f ./main.yaml
```

确认报告后写回 main 和 workspace 中的 Day profiles：

```bash
wave token migrate extensions -f ./main.yaml --write
```

`-f` 接受 base `main.yaml` 或包含它的目录。不要把 resource、Night overlay 或单个 profile 当作该 workspace 迁移命令的入口。

写回只修改确认范围内的源 YAML。执行前检查报告，确保没有无关改动。

## 获取当前范围手册

```bash
wave token migrate -m
wave token migrate extensions -m
```

前者说明命令组和迁移对象，后者给出 extensions 的具体用法。
