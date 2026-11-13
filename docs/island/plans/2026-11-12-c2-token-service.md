---
date: 2026-11-13
state: 施工中（v10 终审后 Human 授权闸门兜底收场 2026-11-13——FULL-10 五项转 harness 实现要求由 gate 实证验收；Milestone-1 派遣）
dispatch: 路线图计划 C2。七轮审查演进（6→5→7→2→5→3→2 FATAL）证明：纸面分支表/形状冻结无法穷尽源码分支，每轮修正确认旧账又揭开新表述缺口。Human 裁决（2026-11-13）：**基线即合同**——撤除全部纸面形状/分支冻结，等价基线 v4（35 案四项）为唯一行为 oracle；先例：P1b spike 先行、M1 v6 机械扫除。
---

# Wave C2 Token 应用服务 Plan

## Problem Statement

token 业务的编排逻辑散落在 CLI action 层，无法脱离 CLI 调用：`show-action.ts`（361 行）的资源查询/匹配业务、`dt-new-profile-action.ts`（179 行）的 profile 创建编排（含随机 `$id`、logger/process.exitCode 隐式依赖）、`doctor-action.ts:225` 的 wcag 对比度检查编排（私有函数 `runDesignTokenContrastCheck`）均为 CLI 私有。路线图 C2：build、inspect、wcag、create 四命令的业务编排下沉为可独立调用的 core 服务，CLI 只留参数解析与渲染。build 经核验已达薄层（90 行 over generateTheme），为核验项。

## Solution

**基线即合同范式**：三服务（inspect/create/wcag）以**纯机械提取**方式下沉（编排序列原样移动、无逻辑变更、无新机制），行为正确性不由纸面契约预冻结，而由**等价基线 v4（35 案捕获 = 34 重放 + 1 SETUP，× stdout/stderr/退出码/产物文件四项）+ 既有测试套件零断言变更**在交付闸门实证验收。等价 harness（`scripts/c2-equivalence.sh`）先于提取交付并自校验（pre-extraction 树重放必须逐字节复现基线，证明 oracle 自身可靠），随后提取完成再对照同基线。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = c2-strict block `01a1cf48-6f2e-756a-84e9-b1afce93e29d`（max，派遣前 /clear 逐步捕获校准）；CODER-PLUS = c2-coder-plus block `01a1cf48-6225-7c3c-b0e1-94d92418ff00`（high，同前）。规则同 Q0 SPEC。

## User Stories

1. 作为项目维护者，我希望资源查询、profile 创建与 wcag 对比度检查业务可被服务化调用，以便 CLI 成为纯入口。
2. 作为设计师，我希望 CLI 行为与输出合同逐项不变，以便下沉不带来任何体验漂移。

## Constraints

- **等价 oracle（唯一行为合同，Human 裁决「基线即合同」）**：基线 v4（`docs/island/plans/2026-11-12-c2-equivalence/`，manifest schemaVersion 4，**35 案捕获 = 34 案重放 + 1 SETUP**（argv/快照重放协议/fixture SHA256 算法定义入库——FULL-9 m-2/m-3））——交付闸门对每案执行 **stdout + stderr + 退出码 + 产物文件**四项对照（E1 裁决）；create 产物顶层 `$id` 规范化（sed -E 顶层锚定 32-hex 整行替换）后比对；`ids --write` 为 SETUP 用例（仅退出码——stdout 含随机 id）。基线目录与 manifest **施工期只读**。
- **既有测试套件 = 行为合同第二面**：全部既有 CLI 测试零断言变更、全绿（当前基线 1304 pass——冻结数字，冻结后只增不减）。
- 提取纪律：编排序列原样移动（含错误分支消息/退出码映射原样）、无逻辑变更、无新机制；渲染与进程依赖留 CLI（格式化函数、logger 输出、`process.exitCode` 赋值、optsWithGlobals 解析）。
- P1a 缓存机制与冻结政策零语义变更；C1 registry/lazy-action 架构零触碰。
- 写边界：`src/core/inspect/*`（新）、`src/core/pipeline/profile-create.ts`（新）、`src/core/doctor/wcag-service.ts`（新）、`src/cli/commands/{show-action,dt-new-profile-action,doctor-action}.ts`（编排段外移与调用替换）、`scripts/{c2-equivalence.sh,c2-build-gate.sh,c2-structure-gate.sh}`、`tests/c2-*.test.ts`（含 c2-services-smoke.test.ts）。禁动：其他 action 文件、`registry.ts`/`index.ts`/`lazy-action.ts`、`theme-service.ts`/`token-cache.ts` 语义、`source-output.ts`、输出格式。
- build 核验（期望值现时预写，FULL-6 M5 SPEC-as-oracle）：`src/cli/commands/build-action.ts` 现况 90 行、core 侧恰一条 import = theme-service；`scripts/c2-build-gate.sh` 输出观测值（CORE_IMPORTS/THEME_ONLY/LINES），主线闸门对本 SPEC 冻结数字（=1 / 仅 theme-service / ≤100）比对——脚本自身可写不作 oracle。

## Implementation Decisions

1. `src/core/inspect/`：show 查询/匹配业务原样提取；`src/core/pipeline/profile-create.ts`：create 编排原样提取（含默认输出路径推导 `<workspaceDir>/profiles/<归一化名>.yaml`、`randomBytes(16)` `$id`、planSourceOutput/writeSourceOutput 调用序列）；`src/core/doctor/wcag-service.ts`：对比度检查编排原样提取（返回现状 `DoctorRunResult` 形状 + 渲染所需 displayThemeName）。三服务签名收绝对路径参数（CLI 完成相对解析后传入），服务内部零 `process.cwd()`/console/logger/process 依赖。
2. CLI 瘦身：三 action 保留参数解析、渲染、退出码赋值；编排调用改为服务调用。wcag 错误渲染保持 console.log 手工 `✗ ` 前缀至 stdout（现状路径）；inspect/create 错误经 logger.error 走 stderr。
3. **委托证明门（FULL-8 F-4——行为等价是必要非充分，提取必须被证明）**：`scripts/c2-structure-gate.sh`（Task-2 交付）静态断言——**正向**：三 action 各自含指向对应服务的 import 与调用；**负向**：被移编排的私有函数定义从 action 消失（show-action 无 `findResource`/`loadResourceMatch`/`showResource` 定义；dt-new-profile-action 无 `writeSourceOutput`/`planSourceOutput` 调用；doctor-action wcag 段无 `loadDesignTokenSource` 编排调用）；**服务 API smoke**：`tests/c2-services-smoke.test.ts` 三服务各自独立 import + 最小调用返回结构化结果（User Story 1 可调用性验收）。
4. **等价 harness（Task-1 交付并自校验；协议 = manifest.replayProtocol，FULL-8 F-1/F-2 消解）**：`scripts/c2-equivalence.sh` 三模式。`replay` = **字面 argv 原样重放**（每案按 manifest 记录的 argv 原样执行，零路径替换）+ **规范路径预置表**（前置步骤把 fixture 放回收捕获时的精确 /tmp 路径，使 stdout 中烙印路径与捕获逐字节一致）：①清空并重建 `/tmp/c2-replay-v4`，cp `fixtures/std-with-ids` → 其下 `std/`（逐字节校验）；②`/tmp/c2-eq-create-b2/noid/main.yaml` ← `fixtures/std-no-ids/main.yaml`（驱动 create-missing-id exit 12）；③`/tmp/c2-nopairs.yaml` ← `fixtures/nopairs.yaml`（驱动 wcag-ancestor-fail exit 5）；④守卫 `/tmp/nonexistent` 不存在（驱动 create-missing-base exit 10）；有序执行（create-write 首跑 exit 0 → create-exists 二跑 exit 5 → 其余按序）；`ids --write` 为 SETUP 排除。`capture` = 对当前树以同一规范根产出同结构输出。`compare` = 逐案四项对照（manifest 记录每案 `files` 维度：dry-run 用例显式 `files: []`，重放后校验临时目录无额外文件——FULL-8 M-1 防 dry-run 偷写副作用漂移）。**自校验 = pre-extraction 树上 replay 与基线逐字节一致**（oracle 可靠性证明），随后提取完成再 compare。

## Testing Decisions

- 等价（唯一行为验收）：harness `compare` 模式 34 案重放四项 + SETUP 退出码全绿 = 通过；任一案差异 = 停机归因，不得调整断言或基线。
- harness 自校验：pre-extraction replay 与基线逐字节一致。
- 既有套件：`pnpm check:ci` 不退化（mise bun 1.3.6；check:ci 内部为裸 test 命令，`--timeout 15000` 适用于本计划直接调用的 bun test 行——FULL-8 M-2 口径区分）、零断言变更。
- 纯净度（FULL-8 M-4 精确化）：三服务**源文件**无 `process.`/`console.`/logger 直接引用（传递依赖的 core 模块允许——边界在服务级而非依赖级；独立性由服务 API smoke 证明）；build 行为回归由既有 token-build 测试套件承载（零断言变更）。
- **harness 实现要求（FULL-10 闸门验收清单——gate 实证验收，非纸面契约）**：①计数自洽（manifest cases 数与口径闭合，无孤儿基线文件）；②fixturesSha256 按声明算法可复算一致；③断言守卫三态覆盖（worktree diff + staged + FREEZE_SHA 全历史）+ 洁净树前置检查；④files 维度统一 schema（期望路径列表 + 规范化规则）+ 重放后逐案文件维度断言（dry-run 零副作用）；⑤replay→compare prereq 链 + 复制前 remove/type guard。闸门以实跑验证以上各项。

## Out of Scope

- 不冻结分支表/结果形状/消息枚举（**分支语义由基线四项 + 既有套件承载**——纸面枚举经三轮证明不可穷尽）。
- 不下沉四命令之外的 action；不改注册架构；不做 service bus；不引入新公共命令/参数。

## Draft Plan

- 结构总览：CLI（解析+渲染+退出码）→ 三 core 服务（原样提取）→ 既有 core 函数；等价 harness 先行自校验，提取后对照。
- 关键契约：基线 v4（唯一行为 oracle）+ 提取纪律（原样移动）+ harness 自校验程序。
- 文件结构：见 Constraints 写边界。
- 风险与未决：服务签名细节（参数形状）由提取过程自然形成（机械移动不设计新接口）；harness 对 SETUP 类用例的排序依赖已由 manifest 有序重放协议覆盖（fixture 内容 SHA256 已冻结于 manifest.fixturesSha256）。无阻塞未决。
- 里程碑草案：单一 Milestone（harness 自校验 + 三提取 + 对照验收）。

## Implement Plan

worktree `c2-token-service`（基线 v4 已入库）。顺序：Task-1 harness + 自校验 → Task-2 三服务提取 → 对照验收闸门 → pruner → 集成。SPEC 通过 fresh FULL-8 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

三服务机械提取与基线等价验收

- 验证主题：harness 自校验证明 oracle 可靠；三服务提取后 35 案四项对照全绿；既有套件零断言变更。
- 核验基线（固定命令，FULL-8 F-3 完整性绑闸门）：**①`sh scripts/c2-equivalence.sh replay` exit 0（自校验前置——不通过不得进入 compare）**；②`sh scripts/c2-equivalence.sh compare` exit 0（35 案四项）；③`pnpm check:ci` exit 0；④基线目录与 manifest 相对 Task-1 自校验时点零变更（fixturesSha256 已冻结于 manifest，算法见 manifest.fixturesSha256Algorithm——FULL-9 m-3 可复算口径，构建断言复验）；⑤既有测试断言零变更核验（FULL-9 F-3 修正为可执行三步）：Task-1 自校验通过时记录 `FREEZE_SHA=$(git rev-parse HEAD)` 入台账；闸门执行 `git diff --name-only $FREEZE_SHA HEAD -- tests/` 输出经 `grep -v '^tests/c2-'` 后必须为空（对比冻结点至 HEAD 全历史，含 staged/committed，无逃逸）；⑥`sh scripts/c2-build-gate.sh` exit 0（观测值 vs SPEC 冻结数字）；⑦`sh scripts/c2-structure-gate.sh` exit 0（委托证明门——FULL-9 F-4 入闸门，不执行不得通过）。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

等价 harness 与自校验（来源：User Story 2；Decisions 3）

- 验收标准：`c2-equivalence.sh` 三模式实现；**pre-extraction replay 与基线逐字节一致（自校验通过）**；`c2-build-gate.sh` 输出观测值且与 SPEC 冻结数字一致（pre-extraction 状态）。
- 可动文件范围：`scripts/{c2-equivalence.sh,c2-build-gate.sh}`。
- 依赖：无。
- 固有风险：重放对 fixtures 快照的复制保真（cp 后逐字节校验入脚本）。

- [ ] 三模式实现。
- [ ] 自校验 + build 观测值核验。

### Task-2

三服务机械提取与对照验收（来源：User Story 1；Decisions 1/2）

- 验收标准：三服务原样提取 + 三 action 瘦身；`compare` 35 案四项全绿；既有套件全绿零断言变更；纯净度检查通过；build gate 复跑通过。
- 可动文件范围：`src/core/{inspect/*,pipeline/profile-create.ts,doctor/wcag-service.ts}`、`src/cli/commands/{show-action,dt-new-profile-action,doctor-action}.ts`、`tests/c2-*.test.ts`（如有必要的最小服务调用测试）。
- 依赖：Task-1（harness 自校验通过为前置）。
- 固有风险：提取遗漏或行为漂移 = 对照差异停机归因（不得调断言/基线）。

- [ ] 三服务提取 + 瘦身。
- [ ] 对照验收 + 全量回归。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理复核 harness 自校验、35 案四项对照与既有套件零断言变更，通过后 pruner 收尾、按路线图集成 main。
