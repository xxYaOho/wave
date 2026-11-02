---
class: material
ingested: false
integrated: false
metadata:
  title: Night themeId / baseId / mode（Token Manage）
  date: 2026-11-02
---

# Night themeId / baseId / mode（Token Manage）

本材料固定 Night 构建在 Sketch payload v2 `meta` 上的身份合同，供 Token Manage 按系列（`currentByBaseId`）识别 Day/Night 外观模式。

**合同（现行）**：Day 与 Night 共用同一 `themeId` 与 `baseId`；用 `meta.mode = day | night` 区分。**不要**再给 `themeId` 加 `@night` 后缀。Overlay 文件名仍为 `*@night.yaml`（路径约定与身份字段分离）。

## 文件约定

| 角色 | 路径约定 |
| --- | --- |
| Day main | `main.yaml` |
| Night main overlay | 同目录 `main@night.yaml` |
| Day profile | `profiles/<name>.yaml` |
| Night profile overlay | `profiles/<name>@night.yaml` |

Overlay **不写**根 `$id`；token 路径身份继承 Day，不得换发。`wave dt ids` 不把 night 文件当作身份写回目标。Doctor / detector 以 `*@night.yaml` 存在判定 night 启用。

## Sketch meta

payload `meta`：`{ themeId, baseId, mode, version: 2 }`。

实现：`sketchPassIds`（Day，`mode: day`）与 `sketchNightPassIds`（Night，同 id，`mode: night`）于 `src/core/pipeline/sketch-identity.ts`；theme-service 把 `mode` 经 prepare → generateTokens → sketch format 写入 payload。Day 载荷偏好显式 `mode: day`。

| 构建 | themeId | baseId | mode |
| --- | --- | --- | --- |
| Day main | 文档 `$id`（缺省则 `$config.theme` stem） | 等于 themeId（系列根） | `day` |
| Day profile | profile 文档 `$id`（可 null） | main 身份 / stem | `day` |
| Night（main 或 profile） | **与对应 Day 相同** | **与对应 Day 相同** | `night` |

`wave night` 写出时的注释头使用：`themeId=<dayId>`，`baseId=<dayId>`，`mode=night`（main 场景 dayId = 文档 `$id` 或缺省 theme stem）。构建期 Night pass 用 `sketchNightPassIds`，保证 Token Manage 用同一 `baseId` 归系列，用 `mode` 区分外观。

## Token Manage 识别要点

1. **系列键**是 `baseId`，不是文件名 stem。同一 Day 系列的 Night 共享 `baseId`（且共享 `themeId`）。
2. **模式键**是 `meta.mode`（`day` | `night`），**不是** `themeId` 的 `@night` 后缀（该后缀已废弃）。
3. Dark 是主题（profile / 另一套 Day），不是 Night mode；Wave 的 day/night 对齐 macOS light/dark 的是 **mode overlay**，勿与 Dark theme 混淆。
4. Overlay 缺失时 night 构建跳过；存在但非法根身份 / token 身份 → `FORMAT_ERROR`，不是静默 skip。

## 与 profile 合同的关系

`2026-09-29-profile-override-contract.md`「Night 与 Sketch skip」节仍成立的部分：night 是 day-local 路径叶子覆盖、不用 `$override`、合并在 profile 合并后的 day tree 上、只覆盖已有 `theme.color`/`theme.state`。身份句改为本材料：Day/Night 同 `themeId`/`baseId`；`mode` 区分。

## 回归锚点

- `tests/night-emit.test.ts`：`sketchNightPassIds` 保持 day ids 并设 `mode: night`；emit 头含 `mode=night`。
- `tests/sketch-payload-v2.test.ts`：named profile night payload 的 `themeId`/`baseId` 与 Day 相同，`mode: 'night'`。
