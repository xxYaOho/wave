---
date: 2026-11-11
state: 已批准（STRICT R1-DELTA PASS，2026-11-11）
dispatch: R1 FAIL 1F/4M → F1 DELTA 修正 PASS；MAJOR M1–M4 台账 carry forward，见 .tmp/q0/strict-major-ledger.md
---

# Wave Q0 质量基线与性能观测 Plan

## Problem Statement

`check:ci` 在干净检出不可重复通过，质量门失真：typecheck 存量 170 个错误（experiments 160、生产 `src/core/night/*` 10），biome 存量 27 errors / 6 warnings / 5 infos。根 tsconfig 未声明 DOM lib 却扫描 experiments 源码，生产、实验与生成物没有配置边界。同时性能优化缺乏可重复的测量基线，P1/P2/M1 无法验证"只保留真实收益"。

## Solution

两个独立里程碑恢复可信基线：M1 质量门恢复——用配置边界区分生产、实验与生成物，修复生产类型债务，清零 biome 诊断，使干净检出 `pnpm check:ci` 可重复通过；M2 性能观测基座——复用 `benchmarks/shared/*` 既有契约，建立开发入口与构建产物的冷启动、token、多 profile、Night、compress 和 manual 六域测量，输出机器可读结果。

## Further Notes

- 本计划是路线图七个实施计划的第一个，其质量门是后续全部计划的信任锚。
- 质量门修复不引入任何行为变更；`emit.ts` 的 `sortingKeys` 拼写修复按 Implementation Decision 3 以输出等价实测验证。
- worktree：`/Users/teatao/.worktree/cli_wave/q0-quality-baseline`，分支 `q0-quality-baseline`（基点 b245c71）。

## Rex 对话协议

三方通过 Rex 终端协作，主代理（Hyata）负责编排、仲裁与统一 gate；q0-strict 与 q0-coder-plus 为 Codex agent，工作目录均为本 worktree。

| 角色 | Rex block | Agent | 职责 |
| --- | --- | --- | --- |
| 主代理 / GATE | `block:01a1c840-368d-74ed-a73a-ff1e89c91557` | Claude (Hyata) | SPEC 起草、派遣、验收 gate、集成与路线图维护 |
| STRICT | `block:01a1c9cf-9715-7d75-b04e-e04add01506e` | Codex GPT-6.1-Sol (max) | SPEC 与各 Task 交付的独立审查 |
| CODER-PLUS | `block:01a1c9cf-9cff-73ad-9eb7-614077d6c5c2` | Codex GPT-6.1-Sol (high) | Milestone 内 Task 实施 |

- 会话：`session:01a1ac63-3359-7305-a46f-01905fa5fd4b`
- 派遣：`rex send -s <会话> -b <block> '<工单>'` 后接 `rex send-key -s <会话> -b <block> enter`；长工单写入本 worktree 文件（如 `.tmp/q0/dispatch-*.md`），正文只给路径与摘要
- 回读：`rex capture -s <会话> -b <block> --trim`；判断是否空闲可用 `rex block call ... process`
- Fresh agent：新任务或新审查生命周期开始时，先向目标 block 发送 `/clear`；同一生命周期的修正轮不重置，保持同一 reviewer
- 完成通知（所有派遣工单必带）：`完成后用 Rex CLI 通知 session:01a1ac63-3359-7305-a46f-01905fa5fd4b 的 block:01a1c840-368d-74ed-a73a-ff1e89c91557，含 Milestone STATUS/HEAD，再发送 enter；权限失败只记录一次`

## User Stories

1. 作为项目维护者，我希望在干净检出运行一条命令即可判定质量门成败，以便安全地持续重构。
2. 作为后续计划的执行者，我希望继承可信的类型与 style 基线，以便并行施工不携带隐性债务。
3. 作为项目维护者，我希望每个性能域都有可重复、机器可读的基线，以便 P1/P2/M1 只保留实测收益。

## Constraints

- 公共 CLI 命令、输入输出和写入安全合同不变。
- 配置边界只允许"重新分区检查"，不允许任何源文件脱离全部类型检查，也不允许以禁用检查掩盖债务。
- 生产 Night 类型修复限于类型收窄与建模，不改变色彩规则行为。
- 观测不引入持久缓存与跨进程协议；并发（如有）必须有 CPU/内存边界。
- 性能预算后续来自实测分布，本计划不预设阈值。
- 任一文件与后续计划边界冲突时暂停该 Task 并调整顺序，不扩大写入范围。

## Implementation Decisions

1. 配置边界三分：生产（根 project：`src`、`tests`、`scripts`、`benchmarks`）、实验（`experiments/*` 各自独立 project）、生成物（`experiments/*/out/` 等由 biome ignore 排除、不参与 tsc）。每个实验源文件被恰好一个 tsconfig project 覆盖。
2. 根 `tsconfig.json` 排除 `experiments/**`；`experiments/*/tsconfig.json` 扩展 include 覆盖其全部源码并声明所需 lib；`typecheck` 脚本串联根、app 与全部 experiments project。
3. `src/core/night/emit.ts:193` 的 `sortingKeys` 是 `js-yaml` DumpOptions 中不存在的拼写错误（该文件 import 的是 `js-yaml`，其 dumper 默认 `sortKeys: false`），属无声 no-op：当前输出本就是插入序。修复为显式 `sortKeys: false`，并以同版本 js-yaml 实测输出等价（no-opts 与修复后一致）；无行为变更，不重录 fixture。若实测发现键序差异，升级 Human 裁决。
4. `src/core/night/color-rules.ts` 的 9 处 `string | undefined` 错误通过收窄或建模 undefined 语义修复，不使用非空断言掩盖。
5. biome 存量优先 `biome check --write` 自动修复，剩余手工修复；生成物走 ignore 边界，不手工修格式。
6. 观测基座复用 `benchmarks/shared/*`（stats/env/report/artifacts/types），新增域 runner 遵循同一契约：固定 fixture、多次迭代样本分布、环境元数据、runId、JSON 落盘 `.results/`（遵循现有 git 策略），并与 `benchmarks/compare.ts` 对齐。
7. `check:ci` 保持单一入口，串联扩展后的全部质量门。

## Testing Decisions

- 干净检出（worktree 全新 `mise install && pnpm install`）运行 `pnpm check:ci` 可重复通过。
- 提供覆盖验证：experiments 每个源文件至少被一个通过 typecheck 的 project 覆盖，无文件漏检。
- `biome check .` 清零（errors/warnings/infos 均为 0，ignore 边界除外）。
- Night 修复运行真实 Orca 全 profile canary（`--profiles all`、mktemp 隔离输出、`sketch.skip` 负向断言）确认不退化。
- `emit.ts` 修复以同版本 js-yaml 实测输出等价（插入序不变），无行为变更、不重录 fixture，验证记录进交付说明。
- 观测脚本对每域输出含样本分布与环境元数据的机器可读 JSON；同一环境重跑可复现采样流程；`compare.ts` 可对齐两次运行。

## Out of Scope

- 不做命令懒加载、服务下沉、OutputPlan、并发与缓存优化（C1/C2/C3/P1/P2/M1 范围）。
- 不修改 DTCG 类型、Night 色彩规则语义、压缩算法或编码器实现。
- 不新增公共命令、alias 或测量持久化协议。
- 不为生成物做格式美化（生成物走 ignore 边界）。
- 不在 M2 设定性能预算阈值（预算由后续计划基于实测分布提出）。

## Draft Plan

- 结构总览：M1 先恢复质量门（配置边界 → 生产类型 → biome 清零），M2 再建观测基座（契约 → 六域测量）。质量门是观测可信的前提。
- 关键契约：`check:ci` 是唯一质量门入口；`biome check .` 与串联 typecheck 是它的组成部分；观测契约以 `benchmarks/shared/types.ts` 为类型真源。
- 文件结构（写边界）：
  - 配置：`tsconfig.json`、`tsconfig.app.json`、`experiments/*/tsconfig.json`、`biome.json`、`package.json`（仅 scripts 中 typecheck/check 段）。
  - 实验：`experiments/**` 的类型与 style 修复（含 vite.config、package.json 格式）。
  - 生产类型：`src/core/night/color-rules.ts`、`src/core/night/emit.ts`。
  - biome 机械修复：`src/core/night/derive-overlay.ts`、`src/cli/commands/dt-ids.ts`、`tests/night-params.test.ts`、`benchmarks/design-token/runner.ts` 及其余诊断文件。
  - 观测：`benchmarks/**`（新增域 runner 与统一入口）。
  - 测试：Night 修复相关 fixture 与回归；观测契约回归。
- 风险与未决：`emit.ts` 修复的输出等价需以同版本 js-yaml 实测确认；experiments 非 preview 文件的错误性质（DOM lib 缺失 vs 真实类型错误）需逐一枚举；biome ignore 边界需确认 `public/preview-tokens.json` 是否生成物。无阻塞拆分的未决项。
- 里程碑草案：M1 质量门恢复（Task-1/2/3）；M2 性能观测基座（Task-4/5）。

## Implement Plan

环境引导：worktree 尚未安装依赖，施工前执行 `mise install && pnpm install`。执行顺序：Task-1 先行（配置边界是其余 Task 的判定基础）；Task-2 与 Task-3 在 Task-1 后可并行；M1 闸门由主代理执行；通过后依次 Task-4 → Task-5；M2 闸门后主代理统一 gate，Pruner/Scout 收尾，按路线图集成 main。STRICT 审查 SPEC（R1）与各 Task 交付；主代理担任统一 gate（Human 指定）。每个 Task 交付后由 coder-plus 按 Rex 对话协议回报 STATUS/HEAD。

## Milestone-1

质量门恢复

- 验证主题：干净检出 `pnpm check:ci` 全绿；experiments 全源码被独立 project 覆盖且通过；biome 全仓清零；Orca canary 不退化。
- 核验基线：`pnpm typecheck && pnpm check:style && bun test && pnpm build`，随后完整 `pnpm check:ci` 与 Orca canary。
- 来源：User Stories 1–2；Implementation Decisions 1–5；Testing Decisions 1–5。

### Task-1

质量门配置边界（来源：User Story 1；Implementation Decisions 1–2）

- 验收标准：根 tsconfig 不再扫描 `experiments/**`；experiments 各 tsconfig 覆盖其全部源码并通过 typecheck；experiments 各 project 的有效编译选项集合不得低于根 project（至少含 strict、noUncheckedIndexedAccess、noImplicitOverride、noFallthroughCasesInSwitch，交付证据含选项对齐比对）；`typecheck` 脚本串联全部 project；生成物从 biome 检查中经 ignore 排除；typecheck 对「已知存量失败清单」之外全绿——清单且仅清单包含 Task-2 范围的生产 Night 错误（`src/core/night/color-rules.ts` 9 处、`src/core/night/emit.ts` 1 处），清单外任何失败即本 Task 未通过；`pnpm check:ci` 全绿推迟至 Task-2 完成后的 Milestone-1 闸门。
- 可动文件范围：`tsconfig.json`、`tsconfig.app.json`、`experiments/*/tsconfig.json`、`biome.json`、`package.json`（仅 typecheck/check scripts）、experiments 源码的类型修复。
- 依赖：无。
- 固有风险：排除根扫描后若 experiments project 未覆盖全部源文件，会产生检查盲区；experiments 非 preview 文件（derive/color-rules/palettes/emit-night）需逐一枚举修复，不得以放宽 strict 换通过。

- [ ] 枚举 experiments 全部源文件与所属 project 的覆盖关系，建立已知存量失败清单（生产 Night 10 处）。
- [ ] 调整 tsconfig 边界并修复 experiments 类型错误。
- [ ] biome ignore 生成物并串联 typecheck 脚本；运行 Task-1 验证。

### Task-2

生产 Night 类型修复（来源：User Story 2；Implementation Decisions 3–4）

- 验收标准：`src/core/night/color-rules.ts` 9 处类型错误收窄或建模修复，无非空断言掩盖；`emit.ts:193` 更名为显式 `sortKeys: false` 并以同版本 js-yaml 实测输出等价；清空已知存量失败清单，根 project typecheck 全绿；Orca canary 不退化；相关测试全绿。
- 可动文件范围：`src/core/night/color-rules.ts`、`src/core/night/emit.ts`、受影响 fixture/tests。
- 依赖：Task-1（配置边界与已知存量失败清单建立后；错误清单以 Task-1 交付为准）。
- 固有风险：输出等价验证必须使用与 lockfile 一致的 js-yaml 版本实测；若实测出现键序差异，停止并升级 Human 裁决。

- [ ] 修复 color-rules.ts 类型收窄并通过测试。
- [ ] `sortingKeys` 更名为显式 `sortKeys: false`，同版本实测输出等价并记录。
- [ ] 运行 Orca 全 profile canary 验证不退化。

### Task-3

biome 存量清零（来源：User Story 1；Implementation Decision 5）

- 验收标准：`biome check .` errors/warnings/infos 全部为 0；对后续计划边界文件（如 `src/cli/commands/dt-ids.ts`）仅做 lint/format 机械修复，不触碰行为。
- 可动文件范围：全部存量诊断文件（含 `src/core/night/derive-overlay.ts`、`src/cli/commands/dt-ids.ts`、`tests/night-params.test.ts`、`benchmarks/design-token/runner.ts`、experiments 源码）。
- 依赖：Task-1（ignore 边界先行，避免修生成物）。
- 固有风险：机械修复混入行为改动；organizeImports 改动需保持 `verbatimModuleSyntax` 合同。

- [ ] 运行 `biome check --write` 自动修复并复核 diff。
- [ ] 手工修复剩余诊断，保持行为不变。
- [ ] 全仓 `biome check .` 清零验证。

> [!IMPORTANT]
> Milestone-1 闸门：主代理整合三个 Task，在干净引导的 worktree 中重跑全部核验基线。任一未过则不得进入 M2。

## Milestone-2

性能观测基座

- 验证主题：六域测量输出机器可读、含分布与环境元数据的 JSON；同一环境重跑可复现；compare 可对齐。
- 核验基线：每域 runner 运行成功且结果 schema 稳定；历史 schemaVersion:1 `.results` 样本仍可读取、`bench:smoke` 既有入口不回归；`benchmarks/compare.ts` 对齐两次运行；完整 `pnpm check:ci` 不退化。
- 来源：User Story 3；Implementation Decisions 6–7；Testing Decisions 6。

### Task-4

观测契约统一（来源：User Story 3；Implementation Decision 6）

- 验收标准：统一 runId、JSON schema、样本分布统计、环境元数据与 `.results/` 落盘契约，类型真源在 `benchmarks/shared/types.ts`；`compare.ts` 基于该契约对齐任意两域结果；契约类型固定每域须声明的操作与参数、计时起止、成功/结束条件与比较条件字段；历史 schemaVersion:1 报告仍可读取。
- 可动文件范围：`benchmarks/shared/*`、`benchmarks/compare.ts`。
- 依赖：M1 闸门通过。
- 固有风险：不得破坏既有 design-token runner 与历史 `.results` 的兼容读取。

- [ ] 抽取并固化跨域观测契约类型与报告结构。
- [ ] compare.ts 按统一契约对齐多域结果。

### Task-5

六域测量实现（来源：User Story 3；Implementation Decisions 6–7）

- 验收标准：冷启动（开发入口与构建产物进程级）、token 单 profile、token 多 profile（`--profiles all` 规模）、Night、compress、manual 六域各有固定 fixture 的 runner，输出分布 + 环境元数据 JSON；提供统一入口一次跑全六域；结果可重复采样；每域 runner 按 Task-4 契约声明其操作、计时与比较条件（manual 等等待 SIGINT 的入口按就绪信号采样而非进程退出）。
- 可动文件范围：`benchmarks/**`（新增域 runner 与统一入口）、观测回归测试。
- 依赖：Task-4。
- 固有风险：测量必须进程级隔离，不得复用上一轮进程暖态；fixture 必须仓库内 hermetic，不得依赖外部网络或用户目录。

- [ ] 实现六域 runner 与统一入口。
- [ ] 建立观测契约回归测试。
- [ ] 双次重跑验证可复现并记录基线分布。

> [!IMPORTANT]
> Milestone-2 闸门：主代理核验六域输出 schema、分布与环境元数据完整性，重跑完整 `pnpm check:ci`。通过后进入统一 gate、清理与合并。
