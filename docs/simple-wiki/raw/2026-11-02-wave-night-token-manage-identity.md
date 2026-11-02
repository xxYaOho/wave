---
class: material
ingested: false
integrated: false
metadata:
  title: Night themeId / baseId / @night（Token Manage）
  date: 2026-11-02
---

# Night themeId / baseId / @night（Token Manage）

本材料固定 Night 构建在 Sketch payload v2 `meta` 上的身份合同，供 Token Manage 按系列（`currentByBaseId`）识别 Day/Night 模式。它**修正**较早材料中「night 的 themeId/baseId 随 day」的表述：`baseId` 仍随 Day 系列；`themeId` 取得 `@night` 后缀。

## 文件约定

| 角色 | 路径约定 |
| --- | --- |
| Day main | `main.yaml` |
| Night main overlay | 同目录 `main@night.yaml` |
| Day profile | `profiles/<name>.yaml` |
| Night profile overlay | `profiles/<name>@night.yaml` |

Overlay **不写**根 `$id`；token 路径身份继承 Day，不得换发。`wave dt ids` 不把 night 文件当作身份写回目标。Doctor / detector 以 `*@night.yaml` 存在判定 night 启用。

## Sketch meta

payload `meta`：`{ themeId, baseId, version: 2 }`。

实现：`sketchPassIds`（Day）与 `sketchNightPassIds`（Night）于 `src/core/pipeline/sketch-identity.ts`；theme-service night 循环调用后者。

| 构建 | themeId | baseId |
| --- | --- | --- |
| Day main | 文档 `$id`（缺省则 `$config.theme` stem） | 等于 themeId（系列根） |
| Day profile | profile 文档 `$id`（可 null） | main 身份 / stem |
| Night（main 或 profile） | `<dayThemeStem>@night`（已带后缀则不重复） | **与对应 Day 相同** |

`wave night` 写出时的注释头使用：`themeId=<stem>@night`，`baseId=` Day 文档 `$id`（缺省 theme stem）。构建期 Night pass 用 `sketchNightPassIds`，保证 Token Manage 用同一 `baseId` 归系列，用 `themeId` 是否含 `@night` 区分模式。

## Token Manage 识别要点

1. **系列键**是 `baseId`，不是文件名 stem。同一 Day 系列的 Night 共享 `baseId`。
2. **模式键**是 `themeId` 的 `@night` 后缀（字面量），不是单独的 mode 字段。
3. Dark 是主题（profile / 另一套 Day），不是 Night mode；Wave 的 day/night 对齐 macOS light/dark 的是 **mode overlay**，勿与 Dark theme 混淆。
4. Overlay 缺失时 night 构建跳过；存在但非法根身份 / token 身份 → `FORMAT_ERROR`，不是静默 skip。

## 与 profile 合同的关系

`2026-09-29-profile-override-contract.md`「Night 与 Sketch skip」节仍成立的部分：night 是 day-local 路径叶子覆盖、不用 `$override`、合并在 profile 合并后的 day tree 上、只覆盖已有 `theme.color`/`theme.state`。身份句改为本材料：`baseId` 随 Day；`themeId` = Day themeId（或 stem）+ `@night`。

## 回归锚点

- `tests/night-emit.test.ts`：`sketchNightPassIds` 后缀与 baseId 保持。
- `tests/sketch-payload-v2.test.ts`：named profile night payload `themeId` 为 `${PROFILE_ID}@night`，`baseId` 仍为 main `THEME_ID`。
