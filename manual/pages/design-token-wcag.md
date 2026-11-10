---
title: 检查 WCAG 对比度
description: 使用 token wcag 检查 main、profile 或 Night 的颜色对比度。
category: Design Token
commands:
  - wave token wcag
appliesTo:
  - 本地 CLI
---

## 声明检查项

在 `main.yaml` 根部声明：

```yaml
doctor:
  wcagPairs:
    primary-on-surface:
      foreground: "{theme.color.primary}"
      background: "{theme.color.surface}"
```

每个 pair 必须包含 `foreground` 和 `background`。两个值都必须是 alias 字符串，并指向已解析的 color token。

`doctor` 根键不参与 token 输出。

## 运行检查

```bash
wave token wcag
wave token wcag -f ./main.yaml
wave token wcag -f ./themes/mobile.yaml
wave token wcag -f ./themes/mobile.yaml --night
```

`-f` 直接选择 main 或 Day profile，不使用 `[scope]` 或 `--profile`。`--night` 读取当前 Day 源文档旁的约定 overlay。

## 评分

| 维度 | AA | AAA |
| --- | --- | --- |
| Normal Text | 4.5 | 7 |
| Large Text | 3 | 4.5 |
| UI Components | 3 | 不提供 AAA 判定 |

阈值使用未四舍五入的 ratio。红色评分是报告，不阻断命令；无效 schema、未解析引用、非 color 输入或 alpha 未合成等情况会返回非零。

## 与其他检查的区别

`wave token doctor` 检查 workspace 健康，不执行 WCAG。`wave doctor` 只检查本地工具链。
