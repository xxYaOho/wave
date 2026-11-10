---
title: Profile 与 Night 模型
description: 理解 base、Day profile 和 Night overlay 的身份、覆盖与目录关系。
category: Design Token
commands:
  - wave token
appliesTo:
  - 本地 CLI
---

## Base 与 Profile

`main.yaml` 是 base 和项目基线。一个 base 与其 Day profiles 构成一个系列；不同结构应使用独立 base workspace。

Profile 使用闭合的 `$config`：

```yaml
$id: dddddddddddddddddddddddddddddddd
$config:
  base: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$override:
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:
    $value: "#1872f0"
theme:
  color:
    accent:
      $type: color
      $value: "#ff3366"
```

- `$config.base` 必须逐字等于 main 已登记的根 `$id`。
- `$override` 的 key 是 base token `$id`，不是 token path 或文档 ID。
- 每项只包含 `$value`；object 和 array 整体替换，不做子字段合并。
- 新 token 不能碰撞已有路径；已有 group 不能重声明元数据。
- 新 token 的类型必须在 profile 自身可判定。
- Profile 不能删除 base token、改变已有类型或修改已有扩展。

引用表达式在 profile 合并后保留到引用解析阶段，不预先物化。

## 目录与 Base 定位

显式 `-f` 不依赖固定目录名：

```text
main.yaml
profiles/mobile.yaml
themes/mobile.yaml
variants/mobile.yaml
```

这些 Day profile 都有效。Wave 从 profile 所在目录向祖先查找最近的 `main.yaml`，再核验 `$config.base`。

`--profiles all` 仍使用既有 workspace 发现规则，不递归猜测任意目录中的 YAML。旧 variant 模型和 `--variant` 参数不支持，但 `variants/` 可以作为普通目录名。

## Night 是路径覆盖

Night 是 Day 的覆盖文件，不是 profile，也不使用 `$override`：

```yaml
theme:
  color:
    primary:
      $value: "#93c5fd"
```

Night 只覆盖 Day 已有的 `theme.color` 和 `theme.state` 叶子，禁止根 `$id`，沿用 Day 文档和 token 身份。

默认文件关系：

```text
main.yaml                 → main@night.yaml
themes/mobile.yaml        → themes/mobile@night.yaml
variants/mobile.yaml      → variants/mobile@night.yaml
```

构建时显式选择原 Day 源文档：

```bash
wave token build -f ./main.yaml --night
wave token build -f ./themes/mobile.yaml --night
```

缺失或一般无效的 overlay 会 warning 并跳过；身份违规会失败。

## 相关任务

- 创建 profile：[创建 Workspace 与 Profile](/design-token/create)
- 创建 overlay：[创建 Night Overlay](/design-token/night)
- 检查结构：[检查 Token Workspace](/design-token/doctor)
- 检查对比度：[检查 WCAG 对比度](/design-token/wcag)
- 维护身份：[维护 Token 身份](/design-token/ids)
