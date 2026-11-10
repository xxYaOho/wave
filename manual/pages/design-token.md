---
title: Design Token 概览
description: 使用 token 模块构建产物、创建源文档、检查质量和维护资源。
category: Design Token
commands:
  - wave token
  - wave token build
appliesTo:
  - 本地 CLI
---

## 默认构建

进入包含 `main.yaml` 的目录后运行：

```bash
wave token
```

它等价于：

```bash
wave token build
```

输出平台由 `main.yaml` 的 `$config.parameter.platform` 或 parameter groups 决定。命令行不再提供 `--platform`；需要调整平台时修改配置。

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, css]
```

## 命令分组

| 分组 | 命令 |
| --- | --- |
| 构建 | `build` |
| 创建 | `new`、`new profile`、`new night` |
| 检查 | `doctor`、`wcag` |
| 身份维护 | `ids` |
| 迁移 | `migrate extensions` |
| 资源 | `show`、`update`、`status` |

使用 `-m` 获取某一级的完整 Markdown 手册：

```bash
wave token -m
wave token new -m
wave token new night -m
```

## 源文档输入

`-f, --file` 指定本次操作的源文档：

```bash
wave token build
wave token build -f ./themes/acme
wave token build -f ./themes/acme/main.yaml
wave token build -f ./themes/acme/themes/mobile.yaml
```

规则：

- 省略 `-f`：读取 `./main.yaml`。
- 输入目录：读取该目录下的 `main.yaml`。
- 输入 `main.yaml`：处理 default profile。
- 输入其他 Day YAML：处理该 profile，并从最近的祖先目录查找 base `main.yaml`。
- 输入 `@night.yaml`：拒绝。Night 不是 Day 源文档。

目录可以命名为 `profiles`、`themes`、`variants` 或其他名称。显式 `-f` 不依赖目录名。

## 构建范围

```bash
# 只构建 main
wave token build -f ./themes/acme

# 只构建指定 profile
wave token build -f ./themes/acme/themes/mobile.yaml

# 按 workspace 的既有发现规则构建 main 和全部 named profiles
wave token build -f ./themes/acme --profiles all

# 同时消费约定位置的 Night overlay
wave token build -f ./themes/acme/themes/mobile.yaml --night
```

`--profiles all` 只能与 main 文件或目录一起使用，不能和单个 profile 文件组合。它不会递归猜测所有目录中的 YAML。

## 输出

所有 token 构建产物都可以通过 `-o, --output` 覆盖配置中的输出目录：

```bash
wave token build -f ./main.yaml --output ./dist
```

输出路径碰撞会在写入前失败。Profile、Night 等源文档的创建规则见各自手册。

## 检查与维护

```bash
wave token doctor -f ./main.yaml
wave token wcag -f ./main.yaml
wave token ids -f ./main.yaml
wave token migrate extensions -f ./main.yaml
```

`doctor` 不执行 WCAG。`ids` 和 `migrate extensions` 默认只输出报告，加 `--write` 才修改源文件。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `main.yaml` | base token 树、default profile 和 `$config` |
| Day profile YAML | 按 token ID 覆盖 base 值或添加 token |
| `<stem>@night.yaml` | Day 文档的 Night 路径覆盖 |
| `$config.resource` | 提供引用数据，不直接决定输出 |

Profile 和 Night 的创建、消费与自定义输出规则见对应命令手册。Token 写法见 [main.yaml 写法](/design-token/main-yaml)。
