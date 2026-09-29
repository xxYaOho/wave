---
title: 故障排除
description: 常见错误、检查命令和处理方式。
category: 参考
commands:
  - wave doctor
  - wave dt doctor
  - wave dt wcag
  - wave compress doctor
  - wave motion doctor
appliesTo:
  - 本地 CLI
---

## 不知道从哪里开始

先运行：

```bash
wave --help
wave doctor --status
```

`--help` 查看命令入口，`doctor` 检查本地环境。

## 找不到 main.yaml

`wave dt` 默认读取当前目录的 `main.yaml`。如果项目是通过 `wave dt init` 创建的，直接在生成目录运行：

```bash
wave dt build
```

直接指定 `main.yaml` 时，这个文件需要包含 `$config`。`wave dt init` 生成的 `main.yaml` 已包含 `$config`。

新项目可以先运行：

```bash
wave dt init
```

然后构建：

```bash
wave dt build
```

## main.yaml 缺少 $config

直接把 `main.yaml` 作为输入时，文件需要包含 `$config`。如果看到 `Missing required $config in main.yaml entry`，先补齐 `$config`。

```yaml
$config:
  theme: example
  resource:
    palette:
      - tailwindcss
```

如需检查 `theme.dimension` 迁移，再运行 `wave dt doctor`。

## Profile 无法构建或登记身份

先查看检查报告：

```bash
wave dt doctor -f ./main.yaml
wave dt doctor --profile mobile -f ./main.yaml
wave dt ids -f ./main.yaml
```

Profile 的 `$config.base` 必须等于 main 原有根 `$id`。Base 缺失、不匹配，或已有 profile 而 main 尚未登记时，ids 会拒绝全部写入；不要改发 main 根身份来绕过检查。创建新 profile 应先登记 main 与全部 token，再运行 `wave dt new-profile mobile -f ./main.yaml`。

已有 token 用 `$override` 按 token ID 替换完整 `$value`，不能在 profile token 树中重新定义同一路径；已有 group 也不能重声明 `$type`、`$extensions` 等元数据。旧独立 profile 没有兼容或迁移命令。需要删除基础 token 或改变已有扩展时，另建基础目录。详见 [WCAG 与主题模式](/design-token/quality-theming)。

Doctor 的 `x/y overrides match base source values` 是冗余覆盖的 info 提示，不是错误；删除对应覆盖后，值会跟随基础变化。

## 字体扩展报错

`$extensions.typography` 使用平铺字段，旧 `defaults` 嵌套写法会被拒绝。把五个字体默认字段移到 `typography` 下；`baseFontSize` 是正 number 或解析为正 number 的引用，不是 dimension，也不是 token 字号默认值。按 profile 调整基准时，覆盖已登记的 number token，不修改已有 group 扩展。完整示例见 [颜色与字体](/design-token/color-typography)。

## 压缩工具缺失

运行：

```bash
wave compress doctor
wave compress install --check
```

确认安装计划后执行：

确认安装计划后，再运行 `wave compress install --yes`。

## 动效工具缺失

运行：

```bash
wave motion doctor
wave motion install --check
```

确认安装计划后执行：

确认安装计划后，再运行 `wave motion install --yes`。

## 输出文件已存在

部分命令默认不覆盖已有输出。确认可以覆盖时再使用覆盖选项：

```bash
wave motion gif ./frames --force
```

素材压缩优先使用 `--out` 输出到新目录：

```bash
wave compress ./assets --out ./optimized --yes
```
