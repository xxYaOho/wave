---
title: 维护 Token 身份
description: 使用 token ids 报告或写回 main、Day profile 和 token 的 $id。
category: Design Token
commands:
  - wave token ids
appliesTo:
  - 本地 CLI
---

## 默认只报告

```bash
wave token ids -f ./main.yaml
```

报告文档身份、已登记与未登记 token、空槽位、非规范形式和跨文件冲突，不修改文件。

## 写回身份

确认报告后运行：

```bash
wave token ids --write -f ./main.yaml
```

写回范围包括 main 与既有发现规则下的 Day profiles。缺少或为空的身份槽位会被补齐，已有文档根 ID 不会重发。`$override` 和 Night 文件不参与写入。

写入默认要求 Git 工作区干净。确认保留当前未提交修改时，才使用：

```bash
wave token ids --write --allow-dirty -f ./main.yaml
```

## 身份规则

- main 和每个 Day profile 可以在根部声明自己的文档 `$id`。
- token `$id` 写在 token 上；group 不声明 `$id`。
- 不写表示未登记；`null` 或空白字符串表示预留槽位。
- 同一主题内的 token 身份必须唯一。
- Night 禁止根 `$id`，沿用 Day 身份。

Profile 的 `$config.base` 必须等于 main 已登记的根 `$id`。存在 profile 而 main 未登记、base 不匹配或 token ID 冲突时，ids 拒绝写入任何文件。不要通过重发 main 身份绕过冲突。

## 创建后续内容

登记 base 后创建 profile：

```bash
wave token new profile mobile -f ./main.yaml
```

Profile 创建前提与输出规则见 [创建 Workspace 与 Profile](/design-token/create)。
