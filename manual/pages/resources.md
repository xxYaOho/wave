---
title: 内置资源
description: 浏览和更新 Wave 的 design-token 资源。
category: Design Token
commands:
  - wave dt show
  - wave dt status
  - wave dt show tailwindcss
appliesTo:
  - 本地 CLI
---

## 用途

内置资源为 design token 构建提供引用数据。资源只参与引用解析，不直接决定输出内容。

## 查看资源

```bash
wave dt show
wave dt show palette
wave dt show dimension
wave dt show tailwindcss
wave dt show leonardo --format yaml
wave dt show wave --format json
wave dt show tailwindcss --format flat-json
```

输出格式：

| 格式 | 说明 |
| --- | --- |
| `flat-json` | 扁平 key-value，默认格式 |
| `json` | 嵌套 JSON |
| `yaml` | 原始 YAML 内容 |

## 更新资源缓存

```bash
wave dt update
wave dt update tailwindcss
wave dt update tailwindcss --version 4
wave dt update leonardo
```

`update` 会显式更新本地 design-token resource cache。

## 查看缓存状态

```bash
wave dt status
```

状态输出包含 cache、state、config 路径，以及 tailwindcss 和 leonardo 的缓存情况。

## 常用资源

| 资源 | 用途 |
| --- | --- |
| `tailwindcss` | Tailwind 色板 |
| `leonardo` | Leonardo light/dark 色板 |
| `wave` | Wave 内置尺寸系统 |
