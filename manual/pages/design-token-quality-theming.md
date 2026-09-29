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

`wave dt doctor` 默认检查 main 和全部 named profile 的结构与身份健康；使用 `--profile` 时，只检查指定 profile。Resource 严格检查保持单目标：默认检查 main 声明的全部 resource，选中 profile 时检查其合并后的全部 resource 声明，不会因为默认扫描全部 profile 而扩大资源检查范围。

```bash
wave dt doctor -f ./main.yaml
wave dt doctor --profile mobile -f ./main.yaml
wave dt doctor --json -f ./main.yaml
wave dt doctor --status -f ./main.yaml
```

普通文本、`--json` 和 `--status` 报告相同的问题；存在 error 时都以非零退出码结束。Profile 的 base 缺失、不匹配或 `$override` 指向不存在的基础 token ID，都是格式错误。

若某个 profile 的覆盖值与 main 的源 `$value` 完全相同，doctor 会给该 profile 一条 `info` 汇总，例如 `2/3 overrides match base source values`。这不是 error，不改变退出状态。比较的是源值，引用字符串也按原文比较，不比较解析后是否等值。删除冗余覆盖后，该 token 会跟随 main 的后续值变化。

顶层 `wave doctor` 只检查通用工具链，不要求当前目录存在 `main.yaml`。使用 `--file` 或 `--contrast` 时，入口必须是有效的 `main.yaml`。

`wave dt doctor` 和 `wave doctor --file` 还会输出 `Document Identity` 与 `Token Identity` 报告，包括文档身份、token 登记数量、未登记清单、空 `$id` 槽位和身份冲突。跨文件 token 身份冲突会让检查以非零退出码结束；先用 `wave dt ids` 的报告确认差异再修正。身份维护规则见 [main.yaml 写法](/design-token/main-yaml)。

| 现象 | 处理 |
| --- | --- |
| `unregistered` 数量很大 | 需要 Sketch 资产原地更新时，运行 `wave dt ids --write` 补登记 |
| 空 token `$id` 槽位 | 预留占位；`wave dt ids --write` 会自动填充 |
| `non-canonical id form` 提示 | 检查是否手写错了 `$id`；提示不会改写文件 |
| `Cross-file token $id conflict` | 按报告核对不同文件中的 token；冲突时 ids 拒绝写入任何文件 |
| Sketch 输出里 `themeId` 是 `null` | 当前 day 文档还没登记身份；运行 `wave dt ids --write` 补齐 main 或 profile 根 `$id` |

## 创建 Profile

`main.yaml` 是唯一入口，也是所有 profile 的基础。默认 build 只构建 main；named profile 必须通过选项选择，不能直接作为 `-f` 入口。

```bash
wave dt build -f ./main.yaml
wave dt build --profile mobile -f ./main.yaml
wave dt build --profiles all -f ./main.yaml
```

首次创建 profile，先在基础目录完成 main 的身份登记，再生成快照：

```bash
wave dt ids -f ./main.yaml
wave dt ids --write -f ./main.yaml
wave dt new-profile mobile -f ./main.yaml
```

`new-profile` 会立即创建 `profiles/mobile.yaml`，不会修改 main。前提是 main 的根 `$id` 和全部基础 token 的 `$id` 都已登记，且 token ID 没有重复。未登记或重复时，命令拒绝创建并提示先运行 ids。

名称只接受英文字母、数字、空格、下划线和连字符；去掉首尾空格后转为小写，空格转为下划线。例如 `"Mobile UI"` 生成 `profiles/mobile_ui.yaml`。规范化后与已有 profile 或 `main` 重名时会拒绝创建，不覆盖文件；不支持子目录或 `@night` 名称。

生成的 profile 包含自己的新根 `$id`、指向 main 根身份的 `$config.base`，以及全部基础 token 的完整源值快照。引用字符串与 object/array 都保持源写法，不会被预先解析。生成后修改需要差异化的覆盖值；删除无需固定的覆盖，让它们继续跟随 main。

## Profile 差量写法

下面两个文件组成一个基础与差量示例。

`main.yaml`：

```yaml
$id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$config:
  theme: example
  parameter:
    outputDir: ./build
    platform: [json, css]
theme:
  color:
    $type: color
    primary:
      $id: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      $value: "#2563eb"
    onPrimary:
      $id: cccccccccccccccccccccccccccccccc
      $value: "#ffffff"
```

`profiles/mobile.yaml`：

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

该 profile 保留基础的 onPrimary，仅替换 primary 的值并新增 accent。运行 `wave dt build --profile mobile -f ./main.yaml`，输出使用 main 的主题名加 profile 后缀，例如 `example-mobile.json`。

规则：

- Profile 根 `$id` 可省略；声明时必须为非空字符串，是该文档自己的身份。
- `$config.base` 必填，必须逐字等于 main 已登记的根 `$id`，不能写成路径或 token ID。
- Profile 的 `$config` 只接受 `base`、`resource`、`parameter`、`parameterGroup`，禁止 `theme` 和未知字段。输出主题名来自 main。
- Profile resource 追加在 main 声明之后；parameter 按字段覆盖，同名 parameter group 按字段合并，新增 group 保留。相对 resource 与输出路径按 profile 文件所在目录计算。字段类型见 [main.yaml 写法](/design-token/main-yaml)。
- `$override` 的 key 是基础 token 的 `$id`，不是 token 路径或文档根 ID。每项必须恰好是 `{ $value: ... }`，不能带 `$type`、`$id`、`$extensions` 等其他字段。
- 覆盖发生在 `$extends` 展开和引用解析之前，替换整个源 `$value`。Object 或 array 不深合并；覆盖 composite 时必须提供完整值，不能只写一个子字段。
- 新 token 树不能与基础 token 路径碰撞，也不能把已有 group 改为 token。已有 group 的任何 `$` 元数据均不能重声明，即使内容相同；包括 `$type`、`$description`、`$extends` 和 `$extensions`。
- 新 token 的类型必须在 profile 文件内可确定：在 token 自己声明 `$type`，或从 profile 新建的 group 继承。不能仅依赖基础 group 的 `$type`。上例 accent 因此显式声明 `color`。
- 未知根 `$` 前缀字段（例如 `$helper`）被跳过，不加入新 token 树或覆盖目标索引。

Profile 没有删除基础 token 或修改已有扩展的机制。需要不同结构、删除 token、调整 `smoothShadow.target`、`platform.sketch.path` 或 `inheritColor.property.opacity` 等扩展时，另建基础目录并使用自己的 main；这些设置不能通过值覆盖改变。已有独立 profile 文件不能直接沿用，也没有兼容或迁移命令；按本节差量格式重新组织，或保留为独立基础目录。

通过已登记的 number token 与 extension 引用，可以按 profile 调整 rem 基准，示例见 [颜色与字体](/design-token/color-typography)。

## Night Mode

Night Mode 是 day 的路径覆盖文件，不是 profile，也不使用 `$override`。需要 night 输出时显式加 `--night`：

```bash
wave dt build --night -f ./main.yaml
wave dt build --profile mobile --night -f ./main.yaml
wave dt build --profiles all --night -f ./main.yaml
```

文件对应关系：

```text
main.yaml
main@night.yaml
profiles/mobile.yaml
profiles/mobile@night.yaml
```

Night 在 profile 合并完成后应用，只允许覆盖对应 day 中已存在的 `theme.color` 和 `theme.state` 叶子路径，不增加其他路径。例如 `profiles/mobile@night.yaml`：

```yaml
theme:
  color:
    primary:
      $value: "#93c5fd"
```

Night 禁止根 `$id`，沿用 day 文档身份；token 身份也来自 day。省略 token `$id` 即可，重复写同一个 ID 不会换发身份；不同 ID 会被拒绝，空槽位也不会抹掉已有 day 身份。Ids 不写入 night 文件。Night 会继承 day 的字体与 rem 基准。

缺失或一般无效的 Night Mode 不会阻断 day build。Wave 会输出 `Night Mode unavailable/invalid and skipped`，并跳过对应 night 输出。根 `$id` 或 token 身份不匹配属于身份违规，会报错而不是按一般无效覆盖跳过。

`variants/`、`--variant`、`--variants` 和 `--no-variants` 不再支持。不要把旧 variant 文件直接改名为 profile；应按差量规则重建，结构不同则另建基础目录。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| 找不到 `main.yaml` | 在 token 项目目录执行命令，或先运行 `wave dt init` |
| `main.yaml` 缺少 `$config` | 补齐 `$config` |
| 入口不是名为 `main.yaml` 的文件 | 改用基础目录的 `main.yaml` |
| Profile base 缺失或不匹配 | 核对 `$config.base` 与 main 原有根 `$id`；不要重发 main 身份来绕过检查 |
| `$override` 无匹配 token ID | 对照 main 的 token `$id`，不是路径或文档根 ID |
| Profile 路径碰撞或 group frozen | 已有 token 改用 `$override`；已有 group 只添加成员，不重声明元数据 |
| 新 token 类型无法确定 | 在 profile 的新 token 或新 group 内声明 `$type` |
| 引用无法解析 | 检查 resource 声明与 token 路径 |
| Sketch opacity 不输出 | 确认 token 在 `theme.state.*` 下，且 `$type` 是 `number` |
| 仍在使用 `theme.dimension` 输出 | 迁移到用途对应的 root，运行 `wave dt doctor` 查看建议 |
| WCAG 无检查项 | 确认存在 `doctor.wcagPairs` |
