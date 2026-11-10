---
title: 内置资源
description: 浏览、更新和检查 Wave 的 design-token 引用资源。
category: Design Token
commands:
  - wave token show
  - wave token update
  - wave token status
appliesTo:
  - 本地 CLI
---

## 浏览资源

```bash
wave token show
wave token show palette
wave token show dimension
wave token show tailwindcss
wave token show leonardo --format yaml
wave token show wave --format json
```

| `--format` | 输出 |
| --- | --- |
| `flat-json` | 扁平 key-value，默认 |
| `json` | 嵌套 JSON |
| `yaml` | 原始 YAML |

Resource 只参与引用解析，不直接决定输出内容。

## 更新缓存

```bash
wave token update
wave token update tailwindcss
wave token update tailwindcss --version 4
wave token update leonardo
```

未指定名称时更新全部支持的资源。

## 查看状态

```bash
wave token status
```

状态包含 cache、state、config 路径，以及 Tailwind CSS 和 Leonardo 的缓存情况。

## 常用资源

| 资源 | 用途 |
| --- | --- |
| `tailwindcss` | Tailwind 色板 |
| `leonardo` | Leonardo light/dark 色板 |
| `wave` | Wave 内置尺寸系统 |
