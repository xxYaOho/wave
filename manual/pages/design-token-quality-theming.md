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
| 出现 `Direct RESOURCE token generation is deprecated` | 当前目录缺少 `main.yaml`，Wave 正在使用旧兼容路径；运行 `wave dt init` 后把 token 内容迁移到 `main.yaml` |
| 引用无法解析 | 检查 `RESOURCE` 是否声明，或 token 路径是否正确 |
| Sketch opacity 不输出 | 确认 token 在 `theme.state.*` 下，且 `$type` 是 `number` |
| 仍在使用 `theme.dimension` 输出 | 迁移到 `theme.state`、`theme.shadow`、`theme.gradient` 或 `theme.radius`；运行 `wave dt doctor` 查看建议 |
| WCAG 无检查项 | 确认存在 `doctor.wcagPairs` |

