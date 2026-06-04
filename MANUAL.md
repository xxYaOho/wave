# Wave 用户手册

本手册记录 Wave 面向使用者的操作方式。内部行为快照见 `docs/SPEC.md`。

## Design Token Resource

`wave dt update` 用来更新 design-token 引用解析用的本地 resource。它只更新本地 cache，不修改包内 builtin，也不会让常规 `wave dt build` 重新判断 latest。

常规构建仍以 `main.yaml` 为 token 内容来源。Resource 只提供 `{resource.path}` 引用解析数据。

### 更新全部 resource

```bash
wave dt update
```

这会更新当前支持的可更新 resource：

- `tailwindcss`
- `leonardo`

### 更新 Tailwind CSS

```bash
wave dt update tailwindcss
```

不传版本时，Wave 解析 `tailwindcss@latest`，生成本地 cache，并记录实际解析到的版本。

指定 major 版本：

```bash
wave dt update tailwindcss --version 3
wave dt update tailwindcss --version 4
```

规则：

- v3 从 Tailwind 的颜色对象生成 DTCG YAML，颜色值保留 hex。
- v4 从 `theme.css` 读取 `--color-*` CSS variables，OKLCH 值保存为 DTCG object。
- v4 的 OKLCH component 会保留到 3 位小数。
- `black`、`white` 等非 OKLCH 值按源值保存。
- 目前只支持 Tailwind CSS v3 和 v4。如果 latest 指向尚未支持的 v5，Wave 会要求显式使用 `--version 4`。

### 更新 Leonardo

```bash
wave dt update leonardo
```

Wave 会生成两个 cache resource：

```text
leonardo-light.yaml
leonardo-dark.yaml
```

默认情况下，Wave 使用内置 Leonardo palette 拆分生成 light / dark cache。若存在用户 recipe，Wave 使用用户 recipe 生成新的 light / dark palette。

用户 recipe 路径：

```text
~/.config/wave/resources/leonardo.yaml
```

示例：

```yaml
colors:
  gray: "#808080"
  red: "#f53f3f"
  orange: "#f77234"
  green: "#00b42a"
  blue: "#165dff"
  purple: "#722ed1"
ratios:
  values: [1.05, 1.31, 1.66, 2.14, 2.81, 3.74, 5.1, 7, 9.59, 12.82, 16.29]
```

也可以用线性区间：

```yaml
colors:
  brand: "#165dff"
ratios:
  min: 1.05
  max: 16.29
  steps: 11
```

### 查看 resource 状态

```bash
wave dt status
```

输出会显示：

- cache 目录
- state 文件
- config 目录
- Tailwind 是否更新过、cache 是否存在、请求版本和解析版本
- Leonardo 是否更新过、light/dark cache 是否存在、recipe 来源

### 本地路径

默认路径：

```text
cache:  ~/.cache/wave/resources/
state:  ~/.local/state/wave/resources/state.json
config: ~/.config/wave/resources/
```

对应文件：

```text
~/.cache/wave/resources/tailwindcss.yaml
~/.cache/wave/resources/leonardo-light.yaml
~/.cache/wave/resources/leonardo-dark.yaml
~/.local/state/wave/resources/state.json
~/.config/wave/resources/leonardo.yaml
```

测试或临时隔离时，可以覆盖路径：

```bash
WAVE_RESOURCE_CACHE_DIR=/tmp/wave-cache \
WAVE_RESOURCE_STATE_PATH=/tmp/wave-state.json \
WAVE_RESOURCE_CONFIG_DIR=/tmp/wave-config \
wave dt status
```

### 读取优先级与 fallback

构建和 show 读取 resource 时按以下顺序查找：

1. 项目显式路径 resource
2. 用户本地 cache resource
3. 包内 builtin resource

从未执行过 `wave dt update` 时，Wave 使用 builtin。

如果 state 记录某个 resource 更新过，但 cache 文件被删除，Wave 会尝试恢复 cache：

- Tailwind CSS 按 state 里的请求版本重新获取。
- Leonardo 按当前用户 recipe 或 builtin recipe 重新生成。
- 恢复失败时，Wave 输出 fallback 提示，并继续使用 builtin。

### 常见错误

| 场景 | 说明 |
| --- | --- |
| Tailwind latest 指向不支持的 major | 显式运行 `wave dt update tailwindcss --version 4`。 |
| 网络失败 | `wave dt update tailwindcss` 需要访问 npm registry 和包文件源。若 state 记录 Tailwind 已更新但 cache 被清理，build/show 读取裸资源名时也会尝试联网恢复 cache。 |
| Leonardo recipe 色值非法 | `colors` 中的颜色必须是 6 位 hex，例如 `#165dff`。 |
| cache 被清理 | Wave 会按 state 尝试恢复；失败时回退 builtin。 |

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
