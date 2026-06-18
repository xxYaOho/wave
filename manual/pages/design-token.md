---
title: Design Token
description: 读取 themefile 或带 $config 的 main.yaml，生成 json、jsonc、css 和 sketch 输出。
category: 能力
commands:
  - wave dt doctor
  - wave dt --help
  - wave dt status
appliesTo:
  - 本地 CLI
---

## 用途

`wave dt` 是 design token 主入口。它默认读取当前目录的 `main.yaml`，也可以通过 `-f` 指定 `themefile` 或其他输入文件。

## 初始化

```bash
wave dt init
```

初始化会创建 `themefile` 和 `main.yaml`。`themefile` 声明数据源和输出参数，`main.yaml` 保存 token 内容。初始化后的项目优先用 `themefile` 构建。

## 初始化后的构建

```bash
wave dt build -f ./themefile
wave dt build -f ./themefile --platform json,css
```

## 构建

```bash
wave dt build -f ./themefile
wave dt build -f ./themefile --platform json,css
wave dt build -f ./themefile --no-night
wave dt build -f ./themefile --no-variants
```

直接运行 `wave dt` 或 `wave dt build` 时，Wave 会读取当前目录的 `main.yaml`。这个文件需要包含 `$config`。如果项目来自 `wave dt init` 或旧式模板，使用 `themefile` 作为入口。

指定变体前，需要先创建对应的变体文件。例如项目中已经存在 `variants/dark.yaml` 时，才使用 `wave dt build -f ./themefile --variant dark`。

## 可直接构建的 main.yaml

```yaml
$config:
  theme: example
  resource:
    palette:
      - tailwindcss
    dimension:
      - wave
  parameter:
    outputDir: ./build
    platform:
      - json
    night: false
    variants: false
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss.color.indigo.600}"
```

## 输出格式

| 平台 | 文件 |
| --- | --- |
| `json` | `{theme}.json` |
| `jsonc` | `{theme}.jsonc` |
| `css` | `{theme}.css` |
| `sketch` | `{theme}2sketch.json` |

## 对比度检查

进入 token 项目目录后运行：

```bash
wave dt wcag
```

`wave dt wcag` 用于检查主题中的颜色对比度配置。不传 scope 时检查 main。只有项目中已经存在对应变体和 night 配置时，才指定变体 scope 或 `--night`。例如检查 `dark` 的 night 版本前，需要先存在 `variants/dark@night.yaml`，再使用 `wave dt wcag dark --night`。

## 旧入口

`wave create` 仍可用于旧项目，默认读取 `themefile`。新脚本优先使用 `wave dt`。
