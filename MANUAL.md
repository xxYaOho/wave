# Wave 用户手册

本手册记录 Wave 面向使用者的操作方式。内部行为快照见 `docs/SPEC.md`。

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
