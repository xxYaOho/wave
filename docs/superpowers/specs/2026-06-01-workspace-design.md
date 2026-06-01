# Wave Workspace Design

## Context

`wave workspace` brings the existing `foldify-p` workflow into Wave. It creates a local design project workspace with a team-controlled naming rule and folder structure.

This spec only covers `foldify-p`. It does not include the media-library rename script.

## Command

```bash
wave workspace
wave workspace create
```

`wave workspace` is the low-memory entry. It behaves the same as `wave workspace create` and starts the TUI.

Future commands may use this namespace:

```bash
wave workspace config
wave workspace doctor
```

They are out of scope for the first implementation.

## Configuration

Wave reads one user-editable file:

```text
~/.config/wave/workspace.yaml
```

If the file does not exist, Wave uses the built-in default config. Tests may override the path with:

```text
WAVE_WORKSPACE_CONFIG=/tmp/.../workspace.yaml
```

Default config:

```yaml
baseDir: ~/Documents/Work
openAfterCreate: true

name:
  separator: "_"
  parts:
    - type
    - title
    - version
    - date
    - tags

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
  enabled: false
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

## Config Rules

- `name.parts` uses bare keys, not template strings.
- `name.parts` controls both TUI prompt order and workspace name order.
- `enabled: false` fields are skipped even if listed in `name.parts`.
- Empty optional values are skipped and do not leave repeated separators.
- `title` must remain enabled and required in v1.
- `type.content` must contain at least one entry.
- `type.default`, when present, must match a `type.content[].code`.
- `version.prefix` normalizes input. With prefix `v`, input `1.0.0` becomes `v1.0.0`.
- `tags.style` supports `bracket` only in v1. `UI,前端` becomes `[UI][前端]`.
- `folders[].placeholder` is optional. If omitted, Wave creates only the directory.
- `folders[].path` must be relative and must not contain `..`.
- YAML typos such as `flase` are config errors. Wave should report them, not guess.

## TUI Flow

The TUI uses `@clack/prompts`.

Prompts follow `name.parts` after disabled fields are removed:

1. `type`: select from `type.content`.
2. `type` custom option: a final `Custom...` entry opens a text prompt.
3. `title`: text input, required.
4. `version`: text input only when `version.enabled: true`.
5. `date`: automatic local date, no prompt.
6. `tags`: text input, optional, comma-separated.

Custom `type` behavior:

- Trim input.
- Convert to uppercase.
- Convert spaces to `_`.
- Keep letters, numbers, `_`, `-`, and CJK characters.
- Use the value for this run only. Do not write it back to config.

Before writing files, Wave shows a preview with the final workspace name, target path, and folder count. The user must confirm before creation.

## Create Behavior

After confirmation, Wave:

1. Creates `baseDir` if needed.
2. Refuses to continue if the target workspace directory already exists.
3. Creates the target workspace directory.
4. Creates `folders` in config order.
5. Creates each placeholder file when configured.
6. Generates `README.md`.
7. Opens Finder only when `openAfterCreate: true`.

Finder open failures produce a warning. They do not roll back created files.

Generated README:

- Uses the project title as the main title.
- Includes version only when `version.enabled: true`.
- Includes type, date, tags, and generated folder structure.
- Uses the actual created folder list.
- Does not expose a separate README template in v1.

## Receipt

Creation prints one receipt after the filesystem work completes. It should reuse the existing receipt helpers for CJK width, padding, and truncation.

Target shape:

```text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                       ✦  WORKSPACE  ✦                       │
│                                                              │
│              FEAT_项目名_20260601_[UI][前端]                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Type                FEAT                                    │
│  Project             项目名                                  │
│  Workspace           ~/Documents/Work/FEAT_项目名_...         │
├ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┤
│  FOLDERS             1.Docs                                  │
│                      2.Public                                │
│                      3.Reference                             │
│                      4.Output                                │
│                      9.Archive                               │
├──────────────────────────────────────────────────────────────┤
│                    Workspace created                         │
└──────────────────────────────────────────────────────────────┘
```

Rules:

- Do not show `Config`.
- Do not show placeholder files.
- Do not show version when `version.enabled: false`.
- Use friendly paths: prefer cwd-relative paths, then `~/...`, then absolute paths.
- Keep the folders as multiline key-value output, with the first folder on the `FOLDERS` row.

## Errors

Use concise error output and avoid stack traces.

| Code | Meaning |
| --- | --- |
| `WWK_CONFIG_PARSE_FAILED` | YAML could not be parsed. |
| `WWK_CONFIG_INVALID` | Config schema failed validation. |
| `WWK_NAME_PART_UNKNOWN` | `name.parts` referenced an unknown field. |
| `WWK_TITLE_REQUIRED` | `title` was disabled or empty. |
| `WWK_TYPE_EMPTY` | `type.content` was empty. |
| `WWK_TYPE_DEFAULT_INVALID` | `type.default` did not match any type code. |
| `WWK_FOLDER_PATH_INVALID` | A folder path was absolute or contained `..`. |
| `WWK_WORKSPACE_EXISTS` | Target workspace already existed. |
| `WWK_CREATE_FAILED` | Directory, placeholder, or README creation failed. |

## Test Plan

Tests must not touch the real user environment.

Isolation rules:

- Use temporary directories for `HOME`, config, and output.
- Set `WAVE_WORKSPACE_CONFIG` in tests.
- Set `openAfterCreate: false` in test configs.
- Do not call Finder or `open`.
- Delete temporary directories after tests.

Coverage:

- Built-in config creates the current `foldify-p` equivalent structure.
- User config can define custom types such as `VIZ` and `CRIP`.
- `name.parts` controls prompt order and workspace name order.
- `version.enabled: false` skips prompt, name part, receipt row, and README version.
- Custom `type` participates in the workspace name and does not modify config.
- Configured `folders` create directories and optional placeholders.
- Existing target directory fails without overwrite.
- Invalid configs produce the expected `WWK_*` code.
- Receipt includes `WORKSPACE`, `Type`, `Project`, `Workspace`, `FOLDERS`, and `Workspace created`.
- Receipt alignment remains stable with CJK project names.

Minimum verification:

```bash
bun test tests/cli-workspace.test.ts
pnpm typecheck
```

## Out Of Scope

- Media-library rename workflow.
- Multi-template system.
- Global profile system.
- `.wave/config.yaml`.
- Existing workspace rename or migration.
- Writing config changes back to `workspace.yaml`.
