# Wave 用户手册

本手册记录 Wave 面向使用者的日常用法。内部行为快照见 `docs/SPEC.md`。

## 命令入口

Wave 是面向 UI/UX 设计师的本地设计交付 CLI，当前包含 design token、素材压缩、动效生成、工作区创建和本地工具链诊断。

```bash
wave <command> [options]
```

常用入口：

| 能力 | 命令 | 说明 |
| --- | --- | --- |
| Design Token | `wave dt` | 读取 `main.yaml`，生成 `json`、`jsonc`、`css`、`sketch` 输出。 |
| 素材压缩 | `wave compress` | 压缩 PNG、JPG、SVG、GIF，支持 dry-run、递归扫描和覆盖保护。 |
| 动效生成 | `wave motion` / `wave mg` | 从 PNG 帧目录生成 GIF 或 APNG。 |
| 工作区创建 | `wave workspace` | 按配置创建本地设计项目目录。 |
| 工具链 | `wave doctor` / `wave install` | 检查和安装本地依赖工具。 |

别名：

```bash
wave dt      # wave design-token
wave mg      # wave motion
```

旧入口仍可使用：

```bash
wave create
wave init
wave show
```

新脚本和文档优先使用模块化入口：`wave dt`、`wave compress`、`wave motion`、`wave workspace`。

## 安装与本地工具链

开发环境使用 mise 管理运行环境，使用 pnpm 安装依赖。

```bash
mise install
pnpm install
```

验证 CLI：

```bash
pnpm dev -- --help
```

构建单文件 CLI：

```bash
pnpm build
```

Wave 不捆绑图片压缩和动效编码工具。压缩和编码依赖本机工具。

检查环境：

```bash
wave doctor
wave doctor --status
wave doctor --json
```

查看安装计划：

```bash
wave install --check
wave compress install --check
wave motion install --check
```

执行安装：

```bash
wave install --yes
wave compress install --yes
wave motion install --yes
```

这些命令调用项目 `.mise.toml` 中的 mise task。缺少 mise 时，Wave 会提示先安装 mise，不输出 Bun 运行时堆栈。

工具分组：

| 模块 | 需要的本地工具 |
| --- | --- |
| `compress` | `oxipng`, `pngquant`, `svgo`, `gifsicle`, `jpegtran` 或 `mozjpeg` |
| `motion` | `gifski`, `apngasm` |

## Design Token

`wave dt` 是 design-token 主入口。它默认读取当前目录的 `main.yaml`，生成 `json`、`jsonc`、`css`、`sketch` 输出。完整使用指南见 [docs/design-token.md](docs/design-token.md)。

### 常用命令

```bash
wave dt init
wave dt
wave dt build
wave dt -f ./main.yaml
wave dt --platform json --platform css
wave dt --platform sketch
wave dt --variant dark
wave dt --no-night
wave dt --no-variants
```

输出格式：

| 平台 | 文件 |
| --- | --- |
| `json` | `{theme}.json` |
| `jsonc` | `{theme}.jsonc` |
| `css` | `{theme}.css` |
| `sketch` | `{theme}2sketch.json` |

当前推荐以 `main.yaml` + `$config` 管理 design-token 工作区。`themefile` 和 `wave create` 仍保留兼容旧项目。

### Sketch extensions

Sketch 平台特有规则写在 `$extensions.sketch` 下：

```yaml
$extensions:
  sketch:
    path: "foundation/interaction/hover"
    property:
      opacity: true
```

- `path` 用于定义 Sketch 的 slash 名称路径。
- `property.opacity: true` 输出 `{ opacity: value }`。
- `property.cornerRadius: true` 输出 `{ cornerRadius: value }`。
- `property` 当前只支持 `theme.dimension.*` 下的 `number` 或 `dimension` token。
- 旧 `$extensions.sketchMap` 仍可用，但新项目优先使用 `$extensions.sketch.property`。

详细规则和错误示例见 [docs/design-token.md](docs/design-token.md)。

### Resource

`wave dt update` 用来更新 design-token 引用解析用的本地 resource cache。常规构建仍以 `main.yaml` 为 token 内容来源，resource 只提供 `{resource.path}` 引用解析数据。

```bash
wave dt show
wave dt update
wave dt update tailwindcss --version 4
wave dt update leonardo
wave dt status
```

读取优先级：项目显式路径 resource > 用户本地 cache resource > 包内 builtin resource。

## 素材压缩

`wave compress` 用于压缩已有 PNG/JPG/SVG/GIF 文件，不负责从帧生成动效。

```bash
# 预览当前目录支持的文件，不落盘
wave compress . --dry-run

# 压缩目录中的素材并写入默认输出目录
wave compress ./assets --yes

# 只处理 PNG
wave compress ./assets --type png --yes

# 清理 SVG 图标颜色属性，方便 CSS 重新赋色
wave compress ./assets --type svg --icon --yes

# 递归扫描子目录
wave compress ./assets --recursive --yes

# 显式指定输出目录
wave compress ./assets --out ./optimized --yes

# JSON 输出，适合脚本读取
wave compress ./assets --json
```

真实子命令是 `wave compress run`。为了降低记忆成本，`wave compress ./assets` 会在内部归一化为 `wave compress run ./assets`。

默认行为：

- 不传 `--yes` / `--dry-run` / `--json` 时，Wave 会先确认要压缩的路径和匹配文件数；确认后执行压缩，并只输出一次最终 receipt。
- 用户拒绝确认时，Wave 不写文件，也不输出 receipt。
- `--dry-run` 只展示一次预览，不询问也不写文件。
- `--yes` 跳过确认并直接写入最终结果。
- `--json` 输出 preview JSON，不确认、不显示 loading、不输出 box receipt，也不写文件。
- `--json --yes` 写入文件并输出 result JSON，适合脚本读取。
- TTY 下写入阶段会显示 `Compressing` loading；非 TTY、CI 和 JSON 输出不会显示 loading。
- 成功写入后的 receipt 结尾会显示 `Reduce space usage by <percent>%.`，百分比按所有文件合计的压缩前后大小计算。
- 不传 `--recursive` 时，目录输入只扫描当前一级文件。
- 不传 `--out` 时，目录输入输出到 `<input-dir>/wave-compress/`；文件输入输出到 `<file-parent>/wave-compress/`。
- 若优化结果比原文件更大，Wave 会把该文件标为 `unchanged`，落盘时复制原文件字节，不使用更大的优化产物。
- SVG 使用 `--icon` 或用户 SVGO config 时，Wave 会写入 SVGO 处理结果；若处理结果不更小，状态为 `cleaned`。

### SVG 与 SVGO

普通 SVG 压缩会自动读取：

```text
~/.config/wave/svgo.cjs
```

存在该文件时，Wave 会把它传给 `svgo --config`。示例：

```js
module.exports = {
  plugins: [
    "preset-default",
    {
      name: "removeAttrs",
      params: {
        attrs: "(data-name)",
      },
    },
  ],
};
```

`--icon` 使用 Wave 内置图标配置，不读取 `~/.config/wave/svgo.cjs`。内置配置会：

- 使用 `preset-default`
- 使用 `floatPrecision: 2`
- 删除 `fill`、`fill-rule`、`fill-opacity`
- 保留 `stroke`、`id`、`title`

`--icon` 适合 Sketch 导出的单色 SVG 图标，目标是让前端可以通过 CSS 重新赋色。多色图标、依赖透明度表达层级的图标，建议先 dry-run 检查输出。

### 压缩模式

| 模式 | 触发方式 | 工具选择 |
| --- | --- | --- |
| safe | 默认 | PNG 用 `oxipng`，JPG 用 `jpegtran` 或 `mozjpeg`，SVG 用 `svgo`，GIF 用 `gifsicle` |
| quality | 传 `--quality 1-100` | PNG 用 `pngquant`，JPG 用 `mozjpeg` |

检查压缩工具：

```bash
wave compress doctor
wave compress doctor --status
wave compress doctor --json
```

## 动效生成

`wave motion` 用于把 PNG 帧目录编码为 GIF 或 APNG。`wave mg` 是同等 alias。

```bash
# 在当前目录有 PNG 序列帧时选择 APNG/GIF
wave motion
wave mg

# 生成 GIF
wave motion gif ./frames

# 生成 APNG
wave motion apng ./frames

# 当前目录就是帧目录时，可以省略目录
wave mg apng

# 使用 alias
wave mg gif ./frames

# 指定帧率、输出路径
wave motion gif ./frames --fps 24 --out loading.gif

# 仅展示计划，不生成文件
wave motion apng ./frames --dry-run

# 覆盖已有输出
wave motion gif ./frames --force
```

默认行为：

- 输入必须是 PNG 帧目录；明确格式但省略目录时，默认使用当前目录。
- `wave motion` / `wave mg` 空参数只在 TTY 下进入格式选择，默认高亮 APNG。
- 非 TTY 下空参数会提示使用 `wave mg apng` / `wave mg gif` 或对应 `wave motion` 命令。
- 帧文件按文件名自然排序。
- 至少需要 2 帧。
- 所有帧尺寸必须一致。
- 默认 `fps=24`，`quality=80`，`loop=forever`。
- 不传 `--out` 时，GIF 输出到帧目录内的 `wave-mg/<frames-dir-name>@<fps>fps.gif`，APNG 输出到 `wave-mg/<frames-dir-name>@<fps>fps.png`。
- 输出已存在时默认报错；传 `--force` 才覆盖。
- 非 PNG 文件会被忽略并报告 warning。
- 无效 PNG 会报告 `WMG_FRAME_FORMAT_UNSUPPORTED`，不会泄漏运行时堆栈。
- GIF 后端不支持 `--loop once`，会明确报错；APNG 支持 `forever` 和 `once`。

检查动效工具和帧目录：

```bash
wave motion doctor
wave motion doctor ./frames
wave motion doctor ./frames --verbose
wave motion doctor ./frames --json
```

## Workspace

`wave workspace` 用来创建本地设计项目工作区。它按配置生成工作区名称、目录结构和 README，不读取 `themefile` 或 `main.yaml`。

### 创建工作区

```bash
wave workspace
```

也可以使用完整命令：

```bash
wave workspace create
```

命令会按配置依次询问 `type`、`title`、`version`、`tags` 等字段，然后展示即将创建的工作区名称、目标路径和目录数量。确认后，Wave 会创建工作区目录、子目录、占位文件和 `README.md`。

### 配置文件

Workspace 默认读取：

```text
~/.config/wave/workspace.yaml
```

如果这个文件不存在，Wave 使用内置默认配置。要调整命名、默认版本、目录结构或是否打开 Finder，请创建这个文件。

临时测试另一份配置时，可以用环境变量覆盖：

```bash
WAVE_WORKSPACE_CONFIG=/tmp/workspace.yaml wave workspace
```

### 完整配置样例

```yaml
baseDir: ~/Documents/Work
openAfterCreate: true
name:
  separator: "_"
  parts: [type, title, version, date, tags]
type:
  enabled: true
  default: FEAT
  content:
    - code: FEAT
      label: 新功能开发
    - code: VIZ
      label: 可视化项目
    - code: BUG
      label: Bug 修复
    - code: OPT
      label: 优化项目
title:
  enabled: true
  required: true
version:
  enabled: true
  default: v1.0.0
  prefix: v
date:
  enabled: true
  format: YYYYMMDD
tags:
  enabled: true
  style: bracket
folders:
  - path: 1.Docs
    placeholder: _需求文档或其他资料
  - path: 2.Public
    placeholder: _静态素材
  - path: 3.Reference
    placeholder: _参考资料
  - path: 4.Output
    placeholder: _对外发送
  - path: 9.Archive
    placeholder: _归档
```

### 常见调整

关闭版本号：

```yaml
version:
  enabled: false
  default: v1.0.0
  prefix: v
```

`version.enabled: false` 后，Wave 不再询问版本号，工作区名称、receipt 和 README 里也不会出现版本号。`name.parts` 里保留 `version` 不会出错；被关闭的字段会自动跳过。

调整名称顺序：

```yaml
name:
  separator: "-"
  parts: [title, type, version, tags]
```

`name.parts` 同时控制询问顺序和工作区名称顺序。可用字段是 `type`、`title`、`version`、`date`、`tags`。

关闭自动打开 Finder：

```yaml
openAfterCreate: false
```

调整目录结构：

```yaml
folders:
  - path: Docs
    placeholder: _brief
  - path: Output
```

`placeholder` 可选。没有 `placeholder` 时，Wave 只创建目录。

### 配置规则

- `baseDir` 是工作区创建位置，可以使用 `~`。
- `title` 目前必须保持 `enabled: true` 和 `required: true`。
- `type.enabled: true` 时，`type.content` 至少要有一个条目。
- `type.default` 必须匹配某个 `type.content[].code`。
- `version.prefix` 会补全版本号。例如 prefix 是 `v` 时，输入 `1.0.0` 会变成 `v1.0.0`。
- `tags.style` 目前只支持 `bracket`。输入 `UI,前端` 会变成 `[UI][前端]`。
- `folders[].path` 必须是相对路径，不能包含 `..`。
- `folders[].placeholder` 必须是文件名，不能包含 `/`、`\` 或 `..`。

### 输出内容

创建成功后，Wave 会输出 `WORKSPACE` receipt。receipt 展示：

- `Type`
- `Project`
- `Version`，仅当 `version.enabled: true` 且版本值存在时显示
- `Workspace`
- `FOLDERS`
- `Workspace created`

receipt 不展示配置文件路径，也不列出 placeholder 文件。

### 常见错误

| 错误码 | 说明 |
| --- | --- |
| `WWK_CONFIG_PARSE_FAILED` | `workspace.yaml` 不是合法 YAML。 |
| `WWK_CONFIG_INVALID` | 配置字段不符合 schema。 |
| `WWK_NAME_PART_UNKNOWN` | `name.parts` 使用了未知字段。 |
| `WWK_TITLE_REQUIRED` | `title` 被关闭，或创建时没有输入标题。 |
| `WWK_TYPE_EMPTY` | `type.enabled: true`，但 `type.content` 为空。 |
| `WWK_TYPE_DEFAULT_INVALID` | `type.default` 没有匹配任何 type code。 |
| `WWK_FOLDER_PATH_INVALID` | 名称片段、目录或 placeholder 包含不安全路径语法。 |
| `WWK_WORKSPACE_EXISTS` | 目标工作区目录已经存在。 |
| `WWK_CREATE_FAILED` | 创建目录、placeholder 或 README 失败。 |

## 用户可编辑路径

| 用途 | 默认路径 | 覆盖方式 |
| --- | --- | --- |
| Workspace 配置 | `~/.config/wave/workspace.yaml` | `WAVE_WORKSPACE_CONFIG` |
| Resource cache | `~/.cache/wave/resources/` | `WAVE_RESOURCE_CACHE_DIR` |
| Resource state | `~/.local/state/wave/resources/state.json` | `WAVE_RESOURCE_STATE_PATH` |
| Resource config | `~/.config/wave/resources/` | `WAVE_RESOURCE_CONFIG_DIR` |
| SVGO 配置 | `~/.config/wave/svgo.cjs` | 无；`--icon` 会忽略该文件 |

`~/.config/wave` 是 Wave 的用户配置目录。不同能力使用不同文件或子目录，互不覆盖。
