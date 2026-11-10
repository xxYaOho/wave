---
title: 创建 Night Overlay
description: 从 Day main 或 Day profile 生成 Night overlay，并控制输出位置和覆盖行为。
category: Design Token
commands:
  - wave token new night
appliesTo:
  - 本地 CLI
---

## 用途

从已有 Day 源文档生成路径式 Night overlay：

```bash
wave token new night
wave token new night -f ./themes/acme
wave token new night -f ./themes/acme/themes/mobile.yaml
```

命令会完成 base/profile 合并、resource 加载和引用解析，再从解析后的 Day 颜色派生 Night。它不会修改 Day 源文件。

## 输入

| 输入 | Day 源文档 |
| --- | --- |
| 省略 `-f` | `./main.yaml` |
| `-f <directory>` | `<directory>/main.yaml` |
| `-f <main.yaml>` | 指定 main |
| `-f <other-day.yaml>` | 指定 profile |

Profile 可以位于 `profiles`、`themes`、`variants` 或其他目录。Wave 从最近祖先目录查找 base `main.yaml`，并核验 profile 的 `$config.base`。

不要传入 `@night.yaml`、resource 文件或缺少 base 的独立 YAML。

## 默认输出

输出文件位于 Day 源文档旁：

```text
main.yaml                 → main@night.yaml
themes/mobile.yaml        → themes/mobile@night.yaml
variants/mobile.yaml      → variants/mobile@night.yaml
```

固定命名让以下命令能自动找到 overlay：

```bash
wave token build -f <Day 源文档> --night
```

## 自定义输出

使用 `-o, --output` 指定其他 YAML 文件：

```bash
wave token new night -f ./themes/acme/themes/mobile.yaml --output ./drafts/mobile-night.yaml
```

自定义位置不会被默认 build 自动发现。需要消费时：

1. 将内容移回该 Day 源文档旁的 `mobile@night.yaml`。
2. 运行原 Day profile 的构建：

```bash
wave token build -f ./themes/acme/themes/mobile.yaml --night
```

只构建 main 不会消费 profile 的 Night。

## 覆盖与预览

目标已存在时，默认拒绝并保持原文件不变：

```bash
wave token new night -f ./main.yaml
```

确认覆盖时使用：

```bash
wave token new night -f ./main.yaml --force
```

只查看生成计划且不写文件：

```bash
wave token new night -f ./main.yaml --dry-run
```

`--force` 只覆盖目标 overlay，不修改 Day、base 或其他文件。目标为目录或 symlink 时仍会拒绝。

## 外观参数

```bash
wave token new night --scene candle-light
wave token new night --luminance 0.55
wave token new night --luminance-ev high
```

| 参数 | 取值 |
| --- | --- |
| `--scene` | `moon`、`night-light`、`night`、`candle-light`、`sunset` |
| `--luminance` | 0 到 1 的 Primary Night 明度拨盘 |
| `--luminance-ev` | `minimal`、`low`、`medium`、`high`、`max` |

优先级：

```text
--luminance > --luminance-ev > $config.night > 内置默认值
```

Scene 使用 `--scene > $config.night.scene > night`。`--luminance` 控制明度，不是彩度；旧 `--chroma` 和 `--chroma-ev` 不再接受。

## 内容合同

Overlay 只包含 `theme.color` 和 `theme.state` 中已有路径的 `$value` 覆盖，不写根 `$id`。Day 与 Night 共用主题身份，Sketch 通过 `meta.mode=night` 区分外观。

生成后可运行：

```bash
wave token doctor -f <Day 源文档>
wave token wcag -f <Day 源文档> --night
wave token build -f <Day 源文档> --night
```
