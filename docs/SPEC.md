# SPEC for wave

> 本文件由 `/release` 流程自动维护，位于 `docs/SPEC.md`，记录当前版本的系统行为快照。

---

## Mental Model（agent 必读）

wave 是面向 UI/UX 设计师的本地 CLI 工具集。当前已包含 design token、素材压缩、PNG 帧动效生成、本地设计项目工作区创建、本地工具链检查和本地用户手册页面。

**当前 token 生成的数据流：**

```
main.yaml（$config + default profile token 内容，DTCG 格式）
    + profiles/<name>.yaml（named profile，可选）
    ↓
引用解析（$config.resource 可选；未声明时使用空依赖字典）
    ↓
颜色转换（colorSpace 在输出阶段介入）
    ↓
输出文件（.json / .jsonc / .css / sketch JSON / md-yml YAML fragment）
```

**认知边界：**

- main.yaml：default profile、token 内容和 `$config` 来源
- profiles/<name>.yaml：named profile 的独立 token 内容；不与 main token 内容合并
- `$config.resource`：可选的外部引用依赖声明，不直接输出 token
- build：只以有效 token 图能否完整解析和生成作为 resource 相关成功条件；未被引用的缺失、损坏或重复声明不阻塞 build
- Doctor：严格检查当前检查目标中的全部 resource 声明，即使声明未被 token 引用
- design-token workspace：只以文件名为 `main.yaml` 且根包含有效 `$config` 的文件作为入口；不从 resource、profile 或目录推断入口
- RESOURCE：只提供引用解析数据，不直接生成 token
- colorSpace 转换发生在输出阶段，不影响引用解析过程
- dt：design-token 模块入口，默认读取当前目录 `main.yaml`
- compress：只处理已有 PNG/JPG/SVG/GIF 素材压缩，不从帧生成动效
- motion/mg：只从 PNG 帧目录生成 GIF/APNG
- workspace：按 `~/.config/wave/workspace.yaml` 或内置默认配置创建本地设计项目目录
- install/doctor：检查和安装本地工具链，不改变 token 数据模型
- manual：服务 `dist/manual-app/` 构建产物，不在运行时读取 `manual/` 源码
- Quality Harness：维护者使用的质量指标基座，当前第一批 consumer 是 design-token benchmark suite；它用于判断何时需要优化，不是用户向功能

用户向使用说明统一维护在 `manual/`，通过 `wave manual` 查看。`docs/SPEC.md` 只记录内部行为快照和实现/review 心智模型。

**design-token resolver 结构：**

- `src/core/resolver/theme-reference.ts` 是兼容导出入口，只 re-export 公开 resolver API 和错误类型。
- `src/core/resolver/errors.ts` 持有 `CircularReferenceError`、`UnresolvedReferenceError`、`ExtendsCycleError`，保证 `theme-reference.ts` 与 `resolver/index.ts` 的错误类 identity 一致。
- `$extends` 展开、引用路径工具、外部/内部 value pass、token group pass 和残留引用扫描分别拆在 `src/core/resolver/reference-*` 模块中。
- 调整 resolver 时先补 `tests/resource-resolver.test.ts` 或 `tests/extends-resolver.test.ts` 的行为刻画，再改实现。

**常见误区：**

- ❌ 不要在资源文件里加输出逻辑
- ❌ 不要新增或扩大绕过 main.yaml 直接从资源生成 token 的路径
- ❌ 新增 wave 子命令时，不要复用 token 生成的内部模块，除非明确适用
- ❌ 不要把 compress 和 motion 的外部工具判断各写一套；应复用 `ToolResolver` / `CommandRunner`
- ❌ 不要新增其他 design-token workspace 入口或恢复已移除的 `themefile` 兼容路径
- ❌ 不要把 Quality Harness 当作单次跑分结论；它提供趋势和阶段定位参考

---

## CLI 命令

- `wave design-token`：design-token 模块入口，默认等价于 `wave design-token build`
- `wave design-token build`：生成 design token 输出，默认读取当前目录 `main.yaml`
- `wave dt`：`wave design-token` 的 alias，默认等价于 `wave dt build`
- `wave dt build`：生成 design token 输出，默认读取当前目录 `main.yaml`
- `wave dt init`：初始化主题工作区
- `wave dt show`：浏览内置资源
- `wave dt update [name]`：显式更新本地 design-token resource cache
- `wave dt status`：查看本地 resource cache/state 状态
- `wave dt doctor`：design-token workspace 健康检查入口
- `wave dt wcag`：运行 WCAG 对比度检查
- `wave dt ids`：token `$id` 身份维护（填充空槽位、生成新身份、跨文件同步）；默认 dry-run 报告，`--write` 才写回
- `wave dt migrate-extensions`：一次性把 legacy `$extensions` sketch 家族改名为 `platform.sketch` 新形态；默认 dry-run 报告，`--write` 才写回
- `wave doctor`：核心运行环境和本地工具链健康检查
- `wave doctor --contrast`：WCAG 对比度检查
- `wave install`：通过 mise 安装推荐工具链
- `wave compress`：压缩 PNG/JPG/SVG/GIF 素材，内部归一化为 `wave compress run`
- `wave compress doctor`：检查压缩工具链
- `wave compress install`：安装压缩工具组
- `wave motion`：TTY 下从当前目录检查 PNG 帧并选择 GIF/APNG；非 TTY 下要求显式格式
- `wave motion gif [framesDir]`：从 PNG 帧目录生成 GIF；省略目录时使用当前目录
- `wave motion apng [framesDir]`：从 PNG 帧目录生成 APNG；省略目录时使用当前目录
- `wave motion doctor [framesDir]`：检查动效工具链和可选帧目录
- `wave motion install`：安装动效工具组
- `wave mg`：`wave motion` 的 alias
- `wave workspace`：进入工作区创建流程，等价于 `wave workspace create`
- `wave workspace create`：按配置创建本地设计项目工作区
- `wave manual`：启动本地用户手册页面服务，服务 `dist/manual-app/` 构建产物
- `wave show`：浏览内置资源
- `wave` / `wave -h` / `wave help`：显示顶层帮助
- `wave --version`：显示版本号

### dt 命令

`design-token` 是 design-token 能力域入口，`dt` 是 alias。两者只接受含有效 `$config` 的 `main.yaml` 作为 workspace 入口。

- `wave dt`：内部归一化为 `wave dt build`，默认使用 `./main.yaml`
- `wave design-token`：内部归一化为 `wave design-token build`，默认使用 `./main.yaml`
- `wave dt build [path]`：生成 design token 输出；`path` 必须指向 `main.yaml`
- `wave dt build -f <path>`：显式指定 `main.yaml`
- `wave dt init`：创建以 `main.yaml + $config` 为入口的 profile model 模板
- `wave dt show [category] [name]`：浏览内置资源
- `wave dt doctor`：运行 design-token 健康检查
- `wave dt wcag [scope]`：运行 WCAG 对比度检查
- `wave dt ids`：token 身份维护命令；`-f, --file` 指定 `main.yaml`，默认 dry-run，`--write` 写回，写回要求 git 工作区清洁（`--allow-dirty` 显式豁免）
- `wave dt migrate-extensions`：legacy `$extensions` 一次性迁移命令；`-f, --file` 指定 `main.yaml`，默认 dry-run，`--write` 应用到 `main.yaml` 与 `profiles/*.yaml`

`wave dt wcag` 规则：

- 不传 `scope` 时检查 main
- `scope=main` 时检查 `main.yaml`
- 其他 scope 视作 profile 名称
- `--night` 检查 night 版本
- `--profile <name>` 可显式指定 profile，优先于 scope 推断

### Workspace 输入合同

无显式文件时，design-token 命令只读取 `<cwd>/main.yaml`。显式文件通过 `dt build` 位置参数或 `-f, --file` 传入，且必须满足：

- 路径指向普通文件，文件名为 `main.yaml`。
- YAML 根为 object，且包含有效的 `$config` object。
- 名为 `main.yaml` 且最终指向普通文件的 symlink 可以作为入口。resource 和输出相对路径仍以用户传入的 symlink 所在目录为 workspace 基准。
- `dt build` 的位置参数与 `--file` 不能同时出现；同时出现时返回 `INVALID_PARAMETER`。

named profile 和 Night overlay 只能通过 `--profile`、`--profiles all` 和 `--night` 选择，不能充当 workspace 入口。`dt wcag [scope]` 的 `scope` 选择 profile，不是文件位置参数；`dt wcag mobile --file ./main.yaml` 合法。

**拒绝矩阵：**

| 输入 | 结果 |
| --- | --- |
| 省略输入且 `<cwd>/main.yaml` 不存在 | `FILE_NOT_FOUND` |
| 显式路径不存在 | `FILE_NOT_FOUND` |
| 已移除的 `themefile` 入口 | `INVALID_PARAMETER` |
| 目录 | `INVALID_PARAMETER` |
| resource 文件 | `INVALID_PARAMETER` |
| `profiles/<name>.yaml` | `INVALID_PARAMETER` |
| `main@night.yaml` 或 profile Night 文件 | `INVALID_PARAMETER` |
| 文件名不是 `main.yaml` 的任意 YAML | `INVALID_PARAMETER` |
| `main.yaml` 无法读取且不是不存在 | `GENERAL_ERROR` |
| `main.yaml` YAML 语法错误 | `FORMAT_ERROR` |
| `main.yaml` 缺少或包含无效 `$config` | `FORMAT_ERROR` |
| 位置参数与 `--file` 同时提供 | `INVALID_PARAMETER` |

错误信息包含被拒绝路径、失败原因和现代入口提示。旧入口提示统一指向 `main.yaml` 和 `wave dt init`。入口拒绝或 `main.yaml` 解析失败不创建或覆盖生成产物，已有输出文件保持字节不变。

### Doctor Scope

- `wave doctor`、`wave doctor --json`、`wave doctor --status` 和 `wave doctor --verbose` 只运行通用工具链诊断，不要求当前目录存在 `main.yaml`。
- `wave doctor --file <path>` 在通用诊断之外检查指定 workspace；文件必须符合 main-only 输入合同。
- `wave doctor --contrast` 进入 design-token contrast 检查；没有 `--file` 时使用 `<cwd>/main.yaml`。
- `wave dt doctor` 默认检查 `<cwd>/main.yaml`；`--file` 只能指定合法 `main.yaml`。
- `wave dt doctor` 和 `wave doctor --file` 默认只严格检查 default profile 的 resource 声明；`--profile <name>` 只检查显式选择的 profile，不扫描所有 profile。
- 任意显式 `--file` 都先执行入口校验，再选择 text、JSON、status 或 verbose renderer。`wave dt doctor --json` 在 cwd 缺少 `main.yaml` 时返回 `FILE_NOT_FOUND`，不会退化为通用工具链诊断。

### Profile Model

- `main.yaml` 是 default profile 和项目基线。
- `profiles/<name>.yaml` 是 named profile。
- `wave dt build` 只构建 `main.yaml`。
- `wave dt build --profile <name>` 构建一个 named profile。
- `wave dt build --profiles all` 构建 `main.yaml` 和所有 named profiles。
- `--night` 包含有效的 `main@night.yaml` 或 `profiles/<name>@night.yaml` overlay。
- named profile 可定义自己的 `theme.font.$extensions.typography.baseFontSize`；night overlay 只可写 `theme.color`、`theme.state`，因此继承 day profile 的字号基线。
- 缺失或无效的 Night Mode 输出 `Night Mode unavailable/invalid and skipped`，跳过 night 输出，并保持 day build 成功。
- `variants/`、`--variant` 和 `--variants` 不支持。

### Resource Validation

- `$config.resource` 可省略；完全自包含的 `main.yaml` 或 named profile 可直接构建。
- build 会尝试收集已声明的外部依赖，但只以有效 token 图能否完整解析和生成作为 resource 相关成功条件。
- 未被引用的缺失、损坏或重复 resource 声明不阻塞 build，也不产生 build warning。
- 被引用的 namespace 必须唯一且可解析；缺失或重复导致歧义时，build 会报告引用所在的 token 路径并失败。
- `wave dt doctor` 严格检查当前检查目标中的全部 resource 声明，包括未被 token 引用的声明。
- 无 `main.yaml` 时返回 `FILE_NOT_FOUND`，不从 resource 生成 token。

### Public Theme Roots

CSS 输出包含 `theme.color`、`theme.state`、`theme.shadow`、`theme.gradient`、`theme.border`、`theme.radius` 和 `theme.font`。

`theme.dimension` 不是 public output root。迁移阶段 build 会警告一次，`wave dt doctor` 输出迁移建议。

### DTCG 标准类型合同

Wave 识别 DTCG Format Module 2025.10 的全部标准 `$type`：

| `$type` | 标准值合同 | 归一化结果 |
| --- | --- | --- |
| `color` | `{ colorSpace, components, alpha?, hex? }` | 按目标色彩空间输出；无法转换且无 fallback 时按平台失败或保留标准对象 |
| `dimension` | `{ value: number, unit: "px" | "rem" }` | 带单位字符串 |
| `fontFamily` | string 或 string array | 保留字体列表语义 |
| `fontWeight` | `1..1000` 或标准命名 weight | 数字 weight |
| `duration` | `{ value: number, unit: "ms" | "s" }` | 带单位字符串 |
| `cubicBezier` | 四个有限 number，两个 x 坐标位于 `[0, 1]` | 四元素 number array |
| `number` | 有限 JSON number | number |
| `strokeStyle` | 标准字符串，或 `{ dashArray, lineCap }` | 标准字符串或规范化 object |
| `border` | `{ color, width, style }` | 递归规范化 composite |
| `transition` | `{ duration, delay, timingFunction }` | 递归规范化 composite |
| `shadow` | 单层 object 或 layer array | 递归规范化 layer |
| `gradient` | stop array | clamp position，并物化缺失的 `0`、`1` 端点 |
| `typography` | `{ fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }` | 递归规范化 composite |

`opacity` 不是 DTCG 标准 `$type`。它作为 token type 时按未知自定义类型处理；`inheritColor.property.opacity` 和 `$extensions.platform.sketch.property.opacity` 仍是有效 Wave extension。

标准 composite 是闭合结构。缺少必需字段、出现未声明字段或引用到不兼容类型时，schema/resolved validation 失败。有效类型可以来自 token `$type`、最近父 group `$type` 或完整 token alias 的目标类型。

Wave 支持 DTCG complete-token reference 和 JSON Pointer `$ref`：

```yaml
theme:
  color:
    primary:
      $type: color
      $value: "#1872f0"
  radius:
    small:
      $type: dimension
      $value: 4
  border:
    style:
      $type: strokeStyle
      $value: dashed
    control:
      $type: border
      $value:
        color: "{theme.color.primary}"
        width: "{theme.radius.small}"
        style: "{theme.border.style}"
    controlAlias:
      $value: "{theme.border.control}"
```

complete-token alias 继承目标的 effective type。composite 子字段引用必须指向对应类型，例如 `border.width` 只接受 `dimension` 引用，`border.style` 只接受 `strokeStyle` 引用。shadow 和 gradient 数组中的引用保留单元素语义，不展开为嵌套数组。

#### Wave dimension 方言

标准 DTCG dimension 只接受 `{ value, unit }`，标准单位为 `px` 和 `rem`。Wave 额外接受有限 number、十进制 numeric string、带 `px | rem | pt | em | %` 的 length string、`{ value }`，以及使用扩展单位的 `{ value, unit }`。这些输入形式适用于 standalone dimension 和 border、strokeStyle、shadow、typography 的 dimension 子字段。

无单位值在 JSON、JSONC 和 CSS 输出中默认补为 `px`，例如 `8` 输出为 `"8px"`。Sketch 原生数值属性只接受可无损投影的单位；typography `rem` 按 `baseFontSize` 转换，其余不可表达的 `em | rem | %` 明确失败。typography `lineHeight` 的标准值为 number；Wave 方言另接受 `px | pt | rem`，不接受 `em | %`。

#### 平台投影与失败语义

JSON 和 JSONC 使用 flat platform output。md-yml 使用相同的 formatter-ready value，但按 namespace 分组；可投影到同一 md-yml payload 且未被计算改写的 theme direct reference 会恢复为 `{namespace.local-key}`。外部 resource reference、`$ref + override` 和扩展计算结果保持 materialized。dimension 子值保留单位，standard composite 保留规范化结构。含 `"none"` 的 DTCG color 无法转换且无 `hex` fallback 时，保留只含标准字段的 clean color object。

CSS 为每种标准类型提供专用 formatter。`fontFamily` 输出合法 font stack；`duration`、`cubicBezier`、`transition` 输出可直接消费的 CSS value；object `strokeStyle` 和使用它的 `border` 输出 `dash-array`、`line-cap` companion variables。gradient 使用规范化端点，shadow 保留 `inset`。CSS 无法表达的 color、空 font family、负或全零 dash pattern，以及未知自定义 object/array 会显示 token path、type 和 value shape 后失败，禁止输出 `[object Object]`。

Sketch 平台输出 payload v2 资产清单（合同见「输出格式 → sketch」）。只有可同步资产进入 payload：color 与 inheritColor 产生 `kind: color` 记录，typography 产生 `kind: text` 记录，outline border、shadow、gradient、radius 维度和 sketch property 维度产生 `kind: layer` 记录；普通 border、generic dimension、transition 与未知 payload 不产生记录。不可转换且无 fallback 的 color，以及无法投影到原生数值属性的单位会明确失败。

未知自定义 `$type` 继续产生 warning。JSON/JSONC 保留其值，md-yml 保留 YAML-safe 值，CSS 只接受 scalar，Sketch payload 不为未知类型产生记录。该兼容行为不属于 DTCG 标准类型支持。

### show 命令

- `wave show`：列出所有内置调色板（palettes）和尺寸系统（dimensions）
- `wave show <category>`：列出指定类别（palette / dimension）
- `wave show <category> <name>`：显示指定资源的详细内容
- `wave show <name>`：跨类别查找（同名时需指定类别）
  - `--format flat-json`（默认）：扁平化的 key-value 格式
  - `--format json`：嵌套 JSON 格式
  - `--format yaml`：原始 YAML 文件内容

**dt build 命令参数选项：**

- `--profile <name>`：构建一个 named profile
- `--profiles <mode>`：构建 profile 集合；当前支持 `all`
- `--night`：包含有效的 Night Mode overlay
- `--platform <list>`：指定输出平台（逗号分隔）：`json`、`jsonc`、`css`、`sketch`、`md-yml`
- `-o, --out <path>`：指定输出目录
- `--output <dir>`：兼容旧参数，等价于 `--out`

### toolchain 命令

Wave 不捆绑 `oxipng`、`pngquant`、`svgo`、`gifsicle`、`gifski`、`apngasm`、`jpegtran`、`mozjpeg` 等二进制工具。工具发现、版本检查、安装计划和命令执行通过 `src/core/tools/*` 的 `ToolResolver` / `CommandRunner` 统一处理。

**工具能力：**

| 能力 | 候选工具 |
|------|----------|
| `compress-png` | `oxipng`, `pngquant` |
| `compress-jpg` | `jpegtran`, `mozjpeg` |
| `compress-svg` | `svgo` |
| `compress-gif` | `gifsicle` |
| `encode-gif` | `gifski` |
| `encode-apng` | `apngasm` |

**安装入口：**

- `wave install --check`：展示完整推荐工具链安装计划，不执行安装
- `wave install --yes`：执行 `mise run install:wave`
- `wave compress install --check`：展示压缩工具组安装计划
- `wave compress install --yes`：执行 `mise run install:compress`
- `wave motion install --check`：展示动效工具组安装计划
- `wave motion install --yes`：执行 `mise run install:motion`
- `--json`：输出结构化 install plan 或 install result

缺少 `mise` 时，安装命令返回用户可读错误，不输出 Bun runtime stack。

**doctor 入口：**

- `wave doctor`：核心环境和全量工具摘要；缺少模块工具在 core 视角降级为 warning
- `wave doctor --json`：输出 `ToolchainDoctorResult`
- `wave doctor --status`：输出紧凑状态
- `wave compress doctor`：检查压缩工具链；缺少工具为 error
- `wave motion doctor [framesDir]`：检查动效工具链和可选帧目录；缺少工具为 warning，帧目录错误为 error
- 模块 doctor 支持 `--json`、`--status`、`--verbose`

---

## Design Token Workspace 配置

`main.yaml` 同时包含 `$config` 和 default profile token。YAML 根必须是 object，且 `$config` 必须通过闭合 schema 校验；未知字段、错误类型、空字符串和混合类型数组返回 `FORMAT_ERROR`，错误包含字段路径。

**`$config` 字段：**

- `theme`：必填，trim 后必须是非空字符串。
- `resource`：可选 object，只允许 `palette`、`dimension`、`custom`；每项是非空字符串或非空字符串数组。
- `parameter`：可选 object，只允许 `outputDir`、`platform`、`filterLayer`、`colorSpace`。
- `parameterGroup`：可选 object；key 是 group name，value 使用同一闭合 parameter schema。

**parameter 字段：**

- `outputDir`：非空字符串。
- `platform`：非空数组，成员只能是 `json`、`jsonc`、`css`、`sketch`、`md-yml`。
- `filterLayer`：大于等于 0 的整数。
- `colorSpace`：只能是 `hex`、`oklch`、`srgb`、`hsl`。

**完整示例：**

```yaml
$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: my-theme
  resource:
    palette:
      - leonardo
    dimension:
      - wave
    custom:
      - ./tokens/brand.yaml
  parameter:
    outputDir: ./build
    colorSpace: hex
  parameterGroup:
    css:
      platform:
        - css
      filterLayer: 3
      outputDir: ./build/css
    sketch:
      platform:
        - sketch
      filterLayer: 2
      outputDir: ./build/sketch

theme:
  color:
    primary:
      $type: color
      $value: "{leonardo.color.blue.600}"
```

不传 CLI `--platform` 时，每个 `parameterGroup` 产生一个独立 build pass。group 字段覆盖 `$config.parameter` 的同名字段；仅传 `--out` 会覆盖每个 group pass 的输出目录，不改变 group 展开。

传入 CLI `--platform` 时，每个选中的 default 或 named profile 只建立一个 pass。该 pass 使用 profile 的 base `$config.parameter`，并用 CLI platform 替换其 platform；不展开 `parameterGroup`，也不读取 group 专属的 `filterLayer`、`colorSpace` 或 `outputDir`。`--out` 仍可覆盖该 single pass 的 base output directory。

输出平台在 formatter 执行和输出目录创建前统一 trim 并按首次出现顺序去重。未知 platform 使整个 build 失败，错误会列出受支持的 `json`、`jsonc`、`css`、`sketch`、`md-yml`；空 platform 列表同样失败，不会返回 `success: true` 且没有产物。校验失败时不会改写已有产物，也不会创建新产物。

所有选中的 default、named profile 与有效 night scope 必须先完成 token processing，再按最终输出文件路径做一次全局规划；规划成功后才允许执行任一 formatter、创建输出目录或写文件。无效 night 仍按既有规则 warning + skip，不进入规划集合。任意两个 pass 产生相同最终路径时，build 返回 `GENERAL_ERROR`，错误为 `Output path collision: "<absolute-path>" is produced by passes "<id1>" and "<id2>"`；在失败前不会改写已有产物，也不会生成其他平台文件。GROUP 的 platform 集合部分重叠、default/profile/night 跨 scope 重叠均使用同一合同。

最终路径由 generator 的平台命名规则产生，并用 `path.resolve()` 做 lexical absolute normalization，因此 `a/../b` 等 dot segment 会归一。当前合同不解析 symlink alias，也不对大小写或 Unicode 做 filesystem-aware canonicalization；这些物理同一文件场景不在 collision planner 保证范围内。

---

## Compress 行为

`compress` 处理已有素材文件。它不生成动效，不上传第三方服务，不覆盖源文件。

### 命令形态

```bash
wave compress [input]
wave compress run [input]
wave compress doctor
wave compress install
```

`wave compress [input]` 是低记忆入口。CLI 会把它归一化为 `wave compress run [input]`，同时保留 `doctor` 和 `install` 作为真实子命令。

### run 参数

- `[input]`：文件或目录，默认 `.`
- `--recursive`：递归扫描子目录
- `--type <type>`：限制类型，支持 `png`、`jpg`、`svg`、`gif`，可重复
- `-q, --quality <value>`：启用质量模式，取值 1-100
- `-o, --out <path>`：指定输出目录
- `--dry-run`：只预览，不写文件
- `--yes`：跳过确认并写入预览结果
- `--force`：允许覆盖已有输出文件；`--yes` 不隐含 `--force`
- `--icon`：按图标标准清理 SVG 颜色相关属性，方便 CSS 重新赋色
- `--json`：输出 JSON；不带 `--yes` 时强制 dry-run

### 扫描与输出

- 目录输入默认只扫描当前一级文件。
- 文件输入只处理该文件。
- 不传 `--out` 时，目录输入输出到 `<input-dir>/wave-compress/`。
- 不传 `--out` 时，文件输入输出到 `<file-parent>/wave-compress/`。
- 显式 `--out` 按当前 cwd 解析相对路径。
- 输出保留输入相对路径结构。

### 预览与安全落盘

`compress` 总是先写入临时目录并计算真实大小差异。

- 不传 `--yes` / `--dry-run` / `--json`：先扫描输入并确认 `Confirm compressing the files in the current directory?`，只展示友好路径和匹配文件数；用户拒绝或取消时安静退出，不写文件、不输出 receipt。
- 用户确认后执行压缩，TTY 下用 `yocto-spinner` 显示 `Compressing` loading；完成后只输出一次 `COMPRESS RECEIPT`。
- `--dry-run`：只展示一次 `COMPRESS PREVIEW`，不询问也不写最终输出。
- `--yes`：跳过确认并写入最终输出，TTY 下显示 `Compressing` loading。
- `--json`：不确认、不显示 loading、不输出 box receipt；不带 `--yes` 时强制 dry-run 并输出 preview JSON。
- `--json --yes`：执行写入并输出 result JSON。
- 默认不覆盖已有输出；目标文件已存在且未传 `--force` 时返回 `WCP_OUTPUT_EXISTS`。
- 若优化产物更小，状态为 `optimized`，写入优化产物。
- 若优化产物不更小，状态为 `unchanged`，写入原始字节。
- SVG 使用 `--icon` 或用户 SVGO config 时，写入 SVGO 处理结果；若处理结果不更小，状态为 `cleaned`。
- receipt 中 `optimized` 行显示 `saved, <percent>%`；`cleaned` 行显示 `cleaned`；`unchanged` 行显示 `unchanged`。
- 成功写入 receipt 的结尾显示 `Reduce space usage by <percent>%.`，百分比按所有文件合计的压缩前后字节计算，保留两位小数。

### SVG 配置

- 普通 SVG 压缩默认查找 `~/.config/wave/svgo.cjs`；存在时传给 `svgo --config`。
- `--icon` 使用 Wave 内置 SVGO 配置，不读取 `~/.config/wave/svgo.cjs`。
- `--icon` 内置配置使用 `preset-default`，`floatPrecision: 2`，并删除 `fill`、`fill-rule`、`fill-opacity`。
- `--icon` 不主动删除 `stroke`、`id`、`title`。

### 工具选择

| 文件类型 | safe 模式 | quality 模式 |
|----------|-----------|--------------|
| PNG | `oxipng` | `pngquant` |
| JPG/JPEG | `jpegtran`，fallback `mozjpeg` | `mozjpeg` |
| SVG | `svgo` | `svgo` |
| GIF | `gifsicle` | `gifsicle` |

`--quality` 只影响 PNG/JPG 的工具选择。SVG/GIF 仍走 safe 工具。

### 诊断

`wave compress doctor` 只检查工具链，不处理文件。缺少当前模块所需工具时退出码非 0。`--json` 输出结构化诊断，`--status` 输出紧凑状态，`--verbose` 输出候选工具详情。

---

## Motion 行为

`motion` 从 PNG 帧目录生成 GIF 或 APNG。`mg` 是 `motion` 的 alias。

### 命令形态

```bash
wave motion
wave mg
wave motion gif [framesDir]
wave motion apng [framesDir]
wave mg gif [framesDir]
wave mg apng [framesDir]
wave motion doctor [framesDir]
wave motion install
```

`wave motion` 与 `wave mg` 空参数仅在 TTY 下进入交互。CLI 先检查当前目录是否是合法 PNG 帧目录；合法时用 `@clack/prompts` 选择格式，默认高亮 APNG。非 TTY 下空参数不进入交互、不默认生成，输出：

```text
Missing format in non-interactive mode. Use wave mg apng or wave mg gif.
```

`wave motion` 入口会使用对应命令名：

```text
Missing format in non-interactive mode. Use wave motion apng or wave motion gif.
```

### 参数

- `<framesDir>`：PNG 帧目录；省略时使用当前目录 `.`
- `--fps <number>`：帧率，默认 `24`，必须大于 0
- `--quality <number>`：编码质量，默认 `80`，取值 1-100
- `--loop <mode>`：循环模式，默认 `forever`，支持 `forever` / `once`
- `-o, --out <path>`：输出文件路径
- `--overwrite`：允许覆盖已有输出
- `--dry-run`：展示计划，不执行编码

### 帧目录规则

- 只支持 PNG 文件。
- 非 PNG 文件会被忽略并产生 `WMG_NON_PNG_IGNORED` warning。
- 文件按名称自然排序。
- 至少需要 2 帧，否则 `WMG_FRAME_COUNT_LOW`。
- 所有帧尺寸必须一致，否则 `WMG_FRAME_SIZE_MISMATCH`。
- 无效 PNG 返回 `WMG_FRAME_FORMAT_UNSUPPORTED`，不泄漏运行时 stack。

### 输出路径

- GIF 默认输出到帧目录内的 `wave-mg/<frames-dir-name>@<fps>fps.gif`。
- APNG 默认输出到帧目录内的 `wave-mg/<frames-dir-name>@<fps>fps.png`。
- 指定 `--out` 时按当前 cwd 解析相对路径。
- 输出已存在且未传 `--overwrite` 时返回 `WMG_OUTPUT_EXISTS`。

### 后端工具

- GIF 使用 `gifski`。
- APNG 使用 `apngasm`。
- GIF 后端不支持 `--loop once`，会返回 `WMG_LOOP_UNSUPPORTED`。
- APNG 将 `forever` 映射为 `-l 0`，`once` 映射为 `-l 1`。

### 诊断

`wave motion doctor` 检查 `gifski` 和 `apngasm`。缺少工具为 warning；带 `framesDir` 时还会检查帧目录。帧数量不足、尺寸不一致、PNG 无效等为 blocking error。

---

## Workspace 行为

`workspace` 创建本地设计项目目录。它不修改或读取 design-token workspace 数据。

### 命令形态

```bash
wave workspace
wave workspace create
```

`wave workspace` 是低记忆入口。CLI 会把它归一化为 `wave workspace create`。

### 配置

配置文件默认读取：

```text
~/.config/wave/workspace.yaml
```

测试或临时运行可用 `WAVE_WORKSPACE_CONFIG` 覆盖配置路径。配置不存在时使用内置默认配置：

- `baseDir: ~/Documents/Work`
- `openAfterCreate: true`
- 名称顺序：`type`、`title`、`version`、`date`、`tags`
- 默认类型：`FEAT`、`VIZ`、`BUG`、`OPT`
- 默认目录：`1.Docs`、`2.Public`、`3.Reference`、`4.Output`、`9.Archive`

### 配置规则

- `name.parts` 使用裸字段名，支持 `type`、`title`、`version`、`date`、`tags`。
- `name.parts` 同时控制 prompt 顺序和工作区名称顺序。
- `enabled: false` 的字段会跳过 prompt 和名称片段。
- 空 optional 值会跳过，不产生重复分隔符。
- `title` 在 v1 必须保持 `enabled: true` 和 `required: true`。
- `type.content` 至少包含一个条目。
- `type.default` 必须匹配 `type.content[].code`。
- `version.prefix` 会标准化输入，例如 prefix 为 `v` 时，`1.0.0` 变为 `v1.0.0`。
- `tags.style` v1 仅支持 `bracket`，`UI,前端` 变为 `[UI][前端]`。
- `folders[].path` 必须是相对路径，不能包含 `..`。
- `folders[].placeholder` 可选；省略时只创建目录。

### 创建行为

确认创建后，Wave 会：

1. 创建 `baseDir`。
2. 若目标工作区目录已存在，返回 `WWK_WORKSPACE_EXISTS`，不覆盖。
3. 创建目标工作区目录。
4. 按配置顺序创建 `folders`。
5. 为配置了 `placeholder` 的目录创建占位文件。
6. 生成 `README.md`。
7. 仅在 `openAfterCreate: true` 时打开 Finder；打开失败只输出 warning，不回滚已创建文件。

### Receipt

创建完成后输出一次 `WORKSPACE` receipt。receipt 展示 `Type`、`Project`、`Workspace`、`FOLDERS` 和 `Workspace created`，不展示配置路径或 placeholder 文件。`version.enabled: false` 时不展示 `Version`。

### 错误码

| Code | Meaning |
| --- | --- |
| `WWK_CONFIG_PARSE_FAILED` | YAML 无法解析。 |
| `WWK_CONFIG_INVALID` | 配置 schema 校验失败。 |
| `WWK_NAME_PART_UNKNOWN` | `name.parts` 引用了未知字段。 |
| `WWK_TITLE_REQUIRED` | `title` 被禁用或为空。 |
| `WWK_TYPE_EMPTY` | `type.content` 为空。 |
| `WWK_TYPE_DEFAULT_INVALID` | `type.default` 不匹配任何 type code。 |
| `WWK_FOLDER_PATH_INVALID` | folder path 是绝对路径或包含 `..`。 |
| `WWK_WORKSPACE_EXISTS` | 目标工作区已存在。 |
| `WWK_CREATE_FAILED` | 目录、placeholder 或 README 创建失败。 |

---

## 资源解析

**内置资源路径：** `src/resources/`

- Palette: `palettes/leonardo.yaml`, `palettes/tailwindcss.yaml`
- Dimension: `dimensions/wave.yaml`

**解析规则：**

1. `$config.resource` 可省略；省略时使用空依赖字典
2. 按 `main.yaml` 中 `$config.resource` 声明顺序尝试读取资源
3. 每个成功加载的资源文件解析后得到 `{ namespace, data }`
4. 重复 namespace 不进入 build 依赖字典；仅在 token 引用该 namespace 时阻塞 build
5. Doctor 对当前检查目标中的缺失、损坏、类型不合法或 namespace 重复声明进行严格检查
6. 成功进入依赖字典的资源保留来源元数据（用于 receipt 和错误定位）

**引用查找顺序：**

1. 显式项目路径：相对路径或绝对路径。`$config.resource` 中的相对路径以当前 `main.yaml` / profile 文件所在目录为基准
2. 用户本地 cache：`~/.cache/wave/resources/<name>.yaml`
3. 内置资源名：`src/resources/<kind>/<name>.yaml`

显式项目路径不被 cache 覆盖。裸资源名才会进入 cache/builtin 查找。

### Resource Update / Status

`build/show` 不会主动解析 latest，也不隐式刷新资源版本。资源更新只发生在显式命令：

```bash
wave dt update
wave dt update tailwindcss
wave dt update tailwindcss --version 3
wave dt update tailwindcss --version 4
wave dt update leonardo
wave dt status
```

**本地路径：**

- cache：`~/.cache/wave/resources/`
- state：`~/.local/state/wave/resources/state.json`
- config：`~/.config/wave/resources/`
- Leonardo recipe：`~/.config/wave/resources/leonardo.yaml`

**Tailwind CSS：**

- `wave dt update tailwindcss` 默认请求 `tailwindcss@latest`，解析为精确版本后写入 state。
- `--version 3` 读取 Tailwind v3 colors source，输出 hex DTCG token。
- `--version 4` 读取 Tailwind v4 `theme.css`，输出 OKLCH DTCG object；black/white 等非 OKLCH 值按源保留。
- 当前用户资源名统一写入 cache 文件 `tailwindcss.yaml`，namespace 为 `tailwindcss`。

**Leonardo：**

- `wave dt update leonardo` 优先读取用户 recipe；不存在则使用 builtin recipe。
- cache 输出拆成 `leonardo-light.yaml` 与 `leonardo-dark.yaml`。
- namespace 分别为 `leonardo-light` 与 `leonardo-dark`，引用形如 `{leonardo-light.color.red.600}`。

**恢复策略：**

- 从未更新过：只使用 builtin，不联网。
- 更新过且 cache 存在：优先使用 cache。
- 更新过但 cache 丢失：裸资源名读取时按 state 自动恢复 cache；Tailwind 恢复会重新获取对应版本，恢复失败时 fallback builtin，并输出明确提示。

**custom 资源限制：**

- 仅限 `.yml`、`.yaml`、`.json` 文件
- 文件结构与其他资源一致：根对象必须恰好有一个顶层 key（namespace）

**内置主题：**

- `BUILTIN_THEMES` 已清空为 `{}`
- `isBuiltinTheme()` 恒返回 `false`
- token 需要外部依赖时，通过 `main.yaml` 的 `$config.resource` 指定资源；自包含 token 图无需声明资源

---

## 引用解析

### 外部引用

- `{leonardo.xxx}`：引用 leonardo palette 颜色
- `{wave.xxx}`：引用 wave dimension 尺寸
- `{namespace.xxx}`：引用任意 dependency namespace

### 内部引用（v0.3.0+）

支持 `{theme.path.to.token}` 格式的文件内部嵌套引用：

```yaml
theme:
  color:
    text:
      default: "{leonardo.global.color.deepGray.light.800}"
      disabled:
        $value:
          color: "{theme.color.text.default}"
          alpha: "{wave.global.dimension.alpha.400}"
```

**循环引用检测：**

- 检测循环引用并在构建时报错
- 错误信息示例：`Circular reference detected: theme.color.a -> theme.color.b -> theme.color.a`
- 退出码：5

**未解析引用提示：**

- 无法解析的 `{theme.xxx}` 引用会显示详细信息
- 错误信息示例：`Unresolved theme references found: - {theme.color.nonexistent} at theme.color.text.missing`
- 退出码：5

**跨依赖引用限制：**

- 资源文件（dependency）之间禁止互相引用
- 检测到跨依赖引用时报错：`Cross-dependency reference detected`

**性能：** 10 层嵌套以内 < 0.001ms/次，无深度限制

### DTCG $ref 引用（v0.4.0+）

支持 DTCG 规范的 JSON Pointer 格式引用，用于嵌套对象中的 token 引用。

**语法格式：** `$ref: "#/source/path"` 或 `$ref: "#/source/path/$value"`

- `#/source/path` - 返回引用的完整对象（包括 `$type`, `$description`, `$value` 等）
- `#/source/path/$value` - 仅返回 token 的 `$value` 值

**示例：**

```yaml
theme:
  color:
    shadow:
      $value: "#2b3248"
    gradient-mask:
      $type: gradient
      $value:
        - color:
            $ref: "#/theme/color/shadow/$value"
            alpha: 0.5
          position: 0
```

**特性：**

- JSON Pointer 格式（RFC 6901）
- 支持属性合并（`$ref` + `alpha`/`color`）
- 支持嵌套对象和数组
- 兼容外部源（`#/leonardo/...`, `#/wave/...`, `#/{任意 namespace}/...`）
- 自动循环引用检测

**解析顺序：**

1. Pass 1：解析外部引用（`#/leonardo/*`, `#/wave/*`, `#/{任意 namespace}/*`）
2. Pass 2：解析内部主题引用（`#/theme/*`）

**属性合并规则：**

- 标量值 + `alpha`/`color` → `{ color: 值, alpha: x }`
- 标量值 + 其他属性 → `{ value: 值, ...其他 }`
- 对象值 + 属性 → `{ ...原对象, ...新属性 }`（新属性覆盖）

**与花括号引用的对比：**

| 特性           | 花括号 `{...}`  | DTCG `$ref`                    |
| -------------- | --------------- | ------------------------------ |
| 格式           | `{source.path}` | `$ref: "#/source/path/$value"` |
| 适用场景       | 简单值替换      | 嵌套对象中的引用               |
| 属性合并       | 不支持          | 支持                           |
| 标准符合       | Wave 特有       | DTCG 规范                      |
| 未知 namespace | 保留原字符串    | 解析失败报错                   |

### Group $extends 继承（v0.12.0+）

支持 DTCG 规范的 Group 继承机制，允许一个 Group 继承另一个 Group 的所有属性。

**语法格式：** `$extends: "{path.to.group}"`

**规则：**

- `$extends` 只能在 Group 对象上使用（不能在有 `$value` 的 Token 上使用）
- 路径使用完整路径格式 `{path.to.group}`，首段必须是文档顶层 key（如 `theme`、`component`）
- 支持链式继承（A → B → C）
- 子 Group 的属性会覆盖父 Group 的同名属性
- 嵌套 Group 会深度合并（deep merge）
- `$type` 和 `$description` 可以被继承，也可以被子 Group 覆盖
- `$extensions` 深度合并：子覆盖同名扩展属性，保留父的其他扩展

**多顶层 group 支持（v0.13.0+）：**

文档的所有顶层非 `$` key 均视为内部根 key。`{theme.xxx}` 和 `{component.xxx}` 都是内部引用，`{wave.xxx}` 等非顶层 key 为外部引用。

```yaml
# 两个顶层 group：theme 和 component
theme:
  color:
    primary:
      $value: "#0066cc"

component:
  button:
    outline:
      fill:
        $value: "{theme.color.primary}"
```

**示例：**

```yaml
theme:
  component:
    button:
      base:
        $type: color
        $description: 基础按钮样式
        background:
          $value: "{tailwindcss.color.gray.200}"
        text:
          $value: "{tailwindcss.color.gray.700}"
        radius:
          $type: dimension
          $value: { value: 4, unit: px }

      primary:
        $extends: "{theme.component.button.base}"
        $description: 主要按钮样式（继承自基础）
        background:
          $value: "{tailwindcss.color.indigo.600}"
        # text 和 radius 从 base 继承
```

**继承结果：**

- `primary` 继承了 `base` 的 `text` 和 `radius`
- `primary` 覆盖了 `background` 和 `$description`
- 最终 `primary` 包含：background（新值）、text（继承）、radius（继承）

**错误处理：**

- `$extends` 在 Token 上：schema 错误
- `$extends` 路径格式错误：schema 错误
- `$extends` 目标不存在：展开错误
- `$extends` 目标是一个 Token（不是 Group）：展开错误
- 循环继承（A → B → A）：circular_reference 错误

---

## Token 身份（$id）

Wave 为 theme 引入两层稳定身份。`$` 属性命名空间被 DTCG 预留给未来规范属性（DTCG Format 2025.10 §5.1.1），两层 `$id` 因此都是显式登记的 Wave 方言：只做加法，不改标准语义；文档级 `$schema` 是同型先例。若 DTCG 未来标准化身份属性，Wave 将迁移对齐，不把本方言固化为私有标准。

### 文档级 `$id`（主题身份）

- 只允许声明在 `main.yaml` 根部，与 `$config.theme` 同待遇；named profile 或 night overlay 根部声明 `$id` 报错。
- 声明时必须是非空字符串，否则 `FORMAT_ERROR`；`$id` 在进入 token 树前被剥离，不参与任何 token 输出。
- 主题身份经 config 合并流入所有 profile 构建；sketch payload 的 `meta.themeId` 取自该值，未声明时为 `null`。
- 其他格式（json / jsonc / css / md-yml）不携带任何 id。

### token 级 `$id`（token 身份）

三态合同：

| 状态 | 含义 | 后果 |
| --- | --- | --- |
| 缺省（无 `$id` 键） | 未入账 | 无身份；sketch 记录省略 `uuid` |
| 空值（`null` 或空白字符串） | 预声明槽位 | 等待显式命令填充 |
| 非空字符串 | 已入账身份 | 参与 payload 与同步 |

- 合同为「非空 + theme 内唯一」，不锁编码语义。wave 生成的规范形态是 32 位小写 hex（`crypto.randomBytes(16).toString('hex')`，等价 `openssl rand -hex 16`）；非规范形态不报错，只产生 doctor 提示核对是否手误，且不会被命令改写。
- 入账范围是全部 theme token；group 不持有身份；resource 与外部 namespace 不参与入账。
- `$id` 只存在于文档根与 token 节点两级，group 声明 `$id` 报错。
- `$id` 写在 `$description` 与 `$value` 之间仅为文档示例惯例，规范展示位置不进协议。
- build 保持只读：身份的生成与写回只发生在显式命令 `wave dt ids`。

### 校验阶梯

- build 报错：token/group 混合体（DTCG §6.1 MUST）；组级 `$id`；night override 携带与 base 不同的非空 `$id`（身份永不静默重分配）；引用悬空/循环。
- build 降级：单 pass 内重复 uuid 时按文档序首个保留，其余本 pass 无 id 并告警；未入账 token 的 payload 记录省略 `uuid`。
- doctor（严格健康项）：跨文件身份冲突为 error，影响退出码；「类型不可判定」（DTCG §5.2.2）落位为 doctor error，build 保持宽容——判定通道为 `$type`、组继承、reference 解析类型、`color` 根名通道、`$extends` 延迟，五路皆无且值非引用非 null 才报；另报未入账清单、空 `$id` 槽位、非生成形态提示，以及疑似笔误的空节点（无 `$value` 且无子节点，DTCG §6.5 SHOULD 的落实）。
- 单 pass 构建只校验本 pass 可见范围；跨文件一致性归 `wave dt ids` 与 doctor。
- night overlay：override 的 `$id` 与 base 相同或缺省时继承 base 身份；同路径同 id（跨文件）= 一致，是 ids 同步后的健康终态，不是冲突。

### `wave dt ids` 命令合同

- 职责：填充空 `$id` 槽位、为新增 token 生成身份、把路径权威 id 同步进各文件共享路径节点、跨文件身份冲突报错、单文件重复 id 修复；同时把 `main.yaml` 根部 `$id`（主题身份）作为文档级槽位维护——缺失或为空时铸造/填充（写为文档首键，计入 `added` 与报告），已入账则永不重铸，profile 与 night 文件不持有文档级身份。节点式身份下「悬空」状态类不存在，无清理职责。
- 加载面：`main.yaml` + `profiles/*.yaml`（day 文件）。night overlay 不在加载面内：override 身份在加载时继承 base，从不物理写入。
- 安全语义：默认（无参）= dry-run 仅输出报告；显式 `--write` 才执行写回；写回前要求 git 工作区清洁，不清洁时拒绝并提示 `--allow-dirty` 显式豁免。dry-run 完全不经过 git gate；非 git 目录产生 warning 并照常写入。
- 认养与生成：已入账（非空）`$id` 保持不变，是该路径的权威；空槽位与未入账 token 认养所在路径的权威（`main.yaml` 是 workspace 权威，main 未入账时反向认养 profile 的已入账 id）；路径在全部文件中都无已入账身份时，在首个出现处生成新 id，同 run 内后续出现处认养它。报告计数：`added` = 新生成身份原点，`synced` = 认养权威 id 的出现处。
- 冲突三分语义：同 id 不同路径（跨文件）= 冲突；同路径不同 id（跨文件）= 冲突；同路径同 id（跨文件）= 一致。任何冲突都是硬阻塞：全 workspace 零写入（all-or-nothing）。
- 单文件重复 id 修复：文档序首个保留，副本重新生成 id 并在报告中可见。
- 写回为手术式插入/填充（复用 migrate 的 CST 写回机制）：保留注释、空行、缩进与既有键序；文件无法字节级 round-trip 时报错并要求手工迁移；第二次运行是 no-op（幂等）。
- 入口合同：`-f, --file` 必须指向 `main.yaml`；缺失返回 `FILE_NOT_FOUND`，非 main 文件返回 `INVALID_PARAMETER`。

---

## DTCG 色彩空间支持

Wave 接受 DTCG Color Module 2025.10 风格颜色对象：

```yaml
$value:
  colorSpace: oklch
  components: [0.518, 0.251, 262.6]
  alpha: 1
  hex: "#0052f5"
```

- `colorSpace` 和 `components` 必填。
- `components` 可包含 number 或 `none`。
- `alpha` 可选，缺省为 1。
- `hex` 可选，只作为 fallback，且必须是 6 位 `#RRGGBB`。alpha 不写入 `hex`。
- `{ hex: "#0052f5" }` 不是合法 DTCG Color，也不是 Wave 语法。

当前可计算输出空间为 `hex`、`oklch`、`srgb`、`hsl`。其他 DTCG 标准色彩空间只有在提供合法 `hex` fallback 时才能输出；没有 fallback 时构建失败。

旧语法继续兼容：

```yaml
$value: "#000000"
```

```yaml
$value:
  color: "#000000"
  alpha: 0.5
```

颜色转换发生在 transformer 输出阶段，不发生在 parser、resource loader 或 resolver。同一个 `platform: css,sketch` pass 仍然合法；CSS/JSON/JSONC/md-yml 使用 pass 指定的 `colorSpace`，Sketch 平台在生成阶段使用 hex-normalized token set，并输出 `#RRGGBBAA`。

---

## Wave 扩展

### $extensions 形态与迁移（platform.sketch）

`$extensions` 家族归拢为两个挂载点：

- `platform.sketch.{ path, property, skip, outline }`：Sketch 平台专属字段
- `typography.baseFontSize`：跨平台语义基准，保持顶层（唯一允许位置 `theme.font`）

规则：

- 位置语义沿用：`path` 与 `skip` 可写在 group 或 token 上（`skip` 按最近声明继承，token 显式 boolean 覆盖祖先；`path` 解析优先级为 token 自身 > 最近父级 group > 更上层祖先 group）；`property` 只能在 token 上；`outline` 只在 token 上生效，group 级静默忽略（与 legacy 行为对齐）。
- 未知 `platform.<key>`（如 `figma`）产生 warning，不报错——这是为未来平台预留的前瞻兼容姿态；`platform.sketch` 下未知字段、未知 property 与非法值仍然报错。
- legacy 形态（`$extensions.sketch.*`、`$extensions.outline`）在 schema 层直接拒绝，无兼容层；错误信息带 `wave dt migrate-extensions` 指引。legacy `$extensions.sketchMap` 同样不再作为 Sketch property 映射来源。
- `$extends` 继承时 `$extensions` 按顶层浅合并：子 group 的 `platform` 键整体覆盖父 group 的 `platform`，不做 `platform.sketch` 子键级深度合并。
- 输出后 `$extensions` 被消费，不泄漏到 json / jsonc / css / sketch / md-yml。

**`wave dt migrate-extensions` 命令合同：**

- 一次性机械改名：`$extensions.sketch.*` → `$extensions.platform.sketch.*`；`$extensions.outline` → `$extensions.platform.sketch.outline`。`typography` 保持顶层，不参与迁移。
- 默认 dry-run 仅输出报告；显式 `--write` 才写回。
- 扫描面 = `main.yaml` + `profiles/*.yaml`。根级 night 文件不在扫描面：night 的身份与覆盖经 merge 继承在加载时消化，源文件中不产生需要迁移的新形态。
- 混合形态文件（同文件内 legacy 与新形态并存）报错，不做猜测或部分合并；文件无法字节级 round-trip 时同样报 `unsupported`，需手工处理。阻塞文件存在时全 workspace 零写入。
- 改写是手术式的（注释、空行、缩进、键序保持不变），第二次运行是 no-op（幂等）。

### composite（v0.13.0）

标记 Group 为复合 token，输出为嵌套对象而非扁平 key-value。适用于组件变体等需要将多个属性作为一个整体输出的场景。

**声明格式：**

```yaml
component:
  button:
    outline:
      $extensions:
        composite: true
      fill:
        $value: "{theme.color.container.low}"
      border:
        $value: "{theme.color.border.emphasis}"

    outline-max:
      $extends: "{component.button.outline}"
      radius:
        $value: "9999px"
```

**输出结果：**

```json
{
  "button-outline": { "fill": "#ffffff", "border": "#1d293d3d" },
  "button-outline-max": { "fill": "#ffffff", "border": "#1d293d3d", "radius": "9999px" }
}
```

**规则：**

- composite group 的直接子节点必须都是 token（有 `$value`），出现子 group 则 schema 报错
- 可通过 `$extends` 继承 composite 标记
- 仅影响 JSON/JSONC/md-yml 输出格式，CSS 和 Sketch 输出不受影响
- 与普通 flat token 可在同一个文档中混合使用

### smoothGradient（v1）

为标准 `gradient` token 增加平滑过渡能力。通过在 token 上附加 `$extensions.smoothGradient`，transformer 会在输出前自动将 2 个端点扩展为按 cubic-bezier 曲线采样后的 stops 列表。

**声明格式：**

```yaml
theme:
  overlay:
    $type: gradient
    hero:
      $value:
        - color: "#ff0000"
          position: 0
        - color: "#0000ff"
          position: 1
      $extensions:
        smoothGradient:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 5
```

`cubicBezier` 也支持引用 wave dimension 中的预定义曲线（resolver 会自动解析 `$extensions` 中的引用）：

```yaml
$extensions:
  smoothGradient:
    cubicBezier: "{wave.dimension.cubicBezier.easeInCubic}"
    step: 9
```

**规则：**

- `cubicBezier`：长度为 4 的数组 `[x1, y1, x2, y2]`，与 CSS cubic-bezier 控制点语义一致；支持直接写数组或引用 dimension 资源
- `step`：总节点数（包含起点和终点），必须为整数且 `>= 2`
- 输入 gradient 必须恰好包含 **2 个 stop**，否则报错
- 所有生成 stop 的 `position` 线性等距分布，输出时保留 **2 位小数**
- `alpha` 按曲线采样值在两端点 alpha 之间插值，并 `clamp` 到 `[0, 1]`
- v1 **不做中间颜色插值**：生成 stop 的颜色只使用端点原色
- `$extensions` 在 transform 阶段被消费，**不会泄漏**到最终 json / css / sketch / md-yml 输出

**与标准 gradient 的关系：**

`smoothGradient` 不改变 token 的 `$type`，输出仍然是标准 gradient 数组。CSS formatter 会沿用现有 `gradientToCss` 逻辑，无需在 generator 层做任何修改。

### smoothShadow（v1）

为标准 `shadow` token 增加平滑过渡能力。通过在 token 上附加 `$extensions.smoothShadow`，transformer 会在输出前自动将单个 shadow layer 扩展为按 cubic-bezier 曲线采样后的 layers 数组。

**声明格式：**

```yaml
theme:
  shadow:
    $type: shadow
    raised:
      $value:
        color: "#000000cc"
        offsetX: 0
        offsetY: 6
        blur: 12
        spread: 0
      $extensions:
        smoothShadow:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 3
```

`cubicBezier` 也支持引用 wave dimension 中的预定义曲线（resolver 会自动解析 `$extensions` 中的引用）：

```yaml
$extensions:
  smoothShadow:
    cubicBezier: "{wave.dimension.cubicBezier.easeInCubic}"
    step: 3
```

**规则：**

- `cubicBezier`：长度为 4 的数组 `[x1, y1, x2, y2]`，与 CSS cubic-bezier 控制点语义一致；支持直接写数组或引用 dimension 资源
- `step`：可见层数，必须为整数且 `>= 1`
- 输入 shadow 必须是**单个 layer 对象**（非数组），否则报错
- 内部采样逻辑：按 `step + 1` 采样并舍去最后一个零层（`offset/blur/spread/alpha = 0`），只输出 N 个可见层
- **从小到大排列**：第 0 层最接近零层，最后一层保持原始 base 值，与 CSS `box-shadow: small, medium, large` 的书写顺序一致
- `offsetX`、`offsetY`、`blur`、`spread` 线性衰减至 0
  - `number` 类型取整输出（默认 `px`）
  - `rem` 字符串保留 **3 位小数**
  - 其他单位字符串取整输出
- `alpha` 按曲线采样值从 `0` 到 `baseAlpha` 插值，保留 **2 位小数**
- `inset: true` 会被复制到所有派生层
- `$extensions` 在 transform 阶段被消费，**不会泄漏**到最终 json / css / sketch / md-yml 输出

**与标准 shadow 的关系：**

`smoothShadow` 不改变 token 的 `$type`，输出仍然是标准 shadow 数组。CSS formatter 沿用现有 `shadowToCss` 逻辑，支持带单位的数值，无需在 generator 层做额外修改。

---

### inheritColor（v1）

为 color token 提供继承色语义，用于表达"从父级/上下文继承颜色"的设计意图。

**声明格式：**

布尔简写（最常见）：

```yaml
theme:
  color:
    $type: color
    inheritPlain:
      $value: "#0066cc"
      $extensions:
        inheritColor: true
```

对象形式（带透明度）：

```yaml
theme:
  color:
    $type: color
    inheritSemi:
      $value: "#cc0000"
      $extensions:
        inheritColor:
          property:
            opacity: 0.5
```

对象形式（带 alpha）：

```yaml
theme:
  color:
    $type: color
    border:
      $value: "#ff00ff"
      $extensions:
        inheritColor:
          property:
            alpha: "{wave.dimension.alpha.400}"
```

**规则：**

- inheritColor 只能用于 \$type: color 的 token
- opacity 和 alpha 均支持数字、alias 或 \$ref，可共存但通常不会
- alpha 表达色彩通道，opacity 表达对象透明度，alpha-first
- siblingSlot 仅用于 Sketch 平台

**输出差异：**

| 平台 | opacity | alpha |
|------|---------|-------|
| CSS | `color-mix(in srgb, currentColor X%, transparent)` | 同 opacity |
| Flat JSON | `{ color: "$COLOR_FOREGROUND", opacity: X }` | `{ color: "$COLOR_FOREGROUND", alpha: X }` |
| Sketch | `opacity` 字段 | `alpha` 字段（可与 opacity 共存） |

### doctor.wcagPairs

独立 rootKey `doctor`，用于声明 WCAG 对比度检查 pair。非必需，不存在时 `wave doctor --contrast` 提示无可检查配对。

**声明格式：**

```yaml
doctor:
  wcagPairs:
    primary-on-surface:
      foreground: "{theme.color.on-surface}"
      background: "{theme.color.surface}"
    primary-on-container:
      foreground: "{theme.color.on-container}"
      background: "{theme.color.primary.container}"
```

**规则：**

- `doctor` 为非必需 rootKey，不参与 theme 输出（JSON/CSS 等）
- `doctor` 下必须包含 `wcagPairs`，值为对象
- 每个 pair entry 的 key 是自定义组名，值为 `{ foreground, background }` 对象
- `foreground` / `background` 值为 alias 字符串，格式为 `{path.to.token}`
- alias 指向的 token 必须是已解析的 color 类型

**评分维度与阈值（WCAG 2.2）：**

- Normal Text：AA=4.5 / AAA=7
- Large Text：AA=3 / AAA=4.5
- UI Components：AA=3（无 AAA 判定）

**评分规则：**

- 对比计算基于 resolved theme data，阈值判定使用**未四舍五入**的 ratio
- v1 不做半透明合成；若 background/foreground 任一存在 alpha < 1，会作为执行错误报告
- 红色评分仅做报告，**不阻断命令**（退出码仍为 0）
- 非法 schema、无效引用、非 color 使用等会返回**非零退出码**

**Profile 支持：**

- 默认检查 `main.yaml`
- `--profile <name>` 检查 `profiles/<name>.yaml`
- `--night` 检查有效的 `main@night.yaml` 或 `profiles/<name>@night.yaml` overlay
- 无显式 scope + 交互 TTY + 单主题：自动检查
- 无显式 scope + 交互 TTY + 多主题：TUI 选择器
- 无显式 scope + 非 TTY：默认 main

**使用方式：**

```bash
# 默认读取当前目录 main.yaml，检查 default profile
wave dt wcag

# 显式指定 main.yaml 路径
wave dt wcag --file ./my-theme/main.yaml

# 检查 night profile
wave dt wcag --night

# 检查指定 profile
wave dt wcag --profile mobile

# 检查 profile 的 night overlay
wave dt wcag --profile mobile --night
```

---

## 输出格式

- `json`（默认）：输出 `{theme}.json`，扁平化 KV，kebab-case 键名
- `jsonc`：输出 `{theme}.jsonc`，带描述注释的 JSON
- `css`：输出 `{theme}.css`，CSS 变量，带描述注释
  - 输出 public roots：`color`、`state`、`shadow`、`gradient`、`border`、`radius`、`font`
  - 不输出 `theme.dimension`
  - 长度类数值自动补浏览器需要的 `px`
  - `$type: typography` token 仅输出 materialized 字段变量（`-family`、`-size`、`-weight`、`-line-height`、`-letter-spacing`、可选 `-color`），不输出聚合 shorthand 变量（本合同取代已移除的每 token 聚合 shorthand 输出：shorthand 在字段缺失时引用未定义变量，计算值阶段失效）；group `typography.defaults` 按祖先到 token 浅合并，数组 font family 按 CSS stack 规则序列化；与已输出 `fontFamily` token 等值时省略局部 `-family` 字段变量，由 consumer 取用该 family token 自身的变量，否则保留局部 family；倍率 line height 保持无单位；可选 color 独立输出，直接引用已输出的 `theme.color.*` 时保留 CSS variable 引用
  - typography 支持 `px`、`pt`、`rem`。`rem` 默认使用 16px；可在唯一允许的位置 `theme.font.$extensions.typography.baseFontSize` 以大于 0 的无单位 CSS px 数值覆盖。使用 rem 时 CSS 在 `:root` 输出有效 `font-size`，并保留 token 中的 rem 值。此内部 metadata 不输出到 JSON、JSONC 或 md-yml
  - DTCG border `style.dashArray` 输出 `dashed` shorthand 和 `-dash-array` companion variable
  - 带 `$extensions.platform.sketch.outline.offset` 的 border token 输出 outline value 变量和 offset companion 变量
- `sketch`：输出 sync-token 协议 payload v2 资产清单 `{theme}2sketch.json`。硬切换，无 v1 兼容路径；v1 嵌套树与 composite color-slot `@/` 引用合同由本节取代，simple-wiki 2026-07-13 sketch 系列的旧合同描述一并作废
  - 根部为 `meta` 与 `assets`：`meta` 始终存在，形如 `{ themeId, version: 2 }`；`themeId` 取自 `main.yaml` 文档级 `$id`，未入账主题为 `null`（由插件侧 notice 提示补登记，与 `uuid` 缺失同待遇）
  - `assets` 是一行一资产的扁平数组，记录形如 `{ uuid?, name, kind, <载荷> }`；记录排序按源顺序，保持 diff 稳定；未入账 token 的记录省略 `uuid`
  - `kind` 三分：`color`（color token 与 inheritColor token，对应插件 Swatch）、`text`（typography token，对应 Shared Text Style）、`layer`（outline border、shadow、gradient、radius 路径维度、sketch property 维度，对应 Shared Layer Style）
  - payload 范围 = 可同步资产：普通 border、generic dimension、transition、strokeStyle 与未知 payload 不产生记录（v1 的 `{ value }` 保存形态随之废止）；`sketch.skip` 命中与无值槽位在组装前排除
  - text 载荷为 5 个纯字体字段：`fontFamily`（可选）、`fontSize`、`fontWeight`、`lineHeight`、`kerning`。v1 `textStyle.textColor` 退役：文字颜色不再内嵌于 text 记录，颜色表达统一走颜色资产。`fontWeight` 仅接受 100-900 整百刻度——这是 sketch pass 的 formatter 层平台合同，不上升为 token 输入限制；非整百值在 sketch pass 构建报错（wave 侧 fail-fast，不等插件 preflight），CSS/JSON 等平台不受影响
  - layer 载荷为可组合字段：`fills` / `shadows` / `gradient` / `opacity` / `corners`；单记录同类 key 至多一次，`fills` 与 `gradient` 互斥；`fills` 为协议预留，wave 当前无生产者（color token 走 `kind: color`）
  - swatch 引用：layer 记录中的颜色位置（`shadows[].color`、`gradient.color`）写 `{ "$ref": "<uuid>" }` = 绑定同清单 color 记录产生的 Swatch，取代 v1 `@/<路径>` 字符串合同。仅绑定同清单已入账 color 记录；目标未入账或属外部 namespace 时降级为 HEX8 快照；内部引用解析不到 emitted 记录时 build 报错。layer `$ref` 为试用期：插件实测 update 不稳时降级，单点切换开关为 `src/core/generator/formats/sketch.ts` 的 `SKETCH_SWATCH_REF_MODE`（`'ref'` | `'hex'`），翻转为 `'hex'` 即整份 payload 退化为 HEX8 快照
  - 插件侧认养规则（跨仓合同注记）：记录 uuid 对插件关系表未知且 name 命中未登记资产时，插件按 name 认养并补登记；name 命中已登记于其它 uuid 的资产时 duplicate 零写入
  - 含 alpha/opacity override 的颜色保持 HEX8（折入 alpha 通道）；未绑定 `$ref` 的颜色位置输出 HEX8 快照；outline ring 的 gap 层固定 `#ffffffff`
  - name 生成规则：`platform.sketch.path` 前缀 + `filterLayer` 处理后的叶子 key，以 `/` 连接；`platform.sketch.path` 优先级为 token 自身 > 最近父级 group > 更上层祖先 group。name 是扁平数据，不构成树，前缀重叠合法（如 `shadow` 与 `shadow/elevation-1` 共存）。name 在单份 payload 内唯一，精确重复 = build 报错（继承 v1 输出路径硬报错语义）；检测与 token 顺序无关，失败时不写本次 pending outputs
  - shadow layer 的 `inset: true` 随载荷输出。这是 wave 对插件协议 10b key 表之外的加法，登记于此，跨仓以插件仓确认为准
  - 带 `platform.sketch.outline.offset` 的 border token 生成 `shadows` 载荷模拟 outline，最终 JSON 顺序为 ring layer 在前、gap layer 在后；普通 DTCG dashed border 不是可同步资产，不产生记录
  - inheritColor 通过 siblingSlot 查找兄弟 token 颜色，但输出始终 materialize 为 HEX8；内部 color reference 的目标被 `sketch.skip` 跳过或被 root selection 排除时，build 必须报错，不得以 HEX8 降级
  - `$type: typography` 生成 text 记录；数组 font family 优先选择 `PingFang SC`。rem 的 `fontSize`、绝对 `lineHeight` 和 `letterSpacing` 使用有效基准（默认 16，或 `baseFontSize`）换算；fontSize 与 letterSpacing 最多保留三位小数。最终 lineHeight 始终向上取整为整数：倍率使用换算后字号计算，绝对 px/pt/rem 使用数值或换算结果后取整
  - component token 不映射为 Sketch component 样式；component 逻辑后续单独设计
- `md-yml`：输出 `{theme}2md.yml`，供用户复制到 Markdown frontmatter
  - 输出是 YAML fragment，不包含 `---` delimiter、注释、token wrapper 或 `$type` / `$value` / `$description` metadata
  - `filterLayer` 后的第一段是 namespace，剩余 source path 用 `-` 连接成 local key；过滤后必须至少保留 namespace 和 local key
  - theme direct reference 在目标也存在于同一输出 payload、consumer slot 仍与目标最终值等价时，输出为 `{namespace.local-key}`；支持完整 token、composite 子字段、数组成员和 typography defaults 继承的引用
  - external resource reference、`$ref + override`、`smoothShadow` / `smoothGradient`、`inheritColor` / `currentColor` 等 computed value 输出 transformer 处理后的最终值
  - dimension 保留单位字符串，object、array 和 explicit composite 保留结构
  - 值只接受 YAML 可无损表示的 null、有限 number、string、boolean、密集 array 和 plain object；遇到 `undefined`、非有限 number、稀疏或含额外 own key 的 array、cycle、accessor 或非 plain object 时失败
  - source segment 不能为空或含 `.`；hyphen-join 后的重名、direct/composite 重名或 composite property 重名都会失败，不会改写该 pass 的其他平台产物
- 多平台：`json,jsonc,css,sketch,md-yml` 可同时输出多种格式

CSS 不使用 Sketch 的 swatch `$ref` 绑定，保持既有颜色引用行为，包括 typography color 对已输出 `theme.color.*` 的 `var(--<color-token>)` 引用。v1 的 `@` importer 合同已随 payload v2 废止，Sketch 颜色绑定改在 payload 内部以 `$ref` 表达。

**备注位置（v0.3.0+）：**

- 单行 `$description`：显示在 token 同一行末尾
- 多行 `$description`：保持在 token 上方

**排序保持（v0.3.0+）：** 输出 token 顺序与 `main.yaml` 定义顺序一致

---

## 检测机制

**Profile 与 Night Mode：**

- 默认只构建 `{themeDir}/main.yaml`
- `--profile <name>` 构建 `{themeDir}/profiles/<name>.yaml`
- `--profiles all` 构建 `main.yaml` 和所有 `profiles/*.yaml`
- `--night` 包含有效的 `main@night.yaml` 或 `profiles/<name>@night.yaml`
- 缺失或无效的 Night Mode 输出 `Night Mode unavailable/invalid and skipped`，并跳过 night 输出

---

## 错误处理（Fail-Fast）

- 若 `main.yaml` 存在但解析失败（引用错误、格式错误等），直接返回非 0 退出码，**不再 fallback 到依赖直出**
- 同样适用于 day profile 文件；缺失或无效的 Night Mode overlay 只跳过 night 输出，不影响 day build

---

## 退出码

- `0`：SUCCESS
- `1`：GENERAL_ERROR
- `2`：INVALID_COMMAND
- `3`：THEME_NOT_FOUND
- `4`：MISSING_PARAMETER
- `5`：INVALID_PARAMETER（含循环引用、未解析引用、不支持的色彩空间）
- `10`：FILE_NOT_FOUND
- `11`：PERMISSION_DENIED
- `12`：FORMAT_ERROR
- `13`：INVALID_RESOURCE
- `14`：MISSING_BRAND
- `15`：BRAND_FORMAT_ERROR

---

## 测试固件系统

### Transformer 模块边界

design-token 的 DTCG 解析、引用解析和输出格式化分层保持分离。`src/core/transformer/theme-transformer.ts` 负责遍历已解析 token 树、维持输出顺序，并编排扩展转换；具体扩展归一化应放在同目录下的专属模块中。

当前专属模块：

- `sketch-extension.ts`：归一化 `$extensions.platform.sketch.{path, property, skip}` 与 outline，只输出 `_sketch` 元数据
- `inherit-color-extension.ts`：归一化 `$extensions.inheritColor`，只输出 inheritColor 相关元数据和必要的 value 替换

新增 Sketch 或设计工具特例时，不要把平台命名规则写进 parser 或 resource resolver；优先在 transformer 生成平台元数据，再由对应 generator 消费。

### 目录结构

```
tests/
├── fixtures/themes/    # 标准主题模板
├── integration/        # 集成测试
└── utils/              # 测试工具
```

### Fixture 加载工具

`tests/utils/fixture-loader.ts` 提供：

- `loadTestTheme(name)` - 加载 `fixtures/themes/{name}/` 下的标准主题
- `createTempTheme(config)` - 动态创建临时主题（用于边界测试）
- `cleanupTempTheme(theme)` - 清理临时目录
- `expectOutputToMatch(actual, expected)` - 断言输出匹配

### 标准主题固件

| 固件名称        | 用途                                                   |
| --------------- | ------------------------------------------------------ |
| `standard`      | 标准主题（颜色、阴影、dimension 引用）                 |
| `ref-test`      | $ref 引用测试（内部/外部/属性合并）                    |
| `inherit-color` | inheritColor 扩展测试（布尔/对象/siblingSlot/opacity） |
| `extends-test`  | $extends 继承测试（组件变体/链式继承/deep merge）      |

### 添加新测试

```typescript
import { loadTestTheme, createTempTheme } from "../utils/fixture-loader.ts";

test("应处理 xxx", async () => {
  const theme = await loadTestTheme("standard");
  // 或使用临时主题
  const temp = await createTempTheme({
    name: "test",
    tokens: {
      color: {
        /* ... */
      },
    },
  });
});
```

---

## 范围边界（明确不做）

- 内置主题：已移除，`wave dt build` 不接受内置主题名作为 workspace 输入
- Windows/Linux 平台：未测试
- 嵌套引用条件判断：`{theme.x ? a : b}` 格式不支持
- 跨 profile 引用：Profile A 不能引用 Profile B 的 token
- RGB 格式：仅支持 sRGB 组件格式
