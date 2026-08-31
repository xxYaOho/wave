# md-yml Design Token 输出设计

日期：2026-08-31

## 目标

Wave 增加 `md-yml` design-token 输出平台。该平台把已解析、已转换的 token 写成适合放入 Markdown frontmatter、并可由 Markdown 内文简短引用的 YAML token fragment。

`md-yml` 不是通用 YAML serializer，也不是 DTCG 交换格式。它不复刻 flat JSON 的单层结构，不适配某个具体 `DESIGN.md` schema，也不生成文档元数据。

## 使用合同

用户可以在 `$config.parameter.platform`、parameter group 或 CLI `--platform` 中选择 `md-yml`：

```yaml
$config:
  theme: orca
  parameter:
    platform:
      - md-yml
    filterLayer: 1
```

Wave 为每个 build pass 生成：

```text
<theme>2md.yml
```

例如：

```text
orca2md.yml
orca-assistant-app2md.yml
```

文件只包含 YAML mapping，不生成 `---` frontmatter 分隔符、DTCG token wrapper、description 注释或其他 YAML 注释。formatter 不额外输出 token 的 `$type`、`$value`、`$description` metadata；token value 自身若合法包含同名字段，仍按 value parity 原样保留。用户自行选择复制范围，并把 fragment 放入目标 Markdown frontmatter。

默认 platform 仍为 `json`。现有 `json`、`jsonc`、`css` 和 `sketch` 的文件名与 formatter 结构保持不变；CLI `--platform` 的 pass planning 按下述合同纠正。

CLI `--platform` 表示一次显式的输出平台覆盖，而不是把所选 platform 注入每个 `parameterGroup`。未传 `--platform` 时，每个 parameter group 继续产生独立 build pass；传入 `--platform <list>` 时，每个选中的 profile 只基于该 profile 的 `$config.parameter` 产生一个 pass，并由 CLI platform list 覆盖其中的 `platform`。parameter group 专属的 `filterLayer`、`colorSpace` 和 `outputDir` 不参与该 pass；CLI `--out` 仍覆盖输出目录。仅传 `--out` 而未传 `--platform` 时，现有 parameter group 展开保持不变。

因此 Orca 的 `css`、`sketch` parameter groups 在 `--platform md-yml` 下不会变成两个 md-yml pass。build 使用 `$config.parameter.filterLayer: 1` 生成唯一的 `orca2md.yml`。这一语义同时适用于现有 platform；例如 `--platform css,sketch` 生成一个同时包含两种 platform 的 base-parameter pass，而不是每个 parameter group 各执行一次。

## 输出结构

`md-yml` 使用 `filterLayer` 处理后的 token path。第一个剩余 segment 作为顶层 namespace，其余 segment 使用 `-` 连接为 namespace 内的 token key。

转换规则：

```text
[namespace, ...localPath]
    -> namespace:
         join(localPath, "-"): value
```

例如，Orca 中的两个 token path：

```text
theme.color.primary.main
theme.color.primary.on-main
```

在 `filterLayer: 1` 下输出：

```yaml
color:
  primary-main: "#1a72f0"
  primary-on-main: "#ffffff"
```

Markdown 内文可以引用：

```markdown
主按钮使用 `{color.primary-main}`，文字使用 `{color.primary-on-main}`。
```

该结构只投影 source path。formatter 不按 `$type` 重组 token，不把 `color` 改为 `colors`，也不把 `font`、`radius` 等 namespace 映射成消费侧名称。

### Composite value

单个 composite token 保持一个 YAML object 或 array。formatter 不把 composite 属性提升为同级 token：

```text
theme.font.heading.h1
```

```yaml
font:
  heading-h1:
    color: "#020618"
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
```

Wave `$extensions.composite: true` 产生的 `_composite` siblings 继续按现有 JSON 合同合并。`_composite` 只标记 child 属于 explicit composite；formatter 不按 `.` 拆分这个字符串。exact group path 取 child `token.path.slice(0, -1)`，最后一个 segment 作为 composite property。程序化调用若传入与该 group path 不一致的 `_composite` marker，formatter 明确失败。以下输入路径：

```text
component.button.fill
component.button.radius
```

输出为：

```yaml
component:
  button:
    fill: "#1a72f0"
    radius: 8px
```

### Value semantics

`md-yml` 使用与 JSON 相同的 formatter-ready value，而不是重新读取 source YAML：

- 引用先由 resolver 解析。外部 resource 与 computed reference 输出最终值；同一文档中的 theme 内部直接引用按 `2026-08-31-md-yml-theme-reference-design.md` 保留为投影后的 md-yml 引用。
- colorSpace、dimension、duration、fontWeight、strokeStyle 和标准 composite 使用 transformer 已生成的规范化值。
- unknown custom object 和 array 保持结构，禁止字符串化为 `[object Object]`。
- custom value 内的 `$type`、`$value`、`$description` 等普通 property 保持不变；metadata 禁令只针对 formatter 额外生成的 token wrapper。
- `inheritColor` 使用现有 JSON placeholder 合同，包括 `$COLOR_FOREGROUND` 及可选 `alpha`、`opacity`。
- formatter 不输出 `WaveToken` 内部 metadata。

formatter 把输入 token 与 nested value 视为只读数据。它不能为了组合、清理或序列化 md-yml 而修改 `WaveToken[]`、`token.value` 或其中的 object/array；同一 pass 中其他 platform 的输出不得受 platform 顺序影响。

YAML 序列化必须保持值类型。`"#ffffff"`、`"true"`、`"001"`、`"null"` 等字符串在重新解析后仍须为原字符串，不能变成注释、boolean、number 或 null。输出不得使用 YAML anchor 或 alias，文件以换行结尾。

md-yml 可安全表达的 value domain 为 `null`、string、boolean、finite number、dense array，以及由这些值递归组成的 plain 或 null-prototype object。formatter 在调用 serializer 前遍历 value；array 只能拥有 `length` 和从 `0` 到 `length - 1` 的完整 canonical index own keys，不能携带额外 string 或 symbol own key。plain object 只能包含 enumerable data properties；non-enumerable own property 和 accessor property 都明确失败，避免 serializer 静默省略字段、重复取值或触发 getter 副作用。formatter 拒绝 `undefined`、array hole、`NaN`、infinity、bigint、symbol、function、cycle、symbol key，以及 Date、Map、Set、class instance 等非 plain object。错误包含 token path 与无法表达的 nested value path。该检查防止 `js-yaml` 把 object 中的 `undefined` 静默省略、把 array 中的 `undefined` 改成 `null`、丢弃 array 或 object property，或把非有限数写成 `.nan` / `.inf`。

## 路径边界与冲突

主配置已把 `filterLayer` 限定为非负整数。md-yml formatter 还必须防御直接 API 调用：收到负数、fractional number、`NaN` 或 infinite number 时明确失败。

路径过滤作用于实际输出单元：direct token 和 standard composite 使用 `token.path`；explicit composite 使用 child `token.path.slice(0, -1)` 的 exact group path。过滤后必须留下 namespace 和 local key。若实际输出 path 少于两个 segment，formatter 失败，并指出 source path 与 `filterLayer`；formatter 不退回完整 token name，也不猜测 namespace。explicit composite 的任一 child 触发该错误时，整个 composite 失败。

过滤后参与 namespace、local key 或 explicit composite property 的任一 source segment 都不能包含 `.`。md-yml 使用 `.` 分隔 `{namespace.local-key}` 引用，保留 segment 内的 `.` 会产生无法无歧义引用的 key；formatter 必须指出具体 source path 和 segment 后失败，不自动替换字符。

路径扁平化可能产生歧义：

```text
theme.color.primary-main
theme.color.primary.main
```

两者在 `filterLayer: 1` 下都会得到 `color.primary-main`。formatter 必须在序列化前检测以下冲突：

- 两个 token 生成相同的 `namespace.local-key`；
- direct token 与 composite 生成相同 key；
- explicit composite child 合并时生成重复 property。

发生冲突时，错误必须包含目标 key 和全部冲突 source path。formatter 不覆盖先前值，也不自动改名。

`generateTokens()` 继续先格式化当前 pass 的全部 platform，再写入文件。任何 `md-yml` 格式错误都使当前 pass 返回失败，且不写入该 pass 计划中的 JSON、CSS、Sketch 或 md-yml 文件。全局 output planner 同样把 `<theme>2md.yml` 纳入跨 pass 路径碰撞预检，但本设计不把现有 multi-pass build 扩展为事务：后续 pass 的格式错误不会回滚已完成的前序 pass。

## 顺序与确定性

formatter 在不修改输入数组的前提下，按 `WaveToken._order` 数值升序投影；相同 `_order` 按输入位置保持稳定。输出不按字母排序：

- namespace 按其第一个 direct token 或 explicit composite child 的出现位置排列；
- namespace 内的 direct token 按自身出现位置排列；explicit composite 按第一个 child 的出现位置占位，后续 child 只追加 property，不移动 composite；
- composite property 保持 transformer 产生的顺序。

相同输入、配置和 Wave 版本必须产生字节一致的 `md-yml`。serializer 配置固定在 formatter 内，不受用户机器的 YAML 库默认值或 locale 影响。

## 架构职责

### Resolver 与 transformer

Resolver 和 transformer 保持现有职责。它们继续生成解析、规范化后的 `WaveToken[]`，不感知 Markdown 或 YAML 输出结构。

### md-yml formatter

新 formatter 负责：

1. 应用 `filterLayer` 并计算 `namespace.local-key`；
2. 复用 JSON 的 value 与 explicit composite 投影合同；
3. 检测路径和 composite 冲突；
4. 使用 `Map` 索引 key、顺序和 source path，再转换为 null-prototype record 作为 YAML serializer 输入；
5. 用仓库现有 `js-yaml` 依赖序列化无注释 YAML fragment。

formatter 不把 `Map` 直接传给 `js-yaml`，不通过 JSON 字符串 round-trip 构造 YAML，也不解析原始 `main.yaml`。`__proto__`、`constructor` 和 `prototype` 必须作为普通 source key 安全输出，不能修改 accumulator prototype、绕过冲突检测或静默丢失。

### Generator 与 CLI

Generator 注册 `md-yml` platform，并将文件名规划为 `<theme>2md.yml`。CLI 帮助、未知 platform 错误、SPEC 和 design-token 用户文档同步列出 `md-yml`。

Pipeline 在存在 CLI `--platform` override 时只建立 base-parameter pass，不展开 parameter groups；无 CLI platform override 时保持现有 group pass 模型。该判断属于 pass planning，不进入 resolver、transformer 或 formatter。

## 错误处理

以下情况使 `md-yml` platform 失败：

- `filterLayer` 后不足两个 path segment；
- `filterLayer` 不是非负 finite integer；
- namespace 或 local key 为空；
- 过滤后的 source segment 包含 `.`；
- 路径折叠或 composite 合并发生冲突；
- formatter-ready value 无法由安全 YAML 表示；
- serializer 抛出异常。

错误应说明 platform、token path 或冲突 key，以及失败原因。错误沿用现有 generator 和 build 的失败传播，不引入新的 exit code。

## 范围

### 本次包含

- `md-yml` platform 与 `<theme>2md.yml` 输出规划；
- namespace 分组、组内 path 扁平化；
- JSON-compatible value、explicit composite 与 `inheritColor` 投影；
- 确定性 YAML 序列化和冲突失败；
- CLI、SPEC、用户文档与回归测试更新。
- CLI `--platform` 从“覆盖每个 parameter group”纠正为“基于 base parameter 的单 pass override”。

### 本次不包含

- 通用 `yaml` platform；
- DTCG `$type` / `$value` YAML 交换格式；
- 直接读取、修改或生成 `DESIGN.md`；
- frontmatter `---`、`version`、`name`、`description` 等文档字段；
- `$description` 注释；
- namespace 重命名、schema adapter 或消费侧 token 补全；
- 保留外部 resource、computed reference 或无法映射为同一 payload token 的 authored alias；theme 内部直接引用由增量规格覆盖；
- 修改现有 platform 输出；
- 把整个 multi-pass build 改造成文件系统事务；
- 承诺某个特定 Markdown/frontmatter parser 的 schema 或 lint 兼容性。

## 验收标准

### Formatter contract

- 精确测试 `filterLayer: 1` 将 `theme.color.primary.main` 输出为 `color.primary-main`。
- 精确测试 standard scalar、object、array 和 typography、border、shadow、gradient composite 的 YAML shape。
- 精确测试 `$extensions.composite: true` siblings 以 `_composite` 标记 membership、使用 child exact group path 合并成单个 token object，并按第一个 child 的位置排序。
- 精确测试 `inheritColor` placeholder 与 JSON 合同一致。
- 将输出重新交给 `js-yaml.load()`，断言 payload 的 value 类型和结构与 formatter intermediate object 相同。
- 用 exact output 断言 formatter 不生成 document delimiter、DTCG wrapper、description 注释或其他注释；value 本身为 `"---"` 或含 `$type`、`$value`、`$description` property 时仍合法保留。
- 断言 namespace、direct token、interleaved explicit composite 和 composite property 严格遵循首次出现顺序。
- 对 frozen token/value 分别运行 `[json, md-yml]` 和 `[md-yml, json]`，断言不抛出 mutation error，且两种顺序生成的 JSON 与 md-yml 分别字节一致。
- 覆盖 negative、fractional、`NaN`、infinite filterLayer，以及 direct path、explicit composite path 不足的失败信息。
- 覆盖 namespace、local path 和 explicit composite property 中含 `.` 的 segment，断言在序列化前明确失败。
- 覆盖折叠 key、direct/composite、property collision，以及 `__proto__`、`constructor`、`prototype` source key。
- 覆盖 object `undefined`、non-enumerable/accessor property、array `undefined`/hole/extra own key、非有限 number、cycle 和非 plain object，断言 serializer 前明确失败且错误包含 nested value path；accessor getter 不得被调用。

### Generator and integration contract

- `platform: [md-yml]` 只写 `<theme>2md.yml`。
- 多 platform build 同时正确规划 `json`、`css`、`sketch` 和 `md-yml` 文件。
- 未传 CLI platform 时 parameter groups 继续分别生成；传入 CLI platform 时，每个选中 profile 只产生一个使用 `$config.parameter` 的 pass。`--out` 单独使用时仍覆盖全部 group，不改变 pass 数量。
- named profile 使用合并后的 profile base parameter；`--profiles all --platform md-yml` 为 default 与每个 named profile 各生成一个对应的 `<theme>[-<profile>]2md.yml`。含 groups 的 workspace 收到 empty 或 unknown CLI platform 时仍在任何 formatter 或文件 mutation 前失败。
- 未知 platform 错误的 supported list 包含 `md-yml`。
- md-yml format 失败时，当前 pass 中预先存在的其他 platform 文件保持字节不变，当前 pass 不产生新文件。
- parameter groups 或 profiles 计划到同一 `<theme>2md.yml` 时，在写文件前报告 output path collision。
- 增加 Orca example-derived hermetic fixture，验证 `color.primary-main`、`radius.md` 和 `font.heading-h1` 的结构；真实 Orca 仓库不作为自动测试依赖。
- 使用 `/Users/teatao/Projects/my-color/orca/main.yaml` 的 default profile 和 CLI `--platform md-yml` override，在任务独占的临时输出目录中真实生成唯一的 `orca2md.yml`；解析并抽查已知 token，确认没有 `[object Object]`、YAML anchor/alias 或 frontmatter delimiter，且 Orca source hash 前后不变。该真实 consumer smoke 是 Milestone 2 gate 和最终完成条件，不由 hermetic fixture 替代。

### Repository gates

- touched-file formatter 和 style check 通过；
- `pnpm typecheck` 通过；
- `bun test` 通过；
- `pnpm check:ci` 通过。
- 真实 Orca `main.yaml` 的 `md-yml` CLI build 与 payload 检查通过。
- 所有计划内代码修改与收尾清理结束后，重新执行真实 Orca smoke 和 source hash parity；此前里程碑证据不能替代最终 mutation 后验证。

## 成功条件

用户运行 `wave dt build` 选择 `md-yml` 后，得到 `<theme>2md.yml`。文件只包含 source token graph 已有内容，使用一级 namespace 与组内 hyphen-joined source path；用户可把所需 fragment 复制到 Markdown frontmatter，并在内文用 `{namespace.local-key}` 引用。当前 pass 中任何无法无歧义表达的 token graph 都在该 pass 写文件前明确失败。
