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

开发环境中，用 `pnpm dev -- dt ...` 代替已安装的 `wave dt ...`。

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
| `main.yaml` | default profile、token 内容和 `$config` 来源 |
| `profiles/<name>.yaml` | named profile，可选 |
| `main@night.yaml` | default profile 的 Night Mode 覆盖文件，可选 |
| `profiles/<name>@night.yaml` | named profile 的 Night Mode 覆盖文件，可选 |

`$config.resource` 是可选的外部引用依赖声明，只提供引用解析数据，不直接决定输出内容。自包含的 token 图无需声明 resource。

build 以 token 图能否完整解析和生成作为成功条件。未被引用的缺失、损坏或重复 resource 声明不会阻塞 build；`wave dt doctor` 会严格检查当前检查目标中的全部声明。

`$config` 使用闭合结构。字段名、类型或枚举值无效时，build 会指出对应字段路径并停止生成。完整字段和多组输出写法见 [main.yaml 写法](/design-token/main-yaml)。

## 命令行覆盖

命令行参数优先级高于配置文件：

```bash
wave dt build --platform json,css -o ./dist
```
