---
title: WCAG 与主题模式
description: WCAG 对比度检查、Profile 与 Night Mode 的用法和常见错误处理。
category: Design Token
commands:
  - wave dt wcag
appliesTo:
  - 本地 CLI
---

## WCAG

`doctor` 是独立 root key，用于 WCAG 对比度检查，不参与 token 输出。

```yaml
doctor:
  wcagPairs:
    primary-on-surface:
      foreground: "{theme.color.primary}"
      background: "{theme.color.surface}"
```

规则：

- `doctor` 可选。
- 如果存在 `doctor`，必须包含 `wcagPairs`。
- 每个 pair 必须包含 `foreground` 和 `background`。
- 两个值都必须是 alias 字符串，并指向 color token。

运行：

```bash
wave dt wcag
wave dt wcag mobile
wave dt wcag mobile --night
wave dt wcag --profile mobile
```

## Doctor 检查范围

`wave dt doctor` 默认检查 `main.yaml` 中 default profile 声明的全部 resource。使用 `--profile` 时，只检查指定 profile：

```bash
wave dt doctor
wave dt doctor --profile mobile
```

顶层 `wave doctor` 只检查通用工具链，不要求当前目录存在 `main.yaml`。使用 `--file` 或 `--contrast` 时，入口必须是有效的 `main.yaml`。

## Profile 和 Night Mode

默认构建只构建 `main.yaml`：

```bash
wave dt build
```

构建 named profile：

```bash
wave dt build --profile mobile
wave dt build --profiles all
```

Profile 文件放在：

```text
main.yaml
profiles/mobile.yaml
```

Night Mode 是覆盖文件，不是 profile。需要 night 输出时显式加 `--night`：

```bash
wave dt build --night
wave dt build --profile mobile --night
wave dt build --profiles all --night
```

Night Mode 文件放在：

```text
main@night.yaml
profiles/mobile@night.yaml
```

缺失或无效的 Night Mode 不会阻断 day build。Wave 会输出 `Night Mode unavailable/invalid and skipped`，并跳过对应 night 文件。

每个 named profile 是独立主题，可在自己的 `theme.font.$extensions.typography.baseFontSize` 使用不同根字号。Night Mode 只覆盖 `theme.color` 和 `theme.state`，因此会继承对应 day profile 的根字号。

`variants/`、`--variant`、`--variants` 和 `--no-variants` 不再支持。旧项目需要把 variant 拆成 `profiles/<name>.yaml`。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| 找不到 `main.yaml` | 在 token 项目目录执行命令，或先运行 `wave dt init` |
| `main.yaml` 缺少 `$config` | 补齐 `$config`；如需检查 dimension 迁移，再运行 `wave dt doctor` |
| 入口不是名为 `main.yaml` 的文件 | 改用项目根目录的 `main.yaml`，或运行 `wave dt init` 创建入口 |
| 引用无法解析 | 检查 `$config.resource` 是否声明对应 namespace，以及 token 路径是否正确 |
| Sketch opacity 不输出 | 确认 token 在 `theme.state.*` 下，且 `$type` 是 `number` |
| 仍在使用 `theme.dimension` 输出 | 迁移到 `theme.state`、`theme.shadow`、`theme.gradient` 或 `theme.radius`；运行 `wave dt doctor` 查看建议 |
| WCAG 无检查项 | 确认存在 `doctor.wcagPairs` |
