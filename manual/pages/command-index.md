---
title: 命令索引
description: 按任务查找 Wave 命令，并获取对应层级的 Markdown 手册。
category: 参考
commands:
  - wave
appliesTo:
  - 本地 CLI
---

## 常用命令

```bash
wave token
wave compress -f ./assets --dry-run
wave motion -f ./frames --format gif --dry-run
wave workspace --dry-run
```

`wave token` 默认构建当前目录的 `main.yaml`。压缩、动效和工作区命令也直接执行各自任务，不需要额外的 `run`、`gif` 或 `create` 子命令。

## Design Token

| 命令 | 用途 |
| --- | --- |
| `wave token build` | 生成 token 产物 |
| `wave token new` | 创建 token workspace |
| `wave token new profile <name>` | 从已登记的 base 创建 profile |
| `wave token new night` | 从 Day main 或 profile 创建 Night overlay |
| `wave token doctor` | 检查 workspace、resource 和身份 |
| `wave token wcag` | 检查颜色对比度 |
| `wave token ids` | 报告或写回文档与 token 身份 |
| `wave token migrate extensions` | 迁移旧 `$extensions` 写法 |
| `wave token show` | 浏览内置资源 |
| `wave token update [name]` | 更新资源缓存 |
| `wave token status` | 查看资源缓存状态 |

裸命令 `wave token` 等价于 `wave token build`。`migrate` 没有默认迁移对象，必须写明 `extensions`。

## 素材工具链

```bash
wave compress doctor
wave compress install --check
wave motion doctor -f ./frames
wave motion install --check
```

`--check` 只查看安装计划。确认后才使用 `--yes` 执行安装。

## 全局命令

| 命令 | 用途 |
| --- | --- |
| `wave doctor` | 检查本地运行环境和工具链 |
| `wave install` | 查看或执行推荐工具安装 |
| `wave workspace` | 创建设计项目工作区 |
| `wave manual` | 启动可视化网页手册 |
| `wave version` | 显示版本号 |

## 获取手册

`--help` 提供简洁帮助。`-m, --manual` 输出当前命令范围的结构化 Markdown，适合 Agent 阅读：

```bash
wave -m
wave token -m
wave token new -m
wave token new night -m
wave token migrate extensions -m
```

文档模式不执行构建、创建、压缩或编码，也不启动网页服务。
