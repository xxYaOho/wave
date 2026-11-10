---
title: 创建 Workspace 与 Profile
description: 使用 token new 创建基础工作区或从已登记 base 创建 profile。
category: Design Token
commands:
  - wave token new
  - wave token new profile
appliesTo:
  - 本地 CLI
---

## 创建 Token Workspace

```bash
wave token new
```

默认在当前目录创建包含 `$config` 的 `main.yaml`。指定其他目标目录：

```bash
wave token new --output ./my-tokens
```

目标是 `./my-tokens/main.yaml`。目录本身可以已存在，但目标 `main.yaml` 已存在时需要 `--force` 才会替换它。

只查看计划：

```bash
wave token new --output ./my-tokens --dry-run
```

## 创建 Named Profile

先登记 base 的文档和全部 token 身份：

```bash
wave token ids -f ./main.yaml
wave token ids --write -f ./main.yaml
```

再创建 profile：

```bash
wave token new profile mobile -f ./main.yaml
```

默认输出为 `<workspace>/profiles/mobile.yaml`。Profile 名称会转为小写，ASCII 空格转为 `_`；非法名称、重复名称和不合法的输出文件名会被拒绝。

## Profile 自定义输出

使用 `-o, --output` 指定文件：

```bash
wave token new profile mobile -f ./main.yaml --output ./themes/mobile.yaml
```

输出文件的 stem 必须等于规范化后的 profile 名称。例如 `mobile` 只能写为 `mobile.yaml`，不能写为 `desktop.yaml`。

如果输出位于 base `main.yaml` 所在目录或其子目录，可以直接构建：

```bash
wave token build -f ./themes/mobile.yaml
```

如果输出到 base 目录树之外，Wave 无法仅凭 `$config.base` 找到 main。先将同一 `mobile.yaml` 移到 base 可发现的目录树内，再通过 `-f` 构建。`--profiles all` 不会扫描任意外部位置。

## 写入安全

两个创建命令都遵循：

- 目标不存在：创建目标文件。
- 目标已存在：拒绝并保持字节不变。
- `--force`：只覆盖本次选定的目标文件。
- `--dry-run`：输出完整计划，不创建目录或文件。

Profile 的同名冲突与目标文件冲突分别检查。不能用自定义路径绕过同名 profile 冲突；只有冲突项就是当前输出目标时，`--force` 才允许替换。

## 生成结果

Profile 包含自己的文档 `$id`、指向 base 的 `$config.base`，以及 base token 的源值快照 `$override`。引用表达式保持原样，不预先物化。

创建后删除无需固定的冗余覆盖，让这些 token 继续跟随 base。需要 Night 时使用 [创建 Night Overlay](/design-token/night)。
