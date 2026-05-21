# Wave 瑞士军刀化重构设计

> 状态：设计草案
> 目标：记录 Wave 从单一 design token CLI 演进为设计师本地瑞士军刀 CLI 的产品与工程决策。

---

## 一、定位

Wave 的长期定位是 **Designer Swiss Knife CLI**：一把面向 UI/UX 设计师的小巧本地工具箱。

当前 Wave 的核心能力是 design token 生成。重构后，design token 只是 Wave 的第一个能力域，后续还会纳入素材压缩、动效资产生成等高频设计交付工作。

`docs/SPEC.md` 仍记录当前旧版行为。本文记录下一阶段产品和工程架构设计；瑞士军刀化重构完成并真实改变行为后，再更新 `docs/SPEC.md`。

## 二、问题定义

### 目标用户

UI/UX 设计师，懂基础 HTML/CSS，不熟悉复杂脚本、图片工具、CLI 参数。

### 核心挣扎时刻

1. 交付 token 时，不确定输出是否完整、路径是否正确、对比度是否可用。
2. 交付素材时，需要压缩 PNG/JPG/SVG/GIF，但不想上传第三方服务，也不想记多个工具参数。
3. 交付动效时，已有 PNG 帧，但不知道如何稳定生成 GIF/APNG。

### 当前替代方案

- 手动使用网页压缩工具，隐私和批处理不稳定。
- 临时搜索命令行工具，参数记忆成本高。
- 交给开发处理，设计交付链路被打断。

### Wave 要解决的问题

Wave 不是泛化自动化工具，而是把高频、低创造性、容易出错的设计交付动作收进一个本地 CLI。

## 三、CLI 信息架构

Wave 的主命令保留为：

```bash
wave
```

一级能力域：

```bash
wave install
wave doctor
wave dt ...
wave compress ...
wave motion ...
wave mg ...              # motion alias
```

### 3.1 design-token

`dt` 是 design-token 能力域。`wave dt` 不带子命令时，默认等价于 `wave dt build`。

```bash
wave dt
wave dt build
wave dt init
wave dt show
wave dt doctor
wave dt wcag
```

命令职责：

- `build`：生成 design token 输出。
- `init`：创建 design-token 工作区。
- `show`：查看解析后的 token。
- `doctor`：检查 design-token 工作区健康，不做 WCAG。
- `wcag`：检查颜色对比度，不生成报告。

不保留旧命令兼容层；`create`、顶层 `show`、顶层 `init` 不进入新主模型。`migrate` 不作为 v1 核心链路，后续如确有需要，可作为一次性迁移辅助工具单独设计。

`wave dt wcag` 的检查范围：

```bash
wave dt wcag              # 默认检查 main.yaml
wave dt wcag main         # 检查 main.yaml
wave dt wcag main --night # 检查 main@night.yaml
wave dt wcag dark         # 检查 variants/dark.yaml
wave dt wcag dark --night # 检查 variants/dark@night.yaml
```

指定内容不存在时，直接报错并列出当前可检查的 scope。

`wave dt [file]` 等价于 `wave dt build [file]`。`[file]` 只能是 `main.yaml` 路径；不支持把 resource 文件、variant 文件或目录作为 `wave dt` 的位置参数。

帮助层级：

- `wave`：展示全局模块、全局 flags 和通用说明。
- `wave dt`：展示 design-token 模块命令、模块 flags 和默认行为。
- `wave dt wcag`：展示 WCAG 检查用法和 scope 规则。

全局 flags：

```bash
-h, --help
-v, --version
--cwd <path>
--verbose
--quiet
--no-color
--json
```

通用业务 flags 只在支持对应语义的命令中出现，不强制所有命令接收：

```bash
--dry-run
--yes
--check
-o, --out <path>
-q, --quality <value>
```

`dt` 模块 flags：

```bash
-f, --file <path>
-o, --out <path>
--platform <name>     # 可重复，不支持逗号字符串
--variant <name>      # 可重复
--night
--no-night
--no-variants
```

冲突规则：

- `--variant` 与 `--no-variants` 同时出现时报错。
- `--night` 与 `--no-night` 同时出现时报错。
- `[file]` 与 `--file` 同时出现时，使用 `--file` 并输出 warning。

新 design-token 工作区只使用 `main.yaml` 内的 `$config` 声明业务输入。`main.yaml` 是唯一入口，不保留 legacy `themefile` fallback，也不支持缺少 `main.yaml` 时从 resource 直接输出。

### 3.2 compress

`compress` 只处理已有素材的压缩和优化，不负责生成动效。

```bash
wave compress .
wave compress . --dry-run
wave compress . --yes
wave compress . --recursive
wave compress . --type jpg --type png
wave compress . --quality 80
wave compress . --out ./compressed
wave compress install
wave compress doctor
```

默认行为：

- 默认只扫描输入目录的当前一级文件，不递归子目录。
- 默认执行 preview-run：先压缩到临时目录，计算真实压缩效果，再展示小票并询问是否落盘。
- 默认输出到 `./compressed`，不覆盖源文件。
- v1 只有默认 safe 策略，优先无损或低风险优化。
- `--quality/-q` 是显式有损压缩入口；不传时不启用。
- 不使用 Tinify/TinyPNG，不上传素材到第三方服务。
- `--dry-run` 只展示真实预览小票，不询问也不落盘。
- `--yes` 仍执行 preview-run，但跳过确认并直接落盘。
- `--type` 可重复，用于限制处理类型；glob 不作为主路径。

### 3.3 motion

`motion` 负责从 PNG 帧目录生成动效资产。`mg` 是 alias。

```bash
wave motion gif ./frames
wave motion apng ./frames
wave mg gif ./frames
wave mg apng ./frames
wave mg gif ./frames --fps 24 --out loading.gif
wave mg apng ./frames --fps 24 --out loading.png
wave motion install
wave motion doctor
wave motion doctor ./frames
```

边界：

- `motion` v1 只支持 PNG 帧目录生成 GIF/APNG。
- `compress` 负责优化已有 GIF/APNG/WebP，不负责从帧生成它们。
- 不支持视频输入、sprite sheet、复杂时间轴、逐帧 duration、补帧或滤镜。
- 不使用泛化的 `wave generate`，避免命令语义过宽。

默认行为：

- 直接生成，不预览，不询问。
- 不修改源帧目录。
- 输出已存在时默认报错；`--overwrite` 才覆盖。
- `--dry-run` 只展示计划，不生成文件。
- 速度只通过 `--fps` 控制，不提供 `--duration`。

## 四、工程基线

### 4.1 运行时和工具链

Wave 是 local-first high-performance CLI。Bun 是 Wave 的产品运行时，由 mise 管理安装；用户不需要手动理解、安装或配置 Bun。

工程基线：

- Bun 负责运行 Wave CLI。
- mise 负责安装和管理 Bun、pnpm 和本地外部工具链。
- pnpm 负责 monorepo workspace 和依赖管理。
- Turborepo 负责任务编排。
- Vitest 负责测试。
- TypeScript 使用 strict mode，保持 ESM only。
- Node >= 20 作为工程工具兼容基线，不作为 Wave 用户运行 CLI 的心智前提。

建议的工具职责：

```text
mise     -> 安装 bun / node / pnpm 和 Wave 推荐本地工具
pnpm     -> workspace 与依赖
turbo    -> build / test / typecheck / lint 调度
vitest   -> 测试
bun      -> Wave CLI runtime
```

约束：

- `apps/cli` 可以使用 Bun runtime 特性。
- 业务包不直接散落 `Bun.spawn()`、`Bun.file()` 等 Bun 专属 API。
- 外部工具执行、文件系统访问和进程调用通过共享抽象完成，便于测试、doctor 和未来替换实现。

共享 IO 抽象：

```ts
interface WorkspaceIO {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<WorkspaceStat>;
  list(path: string): Promise<WorkspaceEntry[]>;
  ensureDir(path: string): Promise<void>;
}
```

`WorkspaceIO` 由 `packages/core` 提供。`packages/design-token`、`packages/compress`、`packages/motion` 通过它访问文件系统；真实 Bun/Node 文件系统实现只放在 `apps/cli` 或 core adapter 中，测试使用 memory/fake IO。

Wave 不捆绑 `oxipng`、`pngquant`、`svgo`、`gifsicle`、`gifski`、`apngasm` 等二进制工具。Wave 只负责发现工具、检查版本、生成命令、执行命令和给出安装建议。

`.mise.toml` 是官方推荐安装入口：

```bash
mise install
```

工具分组：

```text
core tools:
  bun
  node
  pnpm

wave tools:
  oxipng
  pngquant
  svgo
  gifsicle
  gifski
  apngasm
  jpegtran 或 mozjpeg
```

工具按命令能力分级：

```text
dt
  不依赖图片工具

compress safe
  required: oxipng / svgo / gifsicle / jpegtran 或 mozjpeg

compress quality
  required: pngquant / mozjpeg

motion gif
  required: gifski

motion apng
  required: apngasm
```

缺失工具时：

- `doctor` 输出完整报告和安装建议。
- 业务命令只检查当前命令所需工具，并输出最短错误说明。
- Wave 默认不自动安装工具；v1 不提供 `doctor --fix`。

`wave install` 是 `mise install` 的友好封装，不是新的安装系统：

```bash
wave install
wave compress install
wave motion install
wave install --yes
wave install --check
wave compress install --check
wave motion install --yes
```

行为：

- `wave install` 默认只展示将安装的推荐工具，并询问 `[y/N]`。
- `wave compress install` 只安装 compress 需要的工具组。
- `wave motion install` 只安装 motion 需要的工具组。
- 只有用户显式执行 `wave install --yes`、`wave compress install --yes` 或 `wave motion install --yes` 时，才调用项目 `.mise.toml` 执行安装。
- `--check` 只展示将安装的工具，不执行安装。
- 内部只调用 `mise install` 或项目定义的 mise task。
- 不自动安装 mise。
- 不直接下载、托管、打包或管理外部二进制。

如果缺少 mise，直接提示先安装 mise。`doctor` 发现缺失工具时，应建议运行对应安装命令：

```text
wave doctor            -> wave install
wave compress doctor   -> wave compress install
wave motion doctor     -> wave motion install
```

`dt` 不提供 `install`，因为 `dt` 不依赖外部图片或动效工具。

### 4.2 目标目录结构

```text
.
├── apps/
│   └── cli/
├── packages/
│   ├── core/
│   ├── design-token/
│   ├── compress/
│   ├── motion/
│   ├── receipt/
│   └── _template/
├── docs/
├── tools/
├── .mise.toml
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

依赖方向：

```text
apps/cli -> packages/* -> packages/core
apps/cli -> packages/receipt -> packages/core
```

规则：

- `apps/cli` 只负责命令注册、参数解析和用户交互。
- `packages/core` 放共享类型、错误模型、文件遍历、执行上下文、工具发现和命令执行抽象。
- `packages/receipt` 放小票渲染、JSON 输出协议和非交互输出约束。
- `packages/design-token` 承接 design-token 解析、转换和生成能力。
- `packages/compress` 处理静态和动图素材优化。
- `packages/motion` 处理动效资产生成。
- tool package 之间不互相 import；共享逻辑必须进入 `packages/core`。
- `packages/receipt` 只能依赖 `packages/core`。
- `packages/design-token`、`packages/compress`、`packages/motion` 返回结构化 result，不直接 import terminal renderer。
- 最终渲染由 `apps/cli` 调用 `packages/receipt` 完成，避免小票逻辑散落在业务包。

### 4.3 命令注册

CLI 应建立中心化命令注册表，借鉴 Hermes 的思路：命令、描述、分类、帮助层级和 flag 定义只在一个地方维护。

注册表负责生成：

- commander command 注册。
- help 文案。
- 模块级帮助。
- 通用 flag 与模块 flag 绑定。
- 后续可能的 autocomplete 或命令索引。

### 4.4 Doctor 与诊断模型

`doctor` 是健康检查和预检报告，不生成文件，不压缩，不编码，也不承担 WCAG 对比度检查。WCAG 保持独立入口：`wave dt wcag`。

Doctor 输出参考 `oh-my-openagent` 的分层模式：默认只显示问题，`--status` 显示紧凑仪表盘，`--verbose` 显示完整诊断，`--json` 只输出结构化 JSON。

命令层级：

```bash
wave doctor
wave dt doctor [file]
wave compress doctor
wave motion doctor [dir]
wave mg doctor [dir]
```

职责：

- `wave doctor`：检查 Wave 运行环境和本机工具摘要。
- `wave dt doctor`：检查 design-token 工作区健康。
- `wave compress doctor`：检查压缩工具链和临时目录可写性。
- `wave motion doctor`：无参数时检查动效工具链；带帧目录时同时检查帧目录最低要求。

输出模式：

```text
default  只列 error / warning；无问题时输出一句 OK
status   展示紧凑健康摘要
verbose  展示系统信息、工具状态、检查详情、问题和 summary
json     只输出结构化 JSON，不输出小票或彩色文本
```

示例：

```bash
wave doctor
wave doctor --status
wave doctor --verbose
wave doctor --json
wave motion doctor ./frames --verbose
```

内部统一使用两层诊断模型：

```ts
type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

interface DoctorIssue {
  code: string;
  title: string;
  description: string;
  fix?: string;
  affects?: string[];
  severity: 'error' | 'warning';
  module: 'core' | 'dt' | 'compress' | 'motion';
  path?: string;
  line?: number;
}

interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[];
  issues: DoctorIssue[];
  durationMs?: number;
}
```

`info` 类内容不进入 issue，放入 `details`。例如 motion 的 `100 frames, 320x320, duration 4.17s at 24 fps` 是检查详情，不是问题。

Issue code 只用于 error / warning，不用于普通事实信息。命名规则：

```text
WCORE_*  Wave core / 全局环境 / install / command registry
WDT_*    design-token
WCP_*    compress
WMG_*    motion
```

格式：

```text
<PREFIX>_<AREA>_<PROBLEM>
```

示例：

```text
WDT_CONFIG_MISSING
WDT_CONFIG_FIELD_UNKNOWN
WDT_RESOURCE_NOT_FOUND
WDT_RESOURCE_NAMESPACE_DUPLICATE
WDT_REFERENCE_UNRESOLVED
WDT_OUTPUT_UNWRITABLE

WCP_TOOL_MISSING
WCP_TEMP_UNWRITABLE
WCP_OUTPUT_CONFLICT
WCP_FILE_UNSUPPORTED

WMG_TOOL_MISSING
WMG_FRAME_DIR_MISSING
WMG_FRAME_COUNT_LOW
WMG_FRAME_FORMAT_UNSUPPORTED
WMG_FRAME_SIZE_MISMATCH
WMG_OUTPUT_EXISTS
```

不使用数字编号，例如 `WDT001`。语义 code 更容易搜索，也避免早期维护编号映射。

Severity 由当前命令上下文决定。例如 `apngasm` 缺失：

```text
wave motion doctor
  WMG_TOOL_MISSING warning
  因为 GIF 仍可用，只是 APNG 能力不可用

wave mg apng ./frames
  WMG_TOOL_MISSING error
  因为当前命令无法执行
```

测试优先断言 `code`、`severity`、关键文案和 JSON 结构，不锁死完整终端排版。

退出规则：

```text
有 fail/error  exit 1
只有 warning   exit 0
全 pass        exit 0
```

后续可加 `--strict`，让 warning 也返回失败。

业务命令复用同一套检查，但输出更短：

```text
wave dt build       只显示阻塞错误
wave dt doctor      默认只显示问题
wave mg gif         只显示阻塞错误
wave motion doctor  默认只显示问题；--verbose 显示完整帧目录报告
```

### 4.5 Receipt 与 JSON 输出

`doctor` 不使用盒子小票。它是排障工具，默认采用问题优先输出；`--status` 和 `--verbose` 负责不同层级的诊断信息。

Receipt 只用于业务结果或业务预览：

```text
Build Receipt       wave dt / wave dt build
Compress Preview    wave compress 默认 / --dry-run
Compress Receipt    wave compress 落盘后
Motion Receipt      wave mg gif/apng 成功生成
Motion Plan         wave mg --dry-run
Install Plan        wave install --check
Install Receipt     wave install 完成
```

所有命令的 `--json` 规则统一：

```text
只输出 JSON
不输出小票
不输出彩色文本
不输出交互提示
隐含非交互
```

需要交互确认的命令在 `--json` 下不询问：

- `wave compress . --json`：执行 preview-run，输出 preview JSON，不落盘。
- `wave compress . --json --yes`：执行 preview-run，落盘，输出 result JSON。
- `wave install --json`：输出 install plan JSON，不安装。
- `wave install --json --yes`：执行安装，输出 install result JSON。

非交互 flag 语义：

```text
--dry-run  预览，不落盘，不询问
--check    展示计划，不执行，不询问
--json     输出 JSON，不询问
--yes      不询问，并执行
```

## 五、能力实现策略

### 5.1 design-token

第一阶段重建现有 token 行为的等价能力，不承诺复用旧 pipeline。新的 design-token 工作区入口是 `main.yaml` 自包含结构：

```yaml
$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: orca
  resource:
    palette:
      - tailwindcss4
    dimension:
      - wave
    custom:
      - ./custom/corerain.yaml
  parameter:
    outputDir: ./theme
    platform:
      - json
      - css
    filterLayer: 1
    colorSpace: oklch
    night: auto
    variants: auto
  parameterGroup:
    css:
      platform:
        - css
      filterLayer: 2
    sketch:
      platform:
        - sketch
      filterLayer: 1
      colorSpace: srgb

theme:
  color:
    primary:
      main:
        $value: "{corerain.color.main.600}"
```

`$config` 是 Wave 的构建声明，不输出为 token。`theme`、`component` 等非 `$` 根节点才是 token 内容。

`$config` 只服务 `design-token`，不是 Wave 全局配置。`compress` 与 `motion` 第一版不读取 `$config`。

#### `$config` 字段

`$config` v1 只包含四个顶层字段：

```text
theme
resource
parameter
parameterGroup
```

字段语义：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `theme` | 是 | 生成主题名，用于默认输出目录和 night/variants 后缀 |
| `resource` | 是 | design-token 的引用资源声明 |
| `parameter` | 否 | 全局构建参数 |
| `parameterGroup` | 否 | 参数组；每组继承全局 `parameter` 并覆盖同名字段 |

`resource` 按资源类型分组，所有类型都使用数组：

```yaml
resource:
  palette:
    - tailwindcss4
  dimension:
    - wave
  custom:
    - ./custom/corerain.yaml
```

`palette`、`dimension` 的值可以是内置资源名，也可以是相对或绝对路径。`custom` 通常是本地自定义资源路径。

`parameter` v1 采用严格白名单：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `outputDir` | string | `./<theme>` | 输出目录 |
| `platform` | string[] | `[json]` | 输出格式，支持 `json`、`jsonc`、`css`、`sketch` |
| `filterLayer` | number | `0` | 输出层级过滤，`0` 表示不过滤 |
| `colorSpace` | string | `hex` | 支持 `hex`、`oklch`、`srgb`、`hsl` |
| `night` | `auto` 或 `false` | `auto` | 自动检测 `main@night.yaml`，或关闭 night 输出 |
| `variants` | `auto`、`false` 或 string[] | `auto` | 自动扫描 `variants/`，关闭，或指定变体列表 |

`brand` 不进入新的 `$config.parameter`。

`platform` 在 `$config` 中必须写成数组，不支持旧 `themefile` 的逗号字符串写法：

```yaml
platform:
  - json
  - css
```

`variants` 支持三种写法：

```yaml
variants: auto
variants: false
variants:
  - dark
  - brandA
```

CLI 中对应：

```bash
wave dt                 # 自动扫描 variants/
wave dt --variant dark  # 只输出 dark
wave dt --no-variants   # 不输出任何 variant
```

未知字段应直接报错，并尽量提示可能的正确字段名。例如 `plaform` 提示 `platform`，`parameterGroug` 提示 `parameterGroup`。

主链路目标：

- 将 design-token 数据流收敛为 `main.yaml::$config + token content -> outputs`。
- `main.yaml` 同时声明构建配置和 token 内容，是唯一工作区入口。
- 保持 `json`、`jsonc`、`css`、`sketch` 输出。
- 保持 WCAG 对比度检查、variants、night、resource、parameterGroup 等现有核心行为。
- 只改变命令域和包边界，不改变 token 行为。
- 不保留 legacy `themefile` fallback。
- 不支持缺少 `main.yaml` 时从 resource 直接生成 token。

旧 `themefile` 到 `$config` 的概念映射仅用于理解和后续可能的一次性迁移辅助，不是 v1 主链路：

| themefile | `$config` |
| --- | --- |
| `THEME` | `theme` |
| `RESOURCE palette <ref>` | `resource.palette[]` |
| `RESOURCE dimension <ref>` | `resource.dimension[]` |
| `RESOURCE custom <ref>` | `resource.custom[]` |
| `PARAMETER output` | `parameter.outputDir` |
| `PARAMETER platform` | `parameter.platform[]` |
| `PARAMETER filterLayer` | `parameter.filterLayer` |
| `PARAMETER colorSpace` | `parameter.colorSpace` |
| `PARAMETER night` | `parameter.night` |
| `PARAMETER variants` | `parameter.variants` |
| `GROUP "name" { PARAMETER ... }` | `parameterGroup.<name>` |

解析规则：

- `main.yaml` 解析后先抽离 `$config`。
- 使用 Zod 校验 `$config`。
- 从 token tree 中移除 `$config` 后，再进入 schema validation、extends、reference resolution、transform、generator。
- 将 `$config` 归一化为新的 design-token workspace model。
- 如果没有 `main.yaml`，直接报错。
- 如果 `main.yaml` 没有 `$config`，直接报错。
- CLI flags 可临时覆盖输出、平台、variant、night 等非资源参数。

优先级：

```text
CLI flags
> main.yaml::$config
> built-in defaults
```

资源声明属于 token 文件的业务依赖，主路径必须写在 `$config.resource`。v1 不提供 CLI `--resource` 覆盖，避免资源来源在文件和命令之间分裂。

第一版不引入 `.wave/config.yaml`、`.wave/local.yaml` 或 `.env`。`compress` 与 `motion` 先通过 flags 工作；如果未来长期配置需求变强，再单独设计 workspace config。

#### `wave dt doctor`

`wave dt doctor` 默认检查当前目录 `main.yaml`，也支持位置参数和 `-f, --file`：

```bash
wave dt doctor
wave dt doctor ./main.yaml
wave dt doctor -f ./main.yaml
```

检查项：

- `main.yaml` 是否存在。
- `$config` 是否存在。
- `theme` 是否存在。
- `resource` 是否完整。
- resource 文件是否存在、是否可读。
- resource namespace 是否重复。
- `parameter` 和 `parameterGroup` 字段是否合法。
- `platform` 和 `colorSpace` 是否支持。
- token schema 是否合法。
- token 引用是否能解析。
- night / variants 文件是否可发现。
- 输出路径是否可写。

示例诊断：

```text
ERROR  WDT_RESOURCE_NOT_FOUND
custom resource not found: ./custom/corerain.yaml
suggestion: check $config.resource.custom[0]

ERROR  WDT_REFERENCE_UNRESOLVED
{corerain.color.main.600} cannot be resolved
path: theme.color.primary.main.$value

WARNING WDT_OUTPUT_EXISTS
output dir already exists: ./theme
```

### 5.2 compress

`compress` 使用本地开源工具，不调用云端压缩服务。

Wave 不实现压缩算法本身。`compress` 通过 backend 抽象调用成熟 codec，v1 默认采用外部 CLI backend；后续可以增加 native library 或 WASM backend，但不改变用户命令。

核心抽象：

```ts
type ToolMode = 'safe' | 'quality' | 'encode';

interface ToolCandidate {
  name: string;
  command: string;
  available: boolean;
  version?: string;
  missingReason?: string;
}

interface ToolRequirement {
  capability: 'compress-png' | 'compress-jpg' | 'compress-svg' | 'compress-gif' | 'encode-gif' | 'encode-apng';
  mode?: ToolMode;
  preferred?: string[];
}

interface ToolResolution {
  requirement: ToolRequirement;
  selected?: ToolCandidate;
  candidates: ToolCandidate[];
  missingReason?: string;
}

interface ToolResolver {
  resolveCapability(requirement: ToolRequirement): Promise<ToolResolution>;
}

interface CommandRunner {
  run(command: PlannedCommand): Promise<CommandResult>;
}

interface OptimizerBackend {
  plan(input: CompressInput): Promise<CompressPlan>;
  run(plan: CompressPlan): Promise<CompressResult>;
}
```

职责边界：

- `packages/compress` 负责扫描、计划、策略选择和结果解释。
- `ToolResolver` 负责按能力需求发现本机工具和候选工具，例如 `jpegtran` 或 `mozjpeg`。
- `CommandRunner` 负责执行外部命令，并在测试中可被 mock。
- `OptimizerBackend` 隔离具体实现，避免业务逻辑直接依赖 `oxipng`、`pngquant`、`svgo`、`gifsicle` 等工具。
- `doctor` 读取同一套 capability 结果，不维护另一份工具判断逻辑。

#### Pipeline

`compress` 的默认流程是先真实预览，再确认落盘：

```text
scan
-> plan
-> preview-run
-> render preview receipt
-> confirm
-> commit
```

各阶段职责：

- `scan`：扫描输入文件，识别 `png`、`jpg/jpeg`、`svg`、`gif`。
- `plan`：决定每个文件的工具、参数、临时输出路径和最终输出路径。
- `preview-run`：把压缩结果写入临时目录，计算压缩前后体积。
- `render preview receipt`：用现有小票风格展示真实压缩效果。
- `confirm`：默认询问 `[y/N]`，`--yes` 跳过确认，`--dry-run` 跳过确认和落盘。
- `commit`：把临时结果写入最终输出目录。

预览小票应展示每个文件的真实结果：

```text
a.png      73 KB    ▼ 85%
b.gif     100 KB    ▼ 42%
c.svg      18 KB    ▼ 12%
d.jpg     240 KB    unchanged
```

如果压缩结果比原文件更大，标记为 `unchanged`。落盘时复制原文件，不写入更大的压缩结果，保证输出目录是完整资产目录。

#### 输入、扫描和输出

默认扫描规则：

- `wave compress .` 只扫描当前一级目录。
- `--recursive` 才递归扫描子目录。
- 不传 `--type` 时处理 `png`、`jpg/jpeg`、`svg`、`gif`。
- `--type` 可重复，用于限制类型，例如 `--type jpg --type png`。
- 多个输入路径可以支持；glob 不作为主路径。

执行模式：

| 命令 | 行为 |
| --- | --- |
| `wave compress .` | preview-run -> 小票 -> 询问 -> 落盘 |
| `wave compress . --dry-run` | preview-run -> 小票 -> 退出 |
| `wave compress . --yes` | preview-run -> 小票 -> 直接落盘 |

默认输出：

- 目录输入默认输出到 `./compressed`。
- 文件输入默认输出到同目录的压缩副本。
- `--out` 可以覆盖输出目录或输出文件。
- 默认不覆盖源文件。

默认工具策略：

| 类型 | 默认工具 | 说明 |
| --- | --- | --- |
| PNG | `oxipng` | 默认安全优化 |
| PNG | `pngquant` | 仅 `--quality` 时启用，可能降色 |
| JPG/JPEG | `jpegtran` 或 `mozjpeg` | 照片类资源压缩 |
| SVG | `svgo` | 删除冗余节点和 metadata |
| GIF | `gifsicle` | 优化已有 GIF |

v1 不提供 `safe/small` 模式切换。默认是 safe；`--quality/-q` 是用户显式选择的有损压缩入口，主要影响 PNG/JPG。

`compress doctor` 检查本机依赖是否可用，缺失时给出安装建议。Wave 不应把 GPL 工具源码或二进制直接打进发布包；v1 优先调用用户本机安装的 CLI backend。

#### `wave compress doctor`

`wave compress doctor` 只检查工具链，不处理文件：

```bash
wave compress doctor
```

检查项：

- `oxipng` 是否可用。
- `pngquant` 是否可用。
- `jpegtran` 或 `mozjpeg` 是否可用。
- `svgo` 是否可用。
- `gifsicle` 是否可用。
- 临时目录是否可写。

报告应说明哪些能力可用：

```text
png safe     available
png quality  available
jpg safe     available
jpg quality  available
svg safe     available
gif safe     available
```

### 5.3 motion

`motion` 是低记忆成本的本地动效生成工具选择器。Wave 负责选择合适的本地工具，用户不需要记 `gifski`、`apngasm` 或 `ffmpeg` 的参数。

Wave 不实现 GIF/APNG 编码器。`motion` 通过 backend 抽象调用成熟 codec，v1 默认采用 `gifski` 和 `apngasm` 的 CLI backend。未来如果引入 native 或 WASM backend，用户命令保持不变。

核心抽象：

```ts
interface MotionBackend {
  plan(input: MotionInput): Promise<MotionPlan>;
  encode(plan: MotionPlan): Promise<MotionResult>;
}
```

`motion` 与 `compress` 共用 `ToolResolver` 和 `CommandRunner`，确保 doctor、install、业务命令和测试使用同一套工具能力判断。

#### v1 边界

- 输入只支持 PNG 帧目录。
- 输出只支持 GIF 和 APNG。
- 按文件名自然排序。
- 帧尺寸必须一致。
- 至少 2 帧。
- `fps` 默认 `24`，且必须大于 `0`。
- `loop` 默认 `forever`。
- `quality` 默认 `80`。
- `duration = frameCount / fps`，只作为计算结果展示，不作为输入参数。

默认输出：

```text
wave mg gif ./frames   -> ./frames.gif
wave mg apng ./frames  -> ./frames.png
```

输出规则：

- `-o, --out <path>` 指定输出文件。
- 输出文件已存在时默认报错。
- `--overwrite` 才允许覆盖。
- `--dry-run` 只展示计划，不生成文件。

#### Pipeline

```text
scan frames
-> validate frames
-> plan command
-> encode
-> verify output
-> receipt
```

各阶段职责：

- `scan frames`：读取 PNG 帧并按文件名自然排序。
- `validate frames`：检查帧数量、尺寸一致性和 fps。
- `plan command`：根据输出格式选择本地工具并生成命令。
- `encode`：执行 `gifski` 或 `apngasm`。
- `verify output`：确认输出文件存在，并读取输出大小。
- `receipt`：展示格式、帧数、fps、时长、尺寸、输出路径和工具。

小票应展示：

```text
Format      GIF
Frames      100
FPS         24
Duration    4.17s
Size        320 x 320
Output      loading.gif
Tool        gifski
```

默认工具策略：

| 输出 | 推荐工具 | 说明 |
| --- | --- | --- |
| GIF | `gifski` | 从 PNG 帧生成高质量 GIF |
| APNG | `apngasm` | 从 PNG 帧生成 APNG |

Wave 不负责：

- 手写编码器。
- 视频输入。
- sprite sheet。
- 复杂时间轴。
- 逐帧 duration。
- 补帧或滤镜。

视频输入、animated WebP、JPEG/WebP 帧可作为后续增强。

#### `wave motion doctor`

无参数时只检查工具链：

```bash
wave motion doctor
```

带帧目录时检查工具链和帧目录最低要求：

```bash
wave motion doctor ./frames
wave mg doctor ./frames
```

检查项：

- `gifski` 是否可用。
- `apngasm` 是否可用。
- 帧目录是否存在。
- 是否至少有 2 张 PNG。
- 是否混入非 PNG 文件。
- 文件名自然排序结果是否稳定。
- 所有帧尺寸是否一致。
- 输出文件是否冲突。

示例诊断：

```text
ERROR  WMG_FRAME_SIZE_MISMATCH
003.png is 320x240, expected 320x320

WARNING WMG_NON_PNG_IGNORED
cover.jpg is ignored; motion v1 only supports PNG frames

DETAIL
100 frames, 320x320, duration 4.17s at 24 fps
```

## 六、TDD 实施顺序

实现遵循纵向切片：一个行为测试，一个最小实现，再进入下一条行为。测试优先走 CLI 或公开 API，不测试内部函数。不要先批量写完所有测试。

原则：

```text
先工程基线，后业务功能
先命令骨架，后模块能力
先 dt，后 compress / motion
先工具抽象，后真实 codec backend
每个 milestone 都必须可运行、可验收
```

### Milestone 0：工程基线与测试入口

目标：直接建立最终 monorepo 结构和测试入口，避免先写业务代码再搬家。

内容：

- 引入 pnpm workspace。
- 引入 Turborepo。
- 建立最终目录结构：`apps/cli`、`packages/core`、`packages/design-token`、`packages/compress`、`packages/motion`、`packages/receipt`。
- 建立统一脚本：`dev`、`build`、`test`、`typecheck`、`check`。
- 确认 Vitest 运行稳定。
- 建立 CLI e2e test helper。
- 建立 fixture workspace helper。
- 建立测试用临时目录策略。
- 建立 `WorkspaceIO` 接口和 memory/fake IO 测试实现。

Tracer bullet：

```text
RED: pnpm test 可以运行 CLI helper，并断言 wave --help 输出
GREEN: 建立最小 monorepo、Vitest 和 CLI e2e helper
```

验收：

```text
pnpm build
pnpm test
pnpm typecheck
pnpm check
```

### Milestone 1：command registry 与全局输出协议

目标：建立 CLI 骨架、全局输出 flags、help/version 和输出协议基础。

内容：

- 实现中心化 command registry。
- 实现 `wave --help`、`wave --version`。
- 实现多级 help：`wave`、`wave dt`、`wave dt wcag`、`wave compress`、`wave motion`。
- 实现全局 flags：`--cwd`、`--verbose`、`--quiet`、`--no-color`、`--json`。
- 建立通用业务 flags 注册规则：`--dry-run`、`--yes`、`--check`、`--out`、`--quality` 只挂到支持对应语义的命令。
- 建立最小 `OutputContext` / `OutputMode`，承载 `json`、`quiet`、`color`、`interactive` 等输出状态。
- 定义 JSON only、非交互、无彩色输出的统一规则。
- 建立 receipt / 小票测试策略。
- 建立 doctor JSON 测试策略。

Tracer bullet：

```text
RED: wave dt --help 展示 dt 模块命令和模块 flags
GREEN: command registry 生成根命令和模块帮助
```

### Milestone 2：design-token workspace loader

目标：实现 `main.yaml::$config only` 的 design-token 工作区加载，不做 legacy fallback。

内容：

- 新增 `$config` 解析。
- 使用 Zod 校验 `$config`。
- 将 `main.yaml::$config` 归一化为新的 design-token workspace model。
- loader 只通过 `WorkspaceIO` 读取 `main.yaml` 和资源文件。
- 从 token tree 中移除 `$config` 后，再进入后续 token 流程。
- 没有 `main.yaml` 时直接报错。
- 没有 `$config` 时直接报错。

Tracer bullet：

```text
RED: loader 可以读取 main.yaml::$config.resource 并返回 workspace model
GREEN: 实现最小 $config 解析、校验和归一化
```

后续测试：

- 缺少 `theme` 报错。
- `platform` 必须是数组。
- `filterLayer` 默认 `0`。
- 未知字段报错并提示可能的正确字段。
- 没有 `main.yaml` 报错。
- 没有 `$config` 报错。
- 将 `/Users/teatao/Projects/my-color/test` 作为真实样本来源，创建 vNext fixture：不读取旧 `themefile`，而是把其中的 `THEME`、`RESOURCE`、`PARAMETER` 和 `GROUP` 信息合并进 `main.yaml::$config`。
- vNext fixture loader 必须能解析 `resource.palette`、`resource.dimension`、`resource.custom`、`parameter.outputDir`、`parameter.filterLayer`、`parameterGroup.css` 和 `parameterGroup.sketch`。

### Milestone 3：dt build / doctor / wcag

目标：把 design-token 新主链路跑通。

内容：

- 实现统一 `CheckResult` / `DoctorIssue` 模型。
- 实现 `wave dt doctor` 的第一批 workspace 检查。
- 实现 `wave dt` / `wave dt build`。
- 实现 `wave dt init`。
- 实现 `wave dt show`。
- 实现 `wave dt wcag`。
- 实现或迁移等价的 reference resolution、transform 和 generator。
- 保持 `json`、`jsonc`、`css`、`sketch` 输出。
- 保持 night / variants 行为。

Tracer bullet：

```text
RED: wave dt doctor ./main.yaml 对缺失 custom resource 输出 WDT_RESOURCE_NOT_FOUND
GREEN: 实现 dt doctor 最小检查和 workspace 错误输出
```

后续测试：

- 默认模式只显示 error / warning。
- `--status` 输出紧凑健康摘要。
- `--verbose` 输出完整检查详情。
- `--json` 只输出结构化 JSON。
- `wave dt` 默认执行 `wave dt build`。
- `wave dt [file]` 等价于 `wave dt build [file]`，且 `[file]` 只能是 `main.yaml` 路径。
- `wave dt init` 创建最小 design-token 工作区。
- `wave dt show` 输出解析后的 token 结构。
- `wave dt wcag` 默认检查 `main.yaml`。
- variants / night scope 正确。
- vNext fixture 必须跑通 `wave dt` 主链路，并生成 css 和 sketch 输出；测试重点是关键行为，不做旧输出逐字 diff。
- vNext fixture 必须覆盖真实用法：`corerain` custom resource、`tailwindcss4` palette、`wave.dimension`、本地 `$ref`、token 引用字符串、`inheritColor`、`smoothShadow` 和 sketch 映射扩展。

### Milestone 4：receipt 渲染与 JSON 稳定化

目标：补齐完整 receipt renderer，并稳定所有业务命令的 JSON 输出契约。

内容：

- 实现 `packages/receipt`。
- 实现 Build Receipt。
- 实现 Compress Preview / Compress Receipt 的渲染模型。
- 实现 Motion Plan / Motion Receipt 的渲染模型。
- 实现 Install Plan / Install Receipt 的渲染模型。
- 基于 Milestone 1 的 `OutputContext` 补齐 renderer，不重新定义命令 flag。
- 统一 `--json`、`--quiet`、`--no-color`、`--dry-run`、`--check`、`--yes` 的输出表现。

Tracer bullet：

```text
RED: wave dt build --json 只输出 JSON，不输出小票和颜色文本
GREEN: 实现 receipt/json 输出适配层
```

### Milestone 5：ToolResolver / CommandRunner / install doctor

目标：建立外部工具抽象、doctor 和 install 基线，再进入 compress/motion 真实能力。

内容：

- 实现 `ToolCapability`。
- 实现 `ToolResolver`。
- 实现 `ToolRequirement` / `ToolResolution`，支持能力需求、候选工具和缺失原因。
- 实现 `CommandRunner`。
- 实现 `wave doctor`。
- 新增 `.mise.toml`。
- 实现 `wave install`、`wave compress install`、`wave motion install` 的 `--check`。
- 实现 `wave install --yes` 调用 `mise install`。
- 实现 `wave compress doctor` 和 `wave motion doctor` 的工具链检查。

Tracer bullet：

```text
RED: wave compress doctor --json 在未安装 oxipng 时输出 WCP_TOOL_MISSING
GREEN: 实现可 mock 的 ToolResolver 和 doctor 工具检查
```

后续测试：

- command runner 可 mock，不依赖本机真实图片工具。
- `ToolResolver` 可用 fake candidates 测试 `jpegtran` / `mozjpeg` 等候选工具选择。
- 缺少 mise 时给出明确提示。
- `wave install --check` 只展示计划，不执行安装。
- `wave install --json` 不交互、不安装。

### Milestone 6：compress v1

目标：实现可用的本地压缩 pipeline。

内容：

- 实现 `scan -> plan -> preview-run -> receipt -> confirm -> commit`。
- 默认只扫描当前一级目录。
- 实现 `--recursive`、`--type`、`--quality/-q`、`--dry-run`、`--yes`、`--out`。
- 实现默认 safe 策略。
- 接入 v1 CLI optimizer backend。

Tracer bullet：

```text
RED: wave compress ./fixtures --dry-run 使用 fake optimizer backend 输出每个文件节省比例
GREEN: 实现 PNG 单格式最小 pipeline 和 fake backend contract
```

后续测试：

- 主测试使用 fake optimizer backend 或 mock `CommandRunner`。
- 真实 codec 测试作为 integration test；工具缺失时 skip，或在 `mise install` 后运行。
- 默认不递归。
- `--recursive` 递归。
- `--type jpg --type png` 只处理指定类型。
- `--quality 80` 对 PNG/JPG 启用显式有损压缩。
- 压缩后变大的文件标记 `unchanged`。
- `--yes` 将临时结果落盘。
- SVG / JPG / GIF 分格式补齐。

### Milestone 7：motion v1

目标：实现 PNG 帧目录到 GIF/APNG。

内容：

- 实现 PNG 帧扫描和自然排序。
- 实现 `--fps`、`--quality`、`--loop`、`--out`、`--overwrite`、`--dry-run`。
- 实现输出存在默认报错。
- 接入 v1 CLI motion backend：`gifski` 和 `apngasm`。

Tracer bullet：

```text
RED: wave mg gif ./frames --dry-run 显示帧数、fps、duration、输出路径，不写文件
GREEN: 实现 PNG 帧扫描和 dry-run plan
```

后续测试：

- 主测试使用 fake motion backend 或 mock `CommandRunner`。
- 真实 GIF/APNG encode 作为 integration test；工具缺失时 skip，或在 `mise install` 后运行。
- 少于 2 帧报错。
- 非 PNG 文件 warning。
- 帧尺寸不一致报错。
- 输出存在时报错。
- `--overwrite` 允许覆盖。
- GIF encode。
- APNG encode。

### Milestone 8：profile/config 再评估

Profile 和通用 workspace config 暂不作为第一阶段实现目标。当前决策是不引入 `.env` 或 `.wave/config.yaml`。

未来如果 `compress`、`motion` 或 profile 出现稳定长期配置需求，再评估 workspace config。

未来方向：

```bash
wave --profile moon dt build
wave --profile moon compress ./assets
wave profile create moon
wave profile use moon
```

Wave 的 profile 应代表设计项目、品牌或交付规范，不照搬 Hermes 的 agent identity 模型。

## 七、验收标准

重构完成后，应满足：

- `wave install --check` 能展示将由 mise 安装的完整推荐工具链。
- `wave install --yes` 能调用 `mise install`。
- `wave compress install --check` 能展示 compress 工具组。
- `wave motion install --check` 能展示 motion 工具组。
- `wave dt` 默认执行 `wave dt build`。
- `wave dt ./main.yaml` 等价于 `wave dt build ./main.yaml`，且可读取 `$config.resource`。
- `wave dt [file]` 只接受 `main.yaml` 路径，传入 resource、variant 或目录时报错。
- `wave dt init` 能创建最小 design-token 工作区。
- `wave dt show` 能输出解析后的 token 结构。
- `wave dt doctor ./main.yaml` 输出完整 workspace 诊断。
- `wave dt wcag` 默认检查 `main.yaml`。
- `wave dt wcag dark --night` 检查 `variants/dark@night.yaml`。
- 没有 `main.yaml` 或没有 `$config` 时，`wave dt` 输出明确错误，不 fallback 到 `themefile`。
- 基于 `/Users/teatao/Projects/my-color/test` 创建的 vNext fixture 能完成解析、引用解析、扩展转换，并生成 css 与 sketch 输出。
- `wave compress doctor` 能报告 png/jpg/svg/gif safe 能力是否可用。
- `wave compress doctor --json` 可在未安装真实工具时通过 fake `ToolResolver` 测试。
- `ToolResolver` 能按 capability 选择候选工具，例如 JPG safe 可从 `jpegtran` / `mozjpeg` 中选择。
- `wave compress .` 默认执行真实 preview-run，展示小票并询问是否落盘。
- `wave compress . --dry-run` 展示真实预览小票，不落盘。
- `wave compress . --yes` 展示小票后直接落盘。
- `wave compress . --type jpg --type png` 只处理指定类型。
- `wave compress . --quality 80` 对 PNG/JPG 启用显式有损压缩。
- `wave compress . --recursive` 才递归扫描子目录。
- `wave mg gif ./frames --fps 24 --out loading.gif` 能从 PNG 帧目录生成 GIF。
- `wave mg apng ./frames --fps 24 --out loading.png` 能从 PNG 帧目录生成 APNG。
- `wave mg gif ./frames --dry-run` 只展示生成计划，不写文件。
- `wave mg gif ./frames` 遇到已存在输出文件时默认报错。
- `wave motion doctor ./frames` 能报告帧数量、尺寸一致性和工具链状态。
- `mise install` 能安装项目所需工具链。
- `pnpm build`、`pnpm test`、`pnpm typecheck`、`pnpm check` 可从 repo root 调度。
- Bun 作为 Wave CLI runtime 由 mise 管理，不要求用户手动安装或理解 Bun。
- 业务包不直接散落 Bun 专属 API，文件访问通过 `WorkspaceIO`，外部工具执行通过 `ToolResolver` / `CommandRunner`。
- compress / motion 主测试使用 fake backend 或 mock `CommandRunner`；真实 codec 测试在工具缺失时 skip。
- `docs/SPEC.md` 只在行为真实变化后再更新。
