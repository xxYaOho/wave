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

## 选择入口

优先使用 `main.yaml` 作为构建入口。`wave dt init` 生成的 `main.yaml` 已包含 `$config`：

```bash
wave dt build
```

也可以显式指定入口：

```bash
wave dt build -f ./main.yaml
```

旧项目仍可指定兼容的 `themefile`，但新项目不再以 `themefile` 作为推荐入口。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `main.yaml` | default profile、token 内容和 `$config` 来源 |
| `profiles/<name>.yaml` | named profile，可选 |
| `main@night.yaml` | default profile 的 Night Mode 覆盖文件，可选 |
| `profiles/<name>@night.yaml` | named profile 的 Night Mode 覆盖文件，可选 |
| `themefile` | 旧项目兼容入口，可选 |

`$config.resource` 是可选的外部引用依赖声明，只提供引用解析数据，不直接决定输出内容。自包含的 token 图无需声明 resource。

build 以 token 图能否完整解析和生成作为成功条件。未被引用的缺失、损坏或重复 resource 声明不会阻塞 build；`wave dt doctor` 会严格检查当前检查目标中的全部声明。

## 旧 themefile 入口

`themefile` 只为旧项目临时保留兼容，不作为新项目推荐结构，后续 breaking 迭代将完整移除该入口。

最小示例：

```text
THEME example
RESOURCE palette tailwindcss
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER platform json,css
PARAMETER colorSpace hex
```

必填指令：

| 指令 | 说明 |
| --- | --- |
| `THEME <name>` | 主题名，也是输出文件名前缀，例如 `example.json` |
| `RESOURCE <kind> <ref>` | 引用解析资源，至少需要一条 |

`RESOURCE` 支持：

| kind | ref 示例 | 说明 |
| --- | --- | --- |
| `palette` | `tailwindcss` | 色板资源 |
| `dimension` | `wave` | 尺寸、透明度、曲线等资源 |
| `custom` | `./tokens/brand.yaml` | 自定义资源文件 |

`PARAMETER` 支持：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `output` | `./build` | 输出目录 |
| `platform` | `json,css,sketch` | 输出格式，支持 `json`、`jsonc`、`css`、`sketch` |
| `filterLayer` | `1` | 输出 key 时跳过前 N 层路径 |
| `colorSpace` | `oklch` | 颜色输出格式，支持 `hex`、`oklch`、`srgb`、`hsl` |

命令行参数优先级高于配置文件：

```bash
wave dt build --platform json,css -o ./dist
```

## 旧入口

`wave create` 仍可用于旧项目，默认读取 `themefile`。新脚本优先使用 `wave dt`。

无 `main.yaml` 时，legacy resource-direct fallback 仍要求有效的 palette 和 dimension；该行为不会扩展到新项目。
