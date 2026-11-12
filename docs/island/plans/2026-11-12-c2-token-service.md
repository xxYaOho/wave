---
date: 2026-11-12
state: 待 fresh FULL-2（v2 修订）
dispatch: 路线图计划 C2（依赖 C1+P1a 均已交付）；FULL-1 FAIL（6F/7M/0m）→ v2：wcag 回归下沉范围（真身在 doctor-action.ts:225 私有函数——初版勘测漏委托链）、三类结果契约全形状化、randomBytes 随机 ID 等价规范化、只读策略诚实化、命令名与只读策略修正、边界与路线图 C2 对齐
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
- 输出等价方法（冻结）：`wave token show` 全参数组合输出**逐字节一致**；create 流程产物在 `$id` 字段**规范化**（比较时统一替换为占位符——`randomBytes` 随机性唯一来源）后逐字节一致；wcag 输出（stdout 全文 + 退出码）逐字节一致。基线 = 开工 HEAD 预捕获（主代理持有，不可变），比较 = diff 对脚本。
- P1a 缓存机制与冻结政策零语义变更；C1 registry/lazy-action 架构零触碰。
- 写边界：`src/core/inspect/*`（新）、`src/core/pipeline/profile-create.ts`（新）、`src/core/doctor/wcag-service.ts`（新，或同目录命名）、`src/cli/commands/show-action.ts`、`dt-new-profile-action.ts`、`doctor-action.ts`（仅 wcag 编排段外移与调用替换）、`tests/c2-*.test.ts`、比较脚本（`tests/c2-equivalence.sh` 或等价）。禁动：其他 action 文件、`registry.ts`/`index.ts`/`lazy-action.ts`、`theme-service.ts`/`token-cache.ts` 语义、输出格式。
- 渲染与进程依赖留 CLI：格式化函数组（`formatValueForDisplay` 等）、logger 输出、`process.exitCode` 赋值、optsWithGlobals 解析；服务内零 console/logger/process 依赖。
- 只读策略（诚实化，FULL-1 F-6）：inspect 服务**原样保留**现有 `loadResource` 调用语义（readOnly 透传现状 = false——资源缓存缺失时的 restore 行为是既有 CLI 行为的一部分，属等价保护范围，不由本计划改变）；「只读」指服务不修改 workspace/output 产物状态。

## Implementation Decisions

1. **inspect 服务**（`src/core/inspect/query.ts`）：`resolveResourceQuery(input: { workspacePath: string, category?: string, name?: string, format: string, cache?: TokenCache }) → InspectQueryResult`。结果 union（按 show-action 实际分支，FULL-1 F-2）：
   - `{ ok: true, payload: { mode: 'catalog', palettes: string[], dimensions: string[] } }`（无参分支，内置名枚举）
   - `{ ok: true, payload: { mode: 'category', category: 'palette' | 'dimension', names: string[] } }`（单参分支）
   - `{ ok: true, payload: { mode: 'resource', category, name, format, matches: Array<{ source: 'builtin' | 'cache' | 'user', path: string, parsed?: unknown, rawFileContent?: string }> } }`（双参命中；format='yaml' 时服务返回 `rawFileContent`（原始文件字节，M-1 合同），其余 format 返回 `parsed` 结构由 CLI 格式化渲染）
   - `{ ok: false, exitCode: ExitCode, message: string }`（未知类别/未命中/加载失败——消息原文、退出码原映射）
   workspacePath 由 CLI 解析后传入（CLI 保留 -f 解析逻辑，M-6）；`cache` 尾参合同沿用 P1a（缺省自建，传入复用——M-3）。
2. **create 服务**（`src/core/pipeline/profile-create.ts`）：`createProfile(input: { entry: string, cwd: string, options: <现状 opts 全字段显式形状：force/dry-run/overwrite/id/snapshotOverrides 等>, randomSource?: () => string }) → CreateProfileResult = { ok: true, outputPath: string, id: string } | { ok: false, exitCode: ExitCode, message: string }`（FULL-1 F-3）。编排序列**全分支原样提取**（FULL-1 M-2）：workspace 加载/expandMainYamlEntry、profile-resolver 派生、snapshotOverrides、冲突/realpath/force/dry-run 分支、`$id` 生成（默认 `randomBytes(16).toString('hex')`，`randomSource` 注入仅服务层可替换——生产行为不变）、产物写出、receipt 数据组装。错误路径逐条（消息原文 + 退出码映射表）。
3. **wcag 服务**（`src/core/doctor/wcag-service.ts`）：`runContrastCheck(input: { entry: string, night: boolean, cache?: TokenCache }) → WcagResult`（结构化检查结果 + `{ ok: false, exitCode, message }` 错误分支）；提取自 `doctor-action.ts:225` `runDesignTokenContrastCheck` 全链（loadDesignTokenSource → 依赖字典 → Night 合并 → 对比度检查）；doctor-action 保留参数解析与渲染，wcag 调用改为服务调用（FULL-1 F-1 修正：wcag 真身在 doctor-action，非 dt-action）。
4. **CLI 瘦身**：三个 action 保留参数解析、格式化渲染、logger/exitCode 映射；编排调用改为服务调用。
5. **build 核验项（可证伪化，FULL-1 M-5）**：固定证据命令 `grep -n "import" src/cli/commands/build-action.ts`（断言：core 侧仅 `generateTheme` 与类型导入，无 pipeline 内部函数）；行数阈值 `wc -l` ≤ 100；结果记闸门记录。
6. **双层测试**（FULL-1 M-4 绑定）：服务测试按现有 show 分支逐条绑定（无参/单参/双参三 format/命中/未命中/未知类别/自定义资源/builtin-cache-user 三来源）；create 测试绑定全部既有错误分支（含 dry-run/冲突/force/snapshotOverrides）；wcag 测试绑定 pass/fail/night 合并/加载失败分支；缓存穿线测试（传 cache 二次查询 hits > 0）。

## Testing Decisions

- 等价：`wave token show`（无参/单参×2 类别/双参×3 format×2 类别×命中与未命中）全矩阵 vs 开工基线逐字节；create 产物规范化等价（`$id` 占位符化后 diff；含成功与 dry-run 路径）；wcag stdout 全文 + 退出码一致（普通 + --night）。基线由主代理在开工 HEAD 捕获（证据目录 `docs/island/plans/2026-11-12-c2-equivalence/`，manifest v2 同款）。
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

worktree `c2-token-service`（已 FF 到 main @ f83196c；开工基线由主代理预捕获）。顺序：Task-1 inspect → Task-2 create + wcag → 闸门（等价复核 + build 核验）→ pruner → 集成。SPEC 通过 fresh FULL-2 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

业务下沉与合同等价验证

- 验证主题：inspect/create/wcag 业务可独立服务化调用；CLI 输出合同逐项不变（含 `$id` 规范化等价）；缓存穿线语义保持。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/c2-inspect-service.test.ts tests/c2-profile-create-service.test.ts tests/c2-wcag-service.test.ts`（mise bun 1.3.6，`--timeout 15000`）；既有 CLI 测试套件全绿零断言变更；等价矩阵对照（基线 `docs/island/plans/2026-11-12-c2-equivalence/`）。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

inspect 服务提取与 CLI 瘦身（来源：User Story 1；Decisions 1/4）

- 验收标准：`src/core/inspect/query.ts` 就位（union 三模式 + 错误分支，消息原文）；show-action 瘦身；yaml 格式 `rawFileContent` 原始字节合同；缓存尾参 + 静态零进程依赖断言；服务测试绑定清单全绿。
- 可动文件范围：`src/core/inspect/*`、`src/cli/commands/show-action.ts`、`tests/c2-inspect-service.test.ts`。
- 依赖：无。
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
