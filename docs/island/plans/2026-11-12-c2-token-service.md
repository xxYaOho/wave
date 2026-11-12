---
date: 2026-11-12
state: 待 STRICT FULL（C2 首轮）
dispatch: 路线图计划 C2（依赖 C1+P1：C1 已交付集成、P1a 已交付集成；P1b 与本计划文件交叠为零——P1b 写边界仅 benchmarks/**）；Human 裁决 2026-11-12 开启
---

# Wave C2 Token 应用服务 Plan

## Problem Statement

token 业务的编排逻辑仍散落在 CLI action 层，无法脱离 CLI 调用：`show-action.ts`（361 行）将资源查询/匹配业务（`findResource`、`loadResourceMatch`、`showResource`、`flattenResource`、内置名解析）以私有函数形式锁死在 CLI 层，展示格式化与业务匹配混杂；`dt-new-profile-action.ts`（179 行）直接编排 `loadDesignTokenWorkspace` + `profile-resolver` + `source-output` 完成 profile 创建业务，CLI 是唯一入口。下沉目标（路线图 C2）：build、inspect、wcag、create 业务编排为可独立调用的 core 服务，CLI 只保留参数解析与渲染。

## Solution

按路线图四命令收敛：**inspect**（show）与 **create**（dt-new-profile）两处真实下沉——查询/匹配业务提取为 `src/core/inspect/` 只读查询服务（返回结构化结果，格式化渲染留在 CLI），profile 创建编排提取为 `src/core/pipeline/profile-create.ts` 服务（编排既有 core 函数，无新机制）；**build 与 wcag 经现状核验已达目标形态**（build-action 90 行薄层 over generateTheme；dt-action 74 行薄层，wcag 计算在 core/night contrast-evaluator）——列入核验项而非改造项。验收 = 既有 CLI 行为字节级不变 + 服务可独立调用 + 双层测试（进程级 CLI + 直接服务）。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。STRICT = c2-strict block `01a1cf48-6f2e-756a-84e9-b1afce93e29d`（max，派遣前 /clear 校准）；CODER-PLUS = c2-coder-plus block `01a1cf48-6225-7c3c-b0e1-94d92418ff00`（high，派遣前 /clear 校准）。规则同 Q0 SPEC。

## User Stories

1. 作为项目维护者，我希望资源查询与 profile 创建业务可被服务化调用（测试、脚本、未来 GUI），以便 CLI 成为纯入口。
2. 作为设计师，我希望 CLI 行为与输出逐字节不变，以便下沉不带来任何体验漂移。

## Constraints

- 公共 CLI 命令、输入输出合同不变：所有既有 CLI 测试断言逐条不变（C1 共享基座迁移纪律同款——纯机械下沉，任何既有测试断言修改都属越界）。
- 输出字节级等价：`wave token show`（含各参数组合）与 `token dt new-profile`（create 流程产物）在等价 fixture 上与基线输出逐字节一致。
- 不改 P1a 交付的缓存机制与冻结政策；`theme-service.ts` 等冻结文件除 import 重组外零语义变更。
- 写边界：`src/core/inspect/*`（新）、`src/core/pipeline/profile-create.ts`（新）、`src/cli/commands/show-action.ts`、`dt-new-profile-action.ts`（瘦身为解析+渲染）、`tests/c2-*.test.ts`。禁动：`src/core/pipeline/{theme-service,theme-pipeline,token-cache}.ts` 语义、C1 交付的 registry/lazy-action 架构、其他 action 文件（show/dt-new-profile 之外）。
- 渲染（格式化函数 `formatValueForDisplay`/`formatColorComponentForDisplay`/`stringifyCompact` 等）留在 CLI 层——下沉的是查询与编排，不是展示格式。

## Implementation Decisions

1. `src/core/inspect/`（新目录，只读查询服务）：`resolveResourceQuery(input: { workspacePath, query, options }) → InspectResult`（结构化：命中资源、token 路径、原始值、类别、来源角色）；提取自 `show-action.ts` 的 `findResource`/`loadResourceMatch`/`showResource` 业务部分与 `getBuiltinNames` 内置名解析；缓存穿线沿用 P1a 可选尾参合同（服务签名带 `cache?: TokenCache`，CLI 调用点缺省自建）。
2. `src/core/pipeline/profile-create.ts`（新，create 编排服务）：`createProfile(input) → CreateProfileResult`；编排序列原样提取自 `dt-new-profile-action.ts`（workspace 加载 → profile-resolver 派生 → source-output 写出），无逻辑变更、无新机制；错误路径（时机、消息、退出码映射）原样保留在服务内，CLI 只映射渲染。
3. CLI 瘦身：`show-action.ts` 保留参数解析、格式化渲染、spinner/输出；`dt-new-profile-action.ts` 保留参数解析与结果渲染；两者的编排调用改为服务调用。
4. build 与 wcag 现状核验（不改代码）：build-action 仅参数组装 + generateTheme + receipt 渲染（90 行，已达标）；dt-action/wcag 链路核验计算在 core。核验结果（薄层证据）写入闸门记录。
5. 双层测试：`tests/c2-inspect-service.test.ts` + `tests/c2-profile-create-service.test.ts`（直接服务测试，含错误路径与缓存穿线）；既有 CLI 测试全量保留（进程级行为回归）。

## Testing Decisions

- 字节等价：`wave token show` 在等价 fixture（standard、orca 抽样、自定义资源目录）上输出与下沉前基线一致；create 流程产物文件级一致。
- 服务测试：`resolveResourceQuery` 命中/未命中/多义/自定义资源/内置名解析分支；`createProfile` 成功路径与既有错误路径逐条。
- 缓存穿线：服务带 cache 调用时复用实例（P1a 语义），缺省自建临时实例。
- 进程级：既有 CLI 测试套件全绿零断言变更；`pnpm check:ci` 不退化（mise bun 1.3.6，`--timeout 15000`）。

## Out of Scope

- 不下沉 workspace-action、motion-action、doctor、compress、manual、dt-init、dt-migrate、dt-ids、token-migrate、token-new、tool-module、install、night（不在路线图四命令点名范围或已达标）。
- 不改输出格式、命令注册架构（C1 已冻结）、帮助体系。
- 不引入新公共 API 命令或参数。
- 不做 services 目录抽象层设计——服务按领域落位（inspect/ 查询、pipeline/ 编排），不建统一 service bus。

## Draft Plan

- 结构总览：CLI（解析+渲染）→ core/inspect（查询）/ core/pipeline/profile-create（编排）→ 既有 core 函数；数据流不新增层，仅把既有编排函数从 CLI 文件移至 core 模块。
- 关键契约：`InspectResult` 结构化形状（无格式化字符串）；`CreateProfileResult`（产物路径 + 状态 + 错误结构）；两服务签名的 `cache?` 尾参合同。
- 文件结构：见 Constraints。
- 风险与未决：`showResource` 内格式化与匹配的边界切分需逐行核对（渲染误入服务 = 契约破坏，闸门查）；create 编排的隐式 CLI 依赖（如 process.exit/console）须在服务内消除并保持退出码映射。无阻塞未决。
- 里程碑草案：单一 Milestone（下沉 + 双层验证）。

## Implement Plan

worktree `c2-token-service`（已 FF 到 main @ f83196c）。顺序：Task-1 下沉实现 → Task-2 等价与双层验证 → 闸门（含 build/wcag 现状核验记录）→ pruner → 集成。SPEC 通过 fresh FULL 后冻结；strict 不进施工期；gate = 主代理；单 Milestone 单派遣薄壳。

## Milestone-1

业务下沉与双层等价验证

- 验证主题：inspect/create 业务可独立服务化调用；CLI 行为与输出字节级不变；缓存穿线语义保持。
- 核验基线（固定命令）：`pnpm check:ci` exit 0；`bun test tests/c2-inspect-service.test.ts tests/c2-profile-create-service.test.ts`（mise bun 1.3.6，`--timeout 15000`）；既有 CLI 测试套件全绿（1300+ pass / 0 fail，零断言变更）；`wave token show` 等价 fixture 字节对照。
- 来源：User Stories 1–2；Implementation Decisions 全部；Testing Decisions 全部。

### Task-1

inspect 服务提取与 CLI 瘦身（来源：User Story 1；Decisions 1/3）

- 验收标准：`src/core/inspect/` 就位（查询返回结构化结果）；show-action 瘦身为解析+渲染+服务调用；格式化函数留在 CLI；缓存尾参合同实现；下游 import 零悬空。
- 可动文件范围：`src/core/inspect/*`、`src/cli/commands/show-action.ts`、`tests/c2-inspect-service.test.ts`。
- 依赖：无（C1/P1a 已集成）。
- 固有风险：业务与渲染切分线需逐行判定（闸门重点）。

- [ ] 查询业务提取 + 结构化结果契约。
- [ ] show-action 瘦身 + 服务测试。

### Task-2

create 服务提取与全量等价验证（来源：User Story 2；Decisions 2/4/5；Testing Decisions 全部）

- 验收标准：`profile-create.ts` 编排服务就位（错误路径原样）；dt-new-profile-action 瘦身；服务测试含错误路径与缓存穿线；show/create 字节等价通过；既有套件全绿零断言变更；build/wcag 现状核验记录完成。
- 可动文件范围：`src/core/pipeline/profile-create.ts`、`src/cli/commands/dt-new-profile-action.ts`、`tests/c2-profile-create-service.test.ts`。
- 依赖：Task-1。
- 固有风险：等价差异必须停机归因，不得调整断言；create 隐式 CLI 依赖消除须保退出码映射一致。

- [ ] profile-create 服务提取 + 服务测试。
- [ ] 字节等价对照 + 全量回归 + build/wcag 核验记录。

> [!IMPORTANT]
> Milestone-1 闸门（唯一闸门）：主代理复核字节等价证据与双层测试，核验 build/wcag 现状记录，通过后 pruner 收尾、按路线图集成 main。
