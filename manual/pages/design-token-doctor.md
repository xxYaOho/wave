---
title: 检查 Token Workspace
description: 使用 token doctor 检查结构、resource、身份和既有输出目录。
category: Design Token
commands:
  - wave token doctor
appliesTo:
  - 本地 CLI
---

## 用法

```bash
wave token doctor
wave token doctor -f ./main.yaml
wave token doctor -f ./themes/mobile.yaml
```

`-f` 接受 main、包含 main 的目录或任意目录中的 Day profile。默认 main 输入检查 main 与既有发现规则下的 named profiles；显式 profile 文件只检查所选目标。

## 检查范围

- main/profile 结构和 base 关联。
- `$override` 命中与冗余覆盖。
- 文档和 token 身份冲突。
- 当前选中目标声明的全部 resource，包括未被引用的声明。
- 可迁移的旧 `theme.dimension` 用法。

冗余覆盖只产生 info，不改变成功状态。结构错误、身份冲突和无效 resource 会导致非零退出。

## 输出目录检查

```bash
wave token doctor -f ./main.yaml --output ./dist
```

`--output` 检查既有输出目录。目录不存在或路径不是目录时，检查失败。这里不创建输出，也不执行 build。

## 输出模式

```bash
wave token doctor --status
wave token doctor --verbose
wave token doctor --json
```

三种模式共用 findings 和退出状态。JSON 附带结构化 findings 与 identity；verbose 展开完整身份明细。

## 边界

Token doctor 不执行 WCAG。对比度使用：

```bash
wave token wcag -f ./main.yaml
```

全局运行环境和工具链使用 `wave doctor`，压缩与动效工具分别使用 `wave compress doctor`、`wave motion doctor`。
