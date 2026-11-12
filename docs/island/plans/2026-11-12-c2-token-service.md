---
date: 2026-11-12
state: 待 fresh FULL-6（v6 结构性修订——FULL-5 台账消解，spike 深挖授权延续）
dispatch: 路线图计划 C2；三轮 FAIL（6→5→7）触发飞轮硬停 → Human 裁决 **spike 深挖**（2026-11-12）→ deep-spike 实测全分支（事实表 `.tmp/c2/spike-facts.md`）：show 七分支 + 单参类别 format 忽略不对称、create 名字归一化非报错/stem 5/已存在 5/父目录 dry-run 0/真实写入产物形状/缺 $id 12/入口缺失 10、wcag 成功与 night-skip 与祖先定位失败 5 与无 -f 10；初版等价基线因捕获包装 argv 污染报废（FULL-3 F1 实证）→ v4 重捕。主代理裁决：E1 等价四项含 create stdout/stderr；E2 entry+cwd 显式（inspect 仅 cwd——其查找以 cwd 为锚，与 CLI process.cwd 语义对齐）
---

# Wave C2 Token 应用服务 Plan

## Problem Statement

token 业务的编排逻辑仍散落在 CLI action 层，无法脱离 CLI 调用。经 FULL-1 勘测修正的事实：① `show-action.ts`（361 行）将资源查询/匹配业务（`findResource`、`loadResourceMatch`、`showResource`、`flattenResource`、`getBuiltinNames`）锁死为 CLI 私有函数，格式化与业务混杂；② `dt-new-profile-action.ts`（179 行）直接编排 workspace 加载/profile 派生/产物写出（含 `randomBytes(16)` 随机 `$id`、optsWithGlobals/cwd/logger/process.exitCode 隐式依赖）；③ **wcag 编排真身在 `doctor-action.ts:225` 私有函数 `runDesignTokenContrastCheck`**（loadDesignTokenSource → 依赖字典 → Night 合并 → 对比度检查全链，初版误判 dt-action 薄层）；④ build 已达标（90 行薄层 over generateTheme）。CLI 是上述业务唯一入口。

## Solution

三处真实下沉 + 一处核验：**inspect**（show 查询/匹配 → `src/core/inspect/` 结构化查询服务）、**create**（dt-new-profile 编排 → `src/core/pipeline/profile-create.ts`，随机源可注入）、**wcag**（doctor-action 对比度检查编排 → core 服务）；**build** 保持核验项（薄层证据固定化）。服务返回结构化结果 + 退出码语义，格式化渲染与 logger/process 依赖留在 CLI。验收 = 既有 CLI 行为输出合同不变（含随机 ID 规范化等价方法）+ 服务可独立调用 + 双层测试。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = c2-strict block `01a1cf48-6f2e-756a-84e9-b1afce93e29d`（max，派遣前 /clear 逐步捕获校准）；CODER-PLUS = c2-coder-plus block `01a1cf48-6225-7c3c-b0e1-94d92418ff00`（high，同前）。规则同 Q0 SPEC。

## User Stories

1. 作为项目维护者，我希望资源查询、profile 创建与 wcag 对比度检查业务可被服务化调用，以便 CLI 成为纯入口。
2. 作为设计师，我希望 CLI 行为与输出合同逐项不变，以便下沉不带来任何体验漂移。

## Constraints

- 公共 CLI 命令、输入输出合同不变：所有既有 CLI 测试断言逐条不变（纯机械下沉，断言修改属越界）。
- 输出等价方法（冻结，E1 裁决 + FULL-6 F1 脚本即协议）：**`scripts/c2-equivalence.sh` 为可执行协议真源**——三模式：`replay`（从基线快照重建全部用例输出：复制 std-with-ids 到临时目录、按 manifest argv 逐案执行、有序 create-write→exists）、`capture`（对当前树产出同结构输出）、`compare`（逐用例四项断言）。manifest v4 记录每案 argv；**无 /tmp 残留路径与占位符**（全部路径相对 fixtures 快照或 replay 临时目录解析）；`ids --write` 为 SETUP 用例（仅比对退出码——stdout 含随机 id，非用户可见合同）。show 全参数组合逐字节；create 产物在 `$id` 字段规范化后逐字节——**规范化定义（M1 + FULL-3 F-6 机器化）：比较脚本对产物执行固定规则 `sed -E 's/^\$id: [0-9a-f]{32}$/\$id: <profile-id>/'`——顶层锚定（无缩进 `$id:` 行首）、恰好 32 hex、整行替换；token 级嵌套 `$id`（缩进行）不匹配；比较命令 = `diff <(sed … base) <(sed … current)`**；stdout/stderr/退出码不经规范化原样比较。基线 = 开工 HEAD 预捕获（主代理持有，evidence 目录 `docs/island/plans/2026-11-12-c2-equivalence/` + manifest），比较脚本逐用例四项断言。
- P1a 缓存机制与冻结政策零语义变更；C1 registry/lazy-action 架构零触碰。
- 服务参数合同（E2 裁决 + FULL-4 F-3 精化）：create/wcag = `entry`（绝对）+ `cwd`（绝对）；**inspect = 仅 `cwd`（绝对）**——show 无 -f，查找以 cwd 为锚（与 CLI process.cwd 语义对齐，显式传入）。三服务内部**零 `process.cwd()` 依赖**。
- 写边界：`src/core/inspect/*`（新）、`src/core/pipeline/profile-create.ts`（新）、`src/core/doctor/wcag-service.ts`（新）、`src/cli/commands/show-action.ts`、`dt-new-profile-action.ts`、`doctor-action.ts`（仅 wcag 编排段外移与调用替换）、`tests/c2-*.test.ts`、`scripts/c2-build-gate.sh` 与 `scripts/c2-equivalence.sh`（FULL-5 M6 边界补全）。禁动：其他 action 文件、`registry.ts`/`index.ts`/`lazy-action.ts`、`theme-service.ts`/`token-cache.ts` 语义、输出格式。
- 渲染与进程依赖留 CLI：格式化函数组（`formatValueForDisplay` 等）、logger 输出、`process.exitCode` 赋值、optsWithGlobals 解析；服务内零 console/logger/process 依赖。
- 只读策略（诚实化，FULL-1 F-6）：inspect 服务**原样保留**现有 `loadResource` 调用语义（readOnly 透传现状 = false——资源缓存缺失时的 restore 行为是既有 CLI 行为的一部分，属等价保护范围，不由本计划改变）；「只读」指服务不修改 workspace/output 产物状态。

## Implementation Decisions

1. **inspect 服务**（`src/core/inspect/query.ts`，spike 实测事实冻结）：`resolveResourceQuery(input: { cwd: string /* show 无 -f，cwd 即查找锚——CLI 显式传 process.cwd()，服务内部零 process.cwd */, arg1?: string, arg2?: string, format: string /* 原样透传——非法 format 的校验发生在 resource 模式内部（FULL-3 F-2：单参类别模式实测忽略 format exit 0，union 无法表达该不对称；校验语义由模式承载） */, cache?: TokenCache }) → InspectQueryResult`。分派语义（实测）：`arg1` 为合法类别 → catalog 过滤分支；否则 `arg1` 作为**资源名回退**（FULL-2 F-5：`token show tailwindcss` 走 showResource，单参名与双参同链路）；双参 = 类别 + 名。结果 union：
   - `{ ok: true, payload: { mode: 'catalog', filter?: 'palette' | 'dimension', palettes: string[], dimensions: string[] } }`（无参 = 全量目录；单参类别 = 过滤目录——实测输出同构）
   - `{ ok: true, payload: { mode: 'resource', category: 'palette' | 'dimension', name: string, format, match: { source: 'builtin' | 'cache' | 'user', path: string, parsed: { namespace, data, …LoadedResource 载荷逐字段（resource-loader 导出类型） } /* namespace+data 包装为 flat-json/json 渲染依赖——FULL-5 M1 */, rawFileContent?: string /* format='yaml' */ } } }`（**单 match 对象**——实测多类别即错误、成功路径恒单 match，FULL-2 m-2；format='yaml' → `rawFileContent` 原始字节，其余 → `parsed` 由 CLI 格式化）
   - `{ ok: false, exitCode: ExitCodeType, message: string }`（消息与退出码按实测映射原文：未知类别/`✗ Unknown category: … Supported: palette, dimension` → 5；未命中/`✗ Resource not found: …` → 10；非法 format/`✗ Unknown format: … Supported: flat-json, json, yaml` → 5；加载失败按现状）
   **退出码类型 = `ExitCodeType`**（types/index.ts:16，FULL-2 M-7）。缺省 `cache` 自建临时实例（生命周期 = 单次调用内，调用后不可观察——FULL-2 m-3）；传入则复用（可断言 hits）。
2. **create 服务**（`src/core/pipeline/profile-create.ts`，deep-spike 实测冻结）：`createProfile(input: { entry: string, cwd: string, name: string, options: { dryRun?: boolean, force?: boolean, output?: string /* 有 -o 时 CLI 解析为绝对路径传入；缺省时 outputPath 由服务推导（FULL-5 F3：现 CLI 加载 workspace 后推导 `<workspaceDir>/profiles/<归一化名>.yaml`——dt-new-profile-action.ts:107-110 原样提取入服务） */ } /* 路径合同（FULL-4 M4 + FULL-5 F3）：服务 input 无 file（-f 由 CLI 解析为 entry）；entry 绝对；options.output 给定即绝对、缺省服务推导（推导规则属服务契约）；warnings/nextSteps 用解析后绝对路径（实测一致）。**optsWithGlobals 实测仅 file/output/dryRun/force**（file → entry，无 snapshotOverrides 选项）；**剩余错误分支预绑定（FULL-5 M2，不推迟施工报告）**：invalid name、重复 id/name、嵌套 profiles、loader 失败、source-output 写保护（目录/symlink/hardlink/Day-base）——逐分支消息/退出码以既有测试清单 + 源码行为双源冻结，服务测试逐分支绑定 */, randomSource?: () => string /* 返回值必须小写 32-hex，服务以 /^[0-9a-f]{32}$/ 校验注入值，不合法抛 TypeError——FULL-4 m-2 */ }) → CreateProfileResult`。**名字语义（实测）**：归一化（小写/空格转下划线）非报错。**成功/计划分支（可重建 CLI 全部 stdout，FULL-3 F-4）**：`{ ok: true, dryRun, outputPath, id, overwrites: string[] /* 将被覆盖的目标路径；planSourceOutput 实际返回 boolean 语义（FULL-6 M1）——受保护目标（目录/symlink/hardlink/Day-base）不进 overwrites，走 throw → 错误分支表；source-output.ts 在边界外零修改 */, nextSteps: string[]（有序 = 打印顺序，实测 3 条）, warnings: string[]（有序） }`——dry-run stdout = `✓ Dry run: would create: <path>` + `ℹ Next steps:`×3；写模式 = `✓ Created: <path>` + 同序 next steps；产物形状实测 `$id: <32hex>` + `$config.base` + `$override`。**错误分支表（现源全量冻结，FULL-6 M2——不再推迟）**：`{ ok: false, exitCode: ExitCodeType, message: string }`（message = raw 无图标）。逐分支（源 dt-new-profile-action.ts:60-179 现流）：①归一化失败 → error.message + INVALID_PARAMETER(5)；②workspace 加载失败 → loaded.message（含 `Invalid main.yaml $id;` 时附 idsHint 第二行）+ loaded.exitCode（缺失 10 / 无效 $id 12）；③themeId 缺失 → ProfileFormatError(`Base root requires a registered $id. <idsHint>`) → 捕获后 message = `Profile creation failed: <原文>` + exit 12；④stem 不匹配 → `Profile output must be named <name>.yaml` + 5；⑤已存在且（isDefault 或非同 realpath）→ `Profile "<name>" already exists` + 5（force + 同 realpath 豁免）；⑥planSourceOutput 保护性 throw（目录/symlink/hardlink/Day-base）→ 捕获后 `Profile creation failed: <原文>` + GENERAL_ERROR；⑦writeSourceOutput 失败 → 同⑥ GENERAL_ERROR。**零写入断言**：⑤⑥⑦分支目标路径 mtime/存在性不变（服务测试逐分支绑定）。成功分支：dry-run = `Dry run: would <overwrite|create>: <path>`（overwrites 布尔决定措辞）+ Next steps 1/2 + 条件 step 3（workspace 外目标 → 迁移警告变体）；写入 = `Created: <path>` + 同序。`$id` 默认 `randomBytes(16).toString('hex')`，`randomSource` 仅服务层（生产不变）。
3. **wcag 服务**（`src/core/doctor/wcag-service.ts`，spike 实测冻结）：`runContrastCheck(input: { entry: string, cwd: string, night: boolean, cache?: TokenCache }) → WcagResult`。**结果形状（FULL-6 F2 按实源重建模——per-pair 政策显式化）**：`WcagResult = DoctorRunResult & { displayThemeName: string }`——逐字段引用 types/index.ts:118-122 既有导出类型：`{ ok, blockingErrors: DoctorFinding[], reports: DoctorThemeReport[] }`；**per-pair 政策：每条 DoctorThemeReport = 一个对比对**（types/index.ts:111-116：`pair: DoctorNamedPair, ratio: number, scores: DoctorScoreLine[], findings: DoctorFinding[]`——多 pair fixture（orca-test/wcag.yaml）逐 pair 一条 report、无嵌套聚合、score 逐 report 独立不聚合）；渲染映射 = doctor-action 现状（banner + displayThemeName + 逐 report renderScoreLines：ratio.toFixed(2) + AA/AAA/fail 判级）；`displayThemeName` 为服务补充字段（页眉重建源——reports 为空时仍输出 'No wcagPairs found to evaluate.'）。**union 语义（FULL-4 F-4 按实源冻结）**：`blockingErrors` 非空 ⟺ `ok: false`——`{ ok: false, reports: …（已收集部分照带）, blockingErrors: 非空, exitCode: ExitCodeType, message: string }`（doctor-action 逐条渲染后按映射退出）。**displayThemeName 推导冻结**：= loadDesignTokenSource 解析后的显示主题名（doctor-action.ts:264-300 现状）；**exit 映射与多 finding 渲染（FULL-6 M3 冻结）**：blockingErrors 非空 → 逐条渲染各 DoctorFinding.message 行 + **GENERAL_ERROR**；context/load 早退 → 各自码（祖先定位 5 / 无 -f 10 / 文件缺失 10）且单 message 字段仅承载早退单错误（blocking 完成态逐条错误由 blockingErrors[] 承载，message 为空串）；night 合并失败 → `✗ <merged.error>` + FORMAT_ERROR；night-skip → 提示 + SUCCESS；`{ ok: true, reports, blockingErrors: [] }`（含 night-skip）。实测分支：成功 / night 跳过 / 祖先定位失败（exit 5，stdout）/ 无 -f（10）/ 文件缺失（10）。提取自 `doctor-action.ts:225` `runDesignTokenContrastCheck` 全链；doctor-action 保留解析与渲染。
4. **CLI 瘦身**：三个 action 保留参数解析、格式化渲染、logger/exitCode 映射；编排调用改为服务调用。
5. **build 核验项（期望值现时冻结，FULL-4 M5）**：目标 `src/cli/commands/build-action.ts`（现况 90 行、core 侧恰一条 import = theme-service）。核验脚本 `scripts/c2-build-gate.sh`（Task-2 交付——脚本只输出观测值 CORE_IMPORTS/THEME_ONLY/LINES，**oracle = 本 SPEC 冻结数字，比对由主线闸门执行（FULL-6 M5：脚本自身可写不作 oracle）**；固定调用 = `sh scripts/c2-build-gate.sh`，cwd = worktree 根，非零即 FAIL）：`CORE_IMPORTS=$(grep -c "from '../../core/" src/cli/commands/build-action.ts)`=1 且 theme-service 外 core import 为空（否则 exit 1）；`LINES=$(wc -l < … | tr -d ' ')` ≤ 100。数值比较；任一不匹配 exit 1；闸门独立复跑。
6. **双层测试**（绑定清单，FULL-2 M-4 补全）：show 分支 = 无参/单参类别/单参名回退/双参×3 format×2 类别/命中/未命中/未知类别/非法 format（双参 → exit 5；**单参类别 + 非法 format → 实测 format 被忽略 exit 0**——校验只在 showResource，矩阵含此不对称分支）/builtin-cache-user 三来源/自定义资源；create = dry-run/缺 $id（exit 12）/冲突/force/snapshotOverrides/写出成功（四项等价含 stdout/stderr）；wcag = 成功/night-skip/night 合并/context 加载失败/reports 与 blockingErrors 并存/失败分支。**服务纯净度检查（FULL-2 m-4）**：grep 服务文件禁 `process\.`/`console\.` 引用（import 之外含全局引用）＋ 零依赖断言。

## Testing Decisions

- 等价：`wave token show` 全矩阵（无参/单参类别/单参名回退×命中/未命中/非法 format/双参×3 format×2 类别×命中与未命中——miss×yaml/json 组合已补捕获（FULL-6 M4，基线 v4 共 33 案））vs 基线逐字节；create 产物规范化等价（`$id` 占位符化后 diff；含成功与 dry-run 路径）；wcag stdout 全文 + 退出码一致（普通 + --night）。manifest schemaVersion 4（快照重放协议）
- 服务测试：Implementation Decisions 6 绑定清单全绿；服务零 console/logger/process 依赖（静态断言：服务模块无相关 import）。
- 缓存穿线：传 cache 二次查询断言 `stats().loadResource.hits > 0`。
- 进程级：既有 CLI 测试套件全绿零断言变更；`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。

## Out of Scope

- 不下沉 workspace-action、motion-action、doctor（doctor 主体）、compress、manual、dt-init、dt-migrate、dt-ids、token-migrate、token-new、tool-module、install、night（不在路线图四命令点名或已达标；wcag 因其编排真身在 doctor-action 而纳入，doctor 其余部分不纳入）。
- 不改输出格式、C1 注册架构、帮助体系；不引入新公共命令/参数。
- 不做统一 service bus 抽象。

## Draft Plan

- 结构总览：CLI（解析 + 渲染 + 退出码映射）→ core/inspect（查询）/ core/pipeline/profile-create（编排）/ core/doctor/wcag-service（检查编排）→ 既有 core 函数；无新层。
- 关键契约：`InspectQueryResult`/`CreateProfileResult`/`WcagResult` 三形状（Implementation Decisions 1–3）；等价方法（`$id` 规范化）；缓存尾参合同。
- 文件结构：见 Constraints。
- 风险与未决：wcag 编排外移需逐行保真（Night 合并与上下文构造是 P1a 冻结面邻接区——只提取不改语义）；create 的 optsWithGlobals 展开为显式 options 形状需与 Commander 行为逐项对齐。无阻塞未决。
- 里程碑草案：单一 Milestone（三下沉 + 等价）。

## Implement Plan

worktree `c2-token-service`（已 FF 到 main @ f83196c；开工基线由主代理预捕获）。顺序：Task-1 inspect → Task-2 create + wcag → 闸门（等价复核 + build 核验）→ pruner → 集成。SPEC 通过 fresh FULL-4 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

业务下沉与合同等价验证

- 验证主题：inspect/create/wcag 业务可独立服务化调用；CLI 输出合同逐项不变（含 `$id` 规范化等价）；缓存穿线语义保持。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/c2-inspect-service.test.ts tests/c2-profile-create-service.test.ts tests/c2-wcag-service.test.ts`（mise bun 1.3.6，`--timeout 15000`）；既有 CLI 测试套件全绿零断言变更；等价矩阵对照（基线 `docs/island/plans/2026-11-12-c2-equivalence/`）。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

inspect 服务提取与 CLI 瘦身（来源：User Story 1；Decisions 1/4）

- 验收标准：`src/core/inspect/query.ts` 就位（union 三模式 + 错误分支，消息原文）；show-action 瘦身；yaml 格式 `rawFileContent` 原始字节合同；缓存尾参 + 静态零进程依赖断言；服务测试绑定清单全绿。**message raw 合同（统一化，FULL-4 M-3）**：三服务 message 一律 raw 文本（无 `✗`/`ℹ` 前缀——实测输出中的图标 = CLI logger 渲染产物，Decisions 2/3 的 ✗ 示例均为渲染后形态）；**输出通道表（冻结，FULL-5 M7 wcag 例外）**：wcag 错误走 **stdout 且 console.log 手工加 `✗ ` 前缀**（现状渲染路径，非 logger）；inspect/create 错误走 stderr（logger.error 自加前缀）；三服务 message 均 raw 无前缀，渲染层各加前缀一次，不得二次。
- 可动文件范围：`src/core/inspect/*`、`src/cli/commands/show-action.ts`、`tests/c2-inspect-service.test.ts`。
- 依赖：无。
- **中间检查点（FULL-3 M-4 + FULL-5 M5 语义冻结）**：单 Milestone 单派遣不变——Task-1 完成后 coder-plus **派遣内暂停**，发 Task-1 中期通报（diff + 测试结果）；主代理核验通过方可在同一派遣内继续 Task-2（不通过即停修）。
- 固有风险：业务/渲染切分逐行判定（闸门重点）；格式化泄漏服务 = 契约破坏。

- [ ] 查询业务提取 + union 契约。
- [ ] show-action 瘦身 + 服务测试（绑定清单）。

### Task-2

create 与 wcag 服务提取、全量等价验证（来源：User Story 2；Decisions 2/3/4/5；Testing Decisions 全部）

- 验收标准：`profile-create.ts`（全分支提取 + randomSource 注入）与 `wcag-service.ts`（对比度检查全链）就位；两 action 瘦身；服务测试绑定全绿（含缓存穿线）；三线等价矩阵通过（基线对照）；既有套件全绿零断言变更；build 核验证据入闸门记录。
- 可动文件范围：`src/core/pipeline/profile-create.ts`、`src/core/doctor/wcag-service.ts`、`src/cli/commands/dt-new-profile-action.ts`、`doctor-action.ts`（wcag 段）、`tests/c2-profile-create-service.test.ts`、`tests/c2-wcag-service.test.ts`、等价比较脚本。
- 依赖：Task-1。
- 固有风险：等价差异停机归因不调断言；wcag 外移触及 P1a 冻结邻接区（只提取不改语义）；create 错误分支遗漏 = 静默行为变更（绑定清单兜底）。

- [ ] create + wcag 服务提取与瘦身。
- [ ] 等价矩阵对照 + 全量回归 + build 核验记录。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理复核等价矩阵证据、双层测试与 build 核验记录，通过后 pruner 收尾、按路线图集成 main。
