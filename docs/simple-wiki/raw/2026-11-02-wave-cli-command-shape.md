---
class: material
ingested: false
integrated: false
metadata:
  title: Wave CLI 命令层形状（dt / night 对齐）
  date: 2026-11-02
---

# Wave CLI 命令层形状（dt / night 对齐）

统一形状：`wave [command] <file 默认 cwd/main.yaml> <--flag> [parameters]`。

## 约定

| 点 | 合同 |
| --- | --- |
| 入口文件 | 可选位置参数；缺省 `./main.yaml`；目录则展开为 `<dir>/main.yaml` |
| `-f/--file` | 与位置参数互斥；二选一 |
| `wave dt` 默认 | 无子命令时注入 `build` |
| 糖衣旗 | 无子命令时：`--build`→build；`--ids`→ids；`--ids-write`→`ids --write` |
| `wave night` | 顶层命令；位置参数 / `-f` 与 dt 同形；产出仍为 `*@night.yaml` |
| 脚本兼容 | 保留 `wave dt build`、`wave dt ids --write` 等显式子命令 |

位置参数写成 `profiles/xx.yaml` 仅作形状示例；工作区入口仍是 `main.yaml`（profile 不作 entry）。

## 实现锚点

- `src/cli/file-input.ts`：`resolveExclusiveFileInput` / `expandMainYamlEntry`
- `src/cli/normalize-argv.ts`：`normalizeWaveArgv`（dt 糖衣与 compress/workspace 默认子命令）
- 回归：`tests/normalize-argv.test.ts`、`tests/cli-dt.test.ts`（positional / sugar）
