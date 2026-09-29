---
title: Design Token 概览
description: 配置 main.yaml、profile、$extensions，并生成 json、jsonc、css 和 sketch 输出。
category: Design Token
commands:
  - wave dt init
  - wave dt build
  - wave dt status
appliesTo:
  - 本地 CLI
---

## 用途

`wave dt` 用来读取 design token，解析引用，转换扩展字段，并生成 `json`、`jsonc`、`css` 或 `sketch` 输出。

新项目推荐从模板开始：

```bash
wave dt init
wave dt build
```

## 项目入口

`main.yaml` 是唯一的 design-token 项目入口。`wave dt init` 生成的文件已包含 `$config`：

```bash
wave dt build
```

也可以显式指定入口：

```bash
wave dt build -f ./main.yaml
```

显式路径也必须指向名为 `main.yaml` 的普通文件。Profile、Night Mode 文件、resource 文件和目录不能作为入口。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `main.yaml` | 基础 token 树、default profile 和 `$config` 来源 |
| `profiles/<name>.yaml` | 基于 main 的差量 profile：按 token ID 覆盖值，也可增加新 token |
| `main@night.yaml` | default profile 的 Night Mode 覆盖文件，可选 |
| `profiles/<name>@night.yaml` | named profile 的 Night Mode 覆盖文件，可选 |

`$config.resource` 是可选的外部引用依赖声明，只提供引用解析数据，不直接决定输出内容。自包含的 token 图无需声明 resource。

build 以 token 图能否完整解析和生成作为成功条件。未被引用的缺失、损坏或重复 resource 声明不会阻塞 build；`wave dt doctor` 会严格检查当前检查目标中的全部声明。默认 doctor 检查 main 和全部 profile 的结构与身份健康，但 resource 严格检查仍只针对 default profile；`--profile` 则只检查选中的 profile。

`$config` 使用闭合结构。字段名、类型或枚举值无效时，build 会指出对应字段路径并停止生成。完整字段和多组输出写法见 [main.yaml 写法](/design-token/main-yaml)。

Profile 共享 main 的结构和扩展，只替换基础 token 的完整 `$value` 或添加新 token。创建 profile 前先登记 main 的文档和 token 身份，再运行 `wave dt new-profile <name>`。需要删除基础 token、改变结构或修改已有扩展时，应另建基础目录。完整写法见 [WCAG 与主题模式](/design-token/quality-theming)。

## 命令行覆盖

命令行参数优先级高于配置文件：

```bash
wave dt build --platform json,css -o ./dist
```
