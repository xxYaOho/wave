---
date: 2026-09-24
state: 施工中
dispatch: ~
---

# Sketch Swatch `$ref` 撤回 Plan

## Problem Statement

Wave 输出给 Sketch Sync Token 的 payload v2，会在 layer 记录的颜色位置写入 `{ "$ref": "<uuid>" }`，把颜色绑定到同清单 color 记录生成的 Swatch。当前实现里，同一份 payload 因此存在两种颜色表达：outline ring 的 ring 层是 uuid 引用，gap 层与全部 shadow / gradient 位置是 HEX8 快照。

这份间接性对消费 payload 的设计师与插件没有换回可用的收益：

- 绑定只覆盖 outline ring 一个位置（typography 的 `textColor` 已随 payload v2 退役），阴影、渐变等真正高频的颜色位置从来都是 HEX8；读 payload 时必须回到资产清单按 uuid 二次查找，才知道颜色到底是什么。
- 它把输出格式的选择反向耦合进 token 组织方式：颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过或被 root selection 排除，会让一个 outline border 的构建直接失败。

试用期判定已经落地：不保留这层映射。此外，`docs/SPEC.md` 中"layer 记录的颜色位置（`shadows[].color`、`gradient.color`）写 `$ref`"的措辞，与实际实现（仅 outline ring）也不一致，一并消解。

## Solution

Sketch payload 的颜色位置一律写具体值 HEX8（`#RRGGBBAA`，alpha / opacity override 折入 alpha 通道）。`$ref` 绑定能力、其元数据链路与配套校验整体移除。

outline ring 仍是 ring 层 + gap 层两层 `shadows`，gap 层维持固定 `#ffffffff`；layer 载荷形状、`meta` / `assets` 结构、name 生成规则均不变。

## User Stories

1. 作为消费 Sketch payload 的设计师，我希望 layer 记录里的每个颜色位置都是可直接读取的 HEX8 值，以便不必回到资产清单按 uuid 二次查找。
2. 作为维护 token 库的设计师，我希望颜色 token 是否登记 `$id`、是否被 `sketch.skip` 跳过，都不影响 outline border 的构建成功，以便 Sketch 平台的表达约束不反向决定我的 token 组织方式。
3. 作为依据文档判断行为的开发者或 agent，我希望 SPEC、manual 与 simple-wiki 对 Sketch 颜色位置的描述与实现一致，以便不再为"哪些位置会写 `$ref`"做二次考证。

## Constraints

- Sketch payload v2 的协议形状不变：根 `meta` + `assets`；记录 `{ uuid?, name, kind, <载荷> }`；layer 载荷键表不变。
- 颜色位置的真值仍是 HEX8 `#RRGGBBAA`；带 alpha / opacity override 的颜色折入 alpha 通道。
- outline ring 的两层 `shadows` 结构（ring 在前、gap 在后）与 gap 层固定 `#ffffffff` 不变。
- CSS 侧的 `_colorReference`（`var(--<token>)` 引用保留）与 `_typographyColor` 与本变更无关，语义必须保持原样。
- `sketch.skip`、`includeRootKeys`、`filterLayer`、name 唯一性与"name 精确重复即 build 报错"等既有 payload 规则不变。
- 跨仓边界：Sync Token 侧原本就必须能消费无 `$ref` 的 HEX8 快照（降级路径已存在），本次不新增插件侧协议要求。

## Implementation Decisions

- 撤回 Sketch swatch `$ref` 绑定：颜色位置不再写 `{ "$ref": "<uuid>" }`，一律写 HEX8 快照。
- 删除 Sketch 专用颜色引用元数据的采集与传递：resolver 两趟（internal / external）、transformer、类型定义都不再承载 `_sketchColorReference`。
- 删除 formatter 侧的颜色别名索引（curly 与 RFC 6901 pointer → emitted color token）、outline ring 的引用解析，以及"内部引用目标未入账即 build 报错"的校验；该报错随绑定能力一起消失。
- 删除试用期开关 `SKETCH_SWATCH_REF_MODE` 与 `SketchSwatchRefMode` 类型；`assembleSketchPayload` 的选项不再接受 `swatchRefMode`。
- `SketchColorSlot` 由 `string | { $ref: string }` 收敛为 `string`（HEX8）；`shadows[].color`、`gradient[].color`、`fills[].color` 槽位类型随之收窄。破坏面在输出合同（layer 颜色位置不再有 `$ref`）而非类型 API：仓内无第二个类型消费者，`package.json` 也没有发布面。以 changeset 记录该输出合同变更。
- 变更按"消费者侧（formatter/类型）→ 生产者侧（resolver/transformer）→ 文档与知识库"三段推进，每段独立可验证；先删发射再删采集，使被删元数据在中间态是无消费者的死代码，删除边界清晰。
- simple-wiki 的 `sketch-color-reference-contract.md` 描述的 v1 `@/<full-output-path>` 合同整体作废：按 SCHEMA 的 superseded 语义保留旧论断并标注取代来源，不删除、不静默覆盖。

## Testing Decisions

- 测试判据只针对外部行为：Sketch payload 的最终 JSON 形状（颜色位置的值、`$ref` 不出现）、构建成功与否、是否抛错。不新增对内部元数据的断言。
- 既有对 `_sketchColorReference` 的断言按层归属删除或改写为 payload 值断言，不留"元数据消失"这种实现细节测试。
- 受影响测试面：由各 Task 的可动文件范围唯一定义，本节不重复列举，避免两处清单漂移。判据原则：删断言而不是换断言——颜色位置一律断言最终 HEX8 值，不对已删除的内部元数据做替代性实现断言。
- 新回归：`sketch.skip` 的目标颜色 + outline border 组合必须构建成功并输出 HEX8（旧行为的报错路径已删除）。
- 全量 `bun test` 的既有基线存在 2 个与本次无关的失败（`tests/cli-motion.test.ts` 的两个 TTY 用例，改动前即红）；它们是环境相关既有红，不作为本次判据，也不在本计划内修复。收口判据为：受影响测试文件全绿 + `pnpm typecheck` 通过 + canary 断言通过。
- 真实消费者 canary：用 `pnpm dev -- dt build -f /Users/teatao/Downloads/20260924-test-v1/main.yaml --profiles all --out <受控临时目录>` 生成，与**先复制到受控目录的**改动前基线对比（源目录里那份产物是唯一副本，不得反复覆盖）。断言：`grep -c '\$ref' orca2sketch.json` 为 0；outline ring 的 ring 层为 `#155dfcff`、gap 层为 `#ffffffff`；除该处外 `diff` 为空，且 `orca.css` / `orca2md.yml` 与基线完全一致。

## Out of Scope

- 不恢复 v1 的 `@/<路径>` 字符串合同，也不引入第三种颜色绑定形式。
- 不改变 Sync Token 插件的认养 / duplicate 规则（`uuid` / `name` 匹配语义）。
- 不修改 `docs/simple-wiki/raw/` 中既有 raw 正文（正文不可修改），也不批量修复 doctor 报告的 `INVALID_FM`（历史遗留，独立处理）。
- 不重构 outline 载荷生成（`offset` / `spread` 计算、gap 层）本身。
- 不改变 JSON / JSONC / CSS / md-yml 任何输出。

## Further Notes

- 撤回后 outline ring 的颜色不再随 Swatch 联动：Sketch 侧改色需要重新导入 payload。这是本决策的已知代价，换取 payload 的直接可读与 token 组织方式的解耦。
- 本计划落地后，`docs/SPEC.md` 中宣称 `shadows[].color` / `gradient.color` 会写 `$ref` 的条目改为"一律 HEX8"，并删除试用期开关段落。
- simple-wiki 的 `sketch-color-reference-contract.md` 描述的是 v1 `@/<full-output-path>` 合同（该合同在 payload v2 时已被 SPEC 宣告取代，页内并未跟进）；本次撤回 v2 的 `$ref` 后，该页描述的「同文档颜色引用」能力在 Wave 侧整体不存在，因此整页作废，而不是「再补一代」。`sketch-typography-output-contract.md` 中以现在时引用该合同的句子同样失真，需一并修正。

## Draft Plan

- 结构总览：三段式。① formatter 停止发射 `$ref` 并删除别名索引与校验，payload 类型收窄；② resolver / transformer / 类型删除元数据采集；③ SPEC、manual、simple-wiki 同步。数据流回到单一路径：token → resolver（解析值）→ transformer（HEX8）→ sketch formatter（组装载荷）。
- 关键契约：
  - `SketchColorSlot`：`string | { $ref: string }` → `string`。
  - `assembleSketchPayload(writeTokens, allTokens, { themeId, filterLayer })`：选项去掉 `swatchRefMode`。
  - `SKETCH_SWATCH_REF_MODE` 常量与 `SketchSwatchRefMode` 类型删除。
  - `extractSketchColorReference()`、`_sketchColorReference`（`ResolvedDtcgToken` 与 `WaveToken` 两侧）删除。
  - outline ring 载荷形状不变：`shadows[0].color` = ring 色 HEX8，`shadows[1].color` = `'#ffffffff'`。
- 文件结构：
  - `src/core/generator/formats/sketch-payload.ts`：删除别名索引、`resolveRingColorSlot` 及相关 helper 与选项字段；ring 颜色直接走 `formatSketchColorValue`。
  - `src/core/generator/formats/sketch.ts`：删除开关常量与选项传参。
  - `src/types/index.ts`：删除 `SketchSwatchRefMode`，`SketchColorSlot` 收窄；两个 `_sketchColorReference` 字段由生产者侧删除节点一并移除。
  - `src/core/resolver/reference-utils.ts`、`src/core/resolver/reference-token-internal.ts`、`src/core/resolver/reference-token-external.ts`：删除元数据采集与导出。
  - `src/core/transformer/theme-transformer.ts`：删除类型闸门与 `_sketchColorReference` 输出。
  - `tests/`：按 Testing Decisions 调整。
  - `docs/SPEC.md`、`manual/pages/design-token-extensions-output.md`、`manual/pages/design-token-color-typography.md`：改为 HEX8 唯一表达。
  - `docs/simple-wiki/`：新增 raw 决策材料与 decision 页；`wiki/sketch-color-reference-contract.md` 标 superseded，`wiki/sketch-typography-output-contract.md` 修正引用句；`wiki/INDEX.md` 与 `LOG.md` 接线。
- 风险与未决：
  - 已通过评审的历史计划进入冻结期，不改写其中的决策 6；本次变更以新计划追加，不回头修订旧计划。
  - 跨仓影响：插件若依赖 `$ref` 判断"这是绑定色"，撤回后只能看到 HEX8。降级路径本已存在，判定可接受；若插件实测需要绑定，另行以新协议表达，不在本次引入。
  - `SketchColorSlot` 是导出类型，但仓内无第二个消费者（`src/index.ts` 仅导入 CLI 入口，`package.json` 无 `exports` 字段），收窄的破坏面实际是**输出合同**而非类型 API；以 changeset 说明「Sketch payload 不再出现 `$ref`」为准。
  - 主要机械风险是残留引用：元数据在 4 个测试文件中被构造与断言，第 5 个（`tests/integration/theme-service.test.ts`）只用结构遍历 helper，删除时以 `grep` 收口。
- 里程碑草案：M1 消费者侧撤回；M2 生产者侧删除；M3 文档与知识库同步。

## Implement Plan

实施总览：三个里程碑按序推进，每碑以其核验基线收口；M1 必须先于 M2（先删发射，使采集端成为死代码），M3 最后（避免文档先行描述未落地的行为）。

验证主题地图：

- M1 → "Sketch payload 中不再有 `$ref`，颜色位置全是 HEX8"（单元 + 集成 + 真实消费者 canary）
- M2 → "元数据链路不存在且无残留引用"（typecheck + grep + 受影响测试 + canary 与 M1 逐值一致）
- M3 → "SPEC / manual / wiki 与实现一致，馆藏健康"（grep + doctor）

文件结构见 Draft，此处不重复。

## Milestone-1

消费者侧撤回：Sketch formatter 不再发射 `$ref`

- 验证主题：sketch payload 的每个颜色位置都是 HEX8 具体值；`$ref` 不再出现在任何输出。
- 核验基线：`bun test tests/format-sketch.test.ts tests/sketch-extension-format.test.ts tests/sketch-payload-v2.test.ts tests/integration/theme-service.test.ts` 全绿（覆盖 Task-1 的全部可动文件）；`pnpm typecheck` 通过；真实消费者 canary 的 `orca2sketch.json` 无 `$ref`，outline ring 的 ring 层为 `#155dfcff`。
- 来源：Problem Statement（两种颜色表达 + 报错耦合）、Story 1、Story 2。

### Task-1

formatter 删除 `$ref` 发射路径（来源：Story 1、Story 2）

- 验收标准：
  - 具名回归（本次唯一新增的外部行为变化）：`sketch.skip` / root-excluded / 无值的目标颜色 + outline border 组合，改动前 build 报错、改动后构建成功并输出 HEX8 —— 由 `format-sketch.test.ts` 的 `builds outline rings whose color target is skipped or out of scope` 与 `sketch-extension-format.test.ts` 的 `builds outline rings whose color target is skipped or excluded` 两个 hermetic 用例承接，不得只靠改写既有用例顺带覆盖。
  - `sketch-payload.ts` 不再包含颜色别名索引、`resolveRingColorSlot`、`colorReferenceAliases`、`isInternalSketchColorReference`、`hasSafeCurlyPath`、`encodeJsonPointerSegment`，也不再使用 `REFERENCE_PATTERN` 导入。
  - outline ring 的 `shadows[0].color` 由 `formatSketchColorValue` 产出 HEX8；`shadows[1].color` 保持 `'#ffffffff'`。
  - `assembleLayerAsset` 与 `assembleSketchPayload` 不再接收 `swatchRefMode`；`SketchPayloadAssembleOptions` 不再有该字段。
  - `SketchColorSlot` 收敛为 `string`；`SketchSwatchRefMode` 与 `SKETCH_SWATCH_REF_MODE` 删除。
  - 目标颜色被 `sketch.skip` 跳过、被 root selection 排除或未登记 `$id` 时，构建一律成功并输出 HEX8。
- 可动文件范围：`src/core/generator/formats/sketch-payload.ts`、`src/core/generator/formats/sketch.ts`、`src/types/index.ts`（仅 `SketchColorSlot` / `SketchSwatchRefMode` / payload 选项）、`tests/format-sketch.test.ts`、`tests/sketch-extension-format.test.ts`、`tests/sketch-payload-v2.test.ts`、`tests/integration/theme-service.test.ts`（仅 `collectSwatchRefs` 相关断言）。
- 依赖：无。
- 固有风险：删除 helper 时误伤其他 color slot 的正常格式化；`SketchColorSlot` 收窄会同时波及 `gradient` / `fills` 槽位的测试期望，需一并确认它们本就是 HEX8。

- [x] 步进 1：先改测试期望——outline ring 一律 `toBe('#112233ff')`（fixture 的实际值），删除"绑定 uuid"与"未入账即报错"两个用例，`sketch-extension-format` 的目标校验用例改为断言构建成功 + HEX8；运行 `bun test` 观察红。
- [x] 步进 2：删除 formatter 侧发射路径、选项字段、`SketchColorSlot` 联合成员、`SketchSwatchRefMode` 与开关常量，清理 `REFERENCE_PATTERN` 导入。这些改动互为编译前提（删选项字段而留调用点会立即 TS2353），必须落在同一个可编译提交里，不切分步进。
- [x] 步进 3：`pnpm typecheck` 通过 + 受影响测试全绿。
- [x] 步进 4：跑真实消费者 canary（命令见 Testing Decisions），对照基线确认除 ring 层颜色外 `diff` 为空。
- [x] 步进 5：新增 `.changeset/*.md`（minor，记录 Sketch 输出合同变更），原子提交（`feat(sketch)!: emit HEX8 snapshots instead of $ref swatch bindings`）。

### Task-2

删除别名唯一性预检并保留 name 唯一性（来源：Story 1、Story 2）

- 验收标准：
  - "Duplicate Sketch color reference alias" 错误与触发它的测试用例移除。
  - `Duplicate Sketch asset name` 的 name 唯一性检查与其测试保持不变。
  - 相同 `sketch.path` 前缀重叠（如 `shadow` 与 `shadow/elevation-*`）仍合法共存。
- 可动文件范围：`tests/format-sketch.test.ts`、`tests/sketch-extension-format.test.ts`。
- 依赖：Task-1（别名索引删除后该预检已无实现）。
- 固有风险：低；两个测试文件各有一份同名用例，都要删；同时需确认 `Duplicate Sketch asset name` 的 name 预检用例保留。

- [x] 步进 1：删除两个文件中的 `rejects duplicate source aliases across distinct names` 用例，确认 name 冲突用例仍红绿正确。
- [x] 步进 2：`bun test tests/format-sketch.test.ts` 全绿，提交。

> [!IMPORTANT]
> Milestone-1 闸门：按上方验证主题与基线核验，未通过不进入 Milestone-2。

## Milestone-2

生产者侧删除：`_sketchColorReference` 元数据链路整体移除

- 验证主题：Sketch 专用颜色引用元数据在源码、类型与测试中均不存在残留，且删除后行为与 M1 态逐值一致（canary 产物与 M1 产物 `diff` 为空，而不只是「不报错」）。
- 核验基线：`pnpm typecheck` 通过；受影响测试文件（`format-sketch` / `sketch-extension-format` / `transform-to-wave-tokens` / `resource-resolver` / `sketch-payload-v2` / `integration/theme-service`）全绿（全局 `bun test` 的 2 个既有 TTY 红不计）；`grep -rn 'sketchColorReference\|SketchColorReference\|SketchSwatchRefMode\|swatchRefMode\|SKETCH_SWATCH_REF_MODE' src/ tests/ benchmarks/ scripts/` 无匹配（`docs/` 归档除外，见 Testing Decisions）；`grep -c 'colorReferenceAliases' src/core/generator/formats/sketch-payload.ts` 为 0，且 `src/core/generator/formats/css.ts` 中的同名 private helper 仍被 CSS `var()` 引用路径消费。
- 来源：Story 1、Story 2；prefactor 性质——删除 M1 之后无消费者的采集链路。

### Task-1

resolver 停止采集元数据（来源：Story 1、Story 2）

- 验收标准：
  - resolver 两趟不再产出 Sketch 专用颜色引用元数据；`pnpm typecheck` 通过。
  - 边界（必须原样保留）：`_colorReference`、`_swatchName` 及其全部消费者（CSS `var(--…)` 引用保留、多个测试）不受影响；`extractDirectColorReference()` 保留。
  - `tests/resource-resolver.test.ts` 中元数据断言删除后仍覆盖 `_colorReference` 与 alpha override 的既有行为。
- 可动文件范围：`src/core/resolver/reference-utils.ts`、`src/core/resolver/reference-token-internal.ts`、`src/core/resolver/reference-token-external.ts`、`tests/resource-resolver.test.ts`。
- 依赖：Milestone-1。
- 固有风险：`_swatchName`、`_colorReference`、`_sketchColorReference` 三者在 resolver 同一段代码里相邻出现，其中前两者仍被 CSS 与多个测试消费，删除时须逐处确认只删 `_sketchColorReference`。另有一个同名异物：`src/core/generator/formats/css.ts` 中的 private `colorReferenceAliases` 服务 CSS `var(--…)` 引用保留，与 sketch 侧已删除的同名 helper 无关，不得连带删除。

- [x] 步进 1：删除两个 resolver 入口的元数据计算与写入，删除提取函数。
- [x] 步进 2：清理对应测试断言，运行 `bun test tests/resource-resolver.test.ts` 全绿。
- [x] 步进 3：`pnpm typecheck` 通过后提交。

### Task-2

transformer 与类型删除字段（来源：Story 1、Story 2）

- 验收标准：
  - 元数据字段与 transformer 的类型闸门不复存在；`pnpm typecheck` 通过，全部构造点（含 `tests/sketch-extension-format.test.ts`）同步清理。
  - 边界（必须原样保留）：`_colorReference` 与 `_typographyColor` 的语义与断言不变。
  - `grep` 基线与 canary 逐值对比同时通过：删除只移除链路，不改变任何产物。
- 可动文件范围：`src/core/transformer/theme-transformer.ts`、`src/types/index.ts`、`tests/transform-to-wave-tokens.test.ts`、`tests/format-sketch.test.ts`、`tests/sketch-extension-format.test.ts`、`tests/resource-resolver.test.ts`（后两者含 `_sketchColorReference` 构造点，字段删除后会立即类型报错，必须同节点清理）。
- 依赖：Task-1。
- 固有风险：类型字段删除后所有构造点会立即类型报错，必须在同一节点内清理完毕。

- [x] 步进 1：删除接口字段与 transformer 闸门 / 输出。
- [x] 步进 2：清理测试构造点与断言，运行 `pnpm typecheck && bun test` 全绿。
- [x] 步进 3：`grep` 确认无残留标识符，跑真实消费者 canary 复验，提交（`refactor(dt): drop sketch color reference metadata chain`）。

> [!IMPORTANT]
> Milestone-2 闸门：按上方验证主题与基线核验，未通过不进入 Milestone-3。

## Milestone-3

文档与知识库同步

- 验证主题：SPEC、manual 与 simple-wiki 三处对 Sketch 颜色位置的描述都收敛为"一律 HEX8"，馆藏 doctor 健康。
- 核验基线：`grep -rn 'SKETCH_SWATCH_REF_MODE\|swatch 引用\|swatch `\$ref`' docs/SPEC.md manual/pages/` 无匹配；`grep -n '\$ref' docs/SPEC.md | grep -c 'layer 记录中的颜色位置'` 为 0；`bash /Users/teatao/.dsh/skills/yes-swiki/scripts/doctor.sh --detail maintain` 的 `INDEX_UNLISTED` / `INDEX_DANGLING` / `RAW_PENDING` 不高于改动前快照。
- 来源：Story 3。

### Task-1

SPEC 与 manual 措辞修正（来源：Story 3）

- 验收标准：
  - `docs/SPEC.md` 的 sketch 小节：删除「layer 颜色位置写 `$ref`」与试用期开关段落，改为「颜色位置一律输出 HEX8 快照」；保留 name 唯一性、outline 两层 shadows、gap 层 `#ffffffff` 等既有条目。
  - 同节的 alpha/gap 条目（「含 alpha/opacity override 的颜色保持 HEX8……未绑定 `$ref` 的颜色位置输出 HEX8 快照」）与 sketch 小节之后的独立段落（「CSS 不使用 Sketch 的 swatch `$ref` 绑定……Sketch 颜色绑定改在 payload 内部以 `$ref` 表达」）都必须一并改写——后者是第二处 `$ref` 承诺，位于项目符号表之外，易漏。
  - inheritColor 条目改写为准确描述：目标兄弟颜色被 `sketch.skip` 跳过或缺失时，实现是静默回退合成色而非报错（该句在改动前即已失真），不得再写成「build 必须报错」。
  - `manual/pages/design-token-extensions-output.md` 与 `manual/pages/design-token-color-typography.md` 中"颜色位置可写 `$ref` 绑定 Swatch"的说明改为 HEX8 唯一，并说明改色需重新导入。
- 可动文件范围：`docs/SPEC.md`、`manual/pages/design-token-extensions-output.md`、`manual/pages/design-token-color-typography.md`。
- 依赖：Milestone-2（行为已定稿）。
- 固有风险：SPEC 该条与相邻条目（alpha override、name 规则、inheritColor）交织，改写时只动颜色表达部分。

- [x] 步进 1：改写 SPEC sketch 小节的 swatch 引用条目与 alpha/gap 条目。
- [x] 步进 2：改写 manual 两页。
- [x] 步进 3：`grep` 复验无残留承诺，提交。

### Task-2

simple-wiki 收录与接线（来源：Story 3）

- 验收标准：
  - 本计划的决策层作为 raw material 收入 `docs/simple-wiki/raw/`（`class: material`）。
  - 由 librarian 编译出描述"Sketch swatch 绑定撤回"的 decision 页，`sources` 指向新 raw。
  - `docs/simple-wiki/wiki/sketch-color-reference-contract.md` 标记 `status: superseded`，旧论断保留并标注取代来源；`docs/simple-wiki/wiki/sketch-typography-output-contract.md` 中以现在时引用该合同的句子同步修正。
  - `docs/simple-wiki/wiki/INDEX.md` 行同步（注意 INDEX 位于 `wiki/` 下，不是 simple-wiki 根），`docs/simple-wiki/LOG.md` 追加操作记录。
  - `doctor.sh` 复跑无新增告警。
- 可动文件范围：`docs/simple-wiki/raw/`、`docs/simple-wiki/wiki/`（含 `wiki/INDEX.md`）、`docs/simple-wiki/LOG.md`。
- 依赖：Task-1。
- 固有风险：librarian 写入范围须以协调后的 `PAGE_PLAN` 白名单约束，禁止越界改写其他页。

- [x] 步进 1：收录 raw 材料，派 librarian 编译 decision 页。
- [x] 步进 2：接线 INDEX / LOG，标记旧页 superseded。
- [x] 步进 3：复跑 doctor，提交（`docs(dt): record sketch swatch ref retirement`）。

> [!IMPORTANT]
> Milestone-3 闸门：按上方验证主题与基线核验；完成后跑一次 `pnpm check:ci` 作为整体收口。
