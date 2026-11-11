---
date: 2026-11-11
state: 已批准（STRICT DELTA PASS，2026-11-11）
dispatch: R1 FAIL 1F/3M/1m → F-01 DELTA PASS；MAJOR M-01–M-03 处方已入 SPEC，台账 carry（交付证据关闭），见 .tmp/c1/strict-major-ledger.md
---

# Wave C1 CLI 控制面 Plan

## Problem Statement

命令元数据三源并存且互不同步：`commandRegistry`（`src/cli/registry.ts:19-55`，7 个顶级命令 + 二级树）、`help.ts` 硬编码帮助字符串（`help.ts:3-82` 的 TOP_LEVEL_HELP/TOKEN_HELP 等）、手册内容三级来源（`WAVE_MANUAL_DATA` define → `dist/manual-app/manual-data.json` → `FALLBACK_PAGES` 硬编码，`manual-markdown.ts:130-153`）。双语计划期间已出现过三源间的页面漂移。启动链路静态加载全部业务模块：`src/cli/index.ts:11` registerCommands 同步 import 全部 `commands/*`，进而静态引入 core/pipeline、core/doctor、core/compress 等 12 个业务模块——`-h/-m` 文档路径也付出全部业务模块的加载成本。测试基座缺失：约 20 个测试文件各自复制私有的 `runWave`/`runCommand` spawn helper（`Bun.spawn(['bun','run',src/index.ts,...])`），无共享导出（grep `export.*runWave` 零结果），`tests/utils/` 仅 3 个与 CLI 无关的文件。

## Solution

一份命令元数据真源：`commandRegistry` 扩展承载帮助文案与手册入口映射，`help.ts` 与 `manual-markdown` 路径解析消费同一元数据，消除硬编码平行源；业务模块懒加载——registry 只静态加载元数据，命令 action 内动态 import 业务模块，模块加载证据证明文档路径零业务加载；共享进程级 CLI 测试基座落在 `tests/utils/`，约 20 个测试文件迁移为共享 helper 消费。

## Rex 对话协议

主代理（Hyata，block `01a1c840-368d-74ed-a73a-ff1e89c91557`）编排与统一 gate；会话 `session:01a1ac63-3359-7305-a46f-01905fa5fd4b`。

| 角色 | Rex block | Agent | 职责 |
| --- | --- | --- | --- |
| STRICT | `block:01a1c9cb-1a10-7e09-96e8-cc6c636c376a` | Codex GPT-6.1-Sol (max) | SPEC 审查（通过后 strict 不进入施工期） |
| CODER-PLUS | `block:01a1c350-060d-7655-ac5c-c920cdd4858f` | Codex GPT-6.1-Sol (high) | Milestone 施工 |

- 派遣/回读/fresh/通知规则与 Q0 SPEC「Rex 对话协议」一致（字面命令 + 沙箱提权重试一次）；施工包 = `split.sh` 切片 + 角色合同副本薄壳，gate 在 Milestone 边界由主代理执行。

## User Stories

1. 作为项目维护者，我希望帮助文案、命令树和手册入口来自一份元数据，以便新增命令时不出现三源漂移。
2. 作为设计师，我希望 `-h/-m` 这类文档路径不加载业务模块，以便获得稳定的快速响应。
3. 作为执行命令的用户，我希望懒加载前后每个命令的行为完全一致，以便重构不可感知。
4. 作为后续计划的执行者，我希望有共享的进程级 CLI 测试基座，以便新命令测试不复制 spawn 样板。

## Constraints

- 公开命令行为不变：懒加载前后参数解析、执行结果、退出码、错误输出逐字节一致；`cli-command-shape.test.ts` 穷举断言不回归。
- CLI 文档输出固定英文、不受 `LANG` 影响（双语合同延续）；手册**内容管线**（双语索引、`build-manual`）不属本计划，本计划只收敛命令→手册路径的元数据来源。
- `-h/--help` 与 `-m/--manual` 的输出文本内容不变（只改来源结构，文案零变更）。
- 写边界：`src/cli/registry.ts`、`src/cli/help.ts`、`src/cli/manual-markdown.ts` 路径解析部分、`src/cli/index.ts`、`src/cli/commands/*` 的 action 包装层、`tests/utils/*` 与 CLI 测试。不触碰 `src/core/**` 业务实现。
- C2 将把业务编排从 action 下沉到 core 服务：本计划的懒加载包装是 C2 消费的接口，包装层保持薄。

## Implementation Decisions

1. 元数据真源：`commandRegistry` 每项扩展 `help`（文案或文案键）与 `manual`（手册 source/href 映射）字段；`help.ts` 字符串与 `manual-markdown` 的入口查找改为从元数据派生，删除平行的硬编码帮助常量；`FALLBACK_PAGES` 保留为最后回退数据（内容层，非路径层），其入口映射并入元数据。
2. 唯一实现点：元数据类型与组装在 `registry.ts`（含二级命令树）；`cli-command-shape.test.ts` 继续作为元数据穷举消费者，扩展断言每个命令的 help/manual 字段完整。
3. 懒加载：command action 统一为薄包装——`registry` 静态只含元数据模块，action 内 `await import('../commands/<x>.ts')` 后调用；`@clack/prompts` 既有动态 import 模式不变。
4. 模块加载证据：提供可证伪证据证明 `-h/-m` 路径不加载业务模块——运行时证据（测试进程内检查模块缓存中无业务模块条目）+ 静态证据（registry 静态 import 清单不含业务模块）。机制由施工实现，证据必须可重复。
5. 测试基座：`tests/utils/cli-runner.ts` 提供共享 spawn helper（进程启动、输出捕获、退出码断言、fixture 隔离、LANG 注入）；既有约 20 处私有 helper 迁移为消费共享实现，测试断言全部保持不变。
6. 启动性能不作验收目标（冷启动测量属 Q0 M2 域，M1 计划承接入口优化）；本计划交付的是加载结构事实。

## Testing Decisions

- 行为一致性：迁移前后全部既有 CLI 测试（约 20 文件）逐字节断言不回归，是本计划的主要安全网。
- 元数据完整性：`cli-command-shape` 扩展断言——每个注册命令（含二级）具备 help 与 manual 元数据，且文案与迁移前输出一致（快照对照）。
- 懒加载证据：文档路径（`-h`、`-m`、错误用法）进程内无业务模块加载条目；任一执行路径按需加载且仅加载所需命令模块；失败注入矩阵覆盖模块加载拒绝与加载成功后业务失败两类路径，各自固定 stdout / stderr / 退出码并断言异步错误归属。
- 基座迁移：迁移后测试文件不含本地 spawn helper 定义（grep 断言）。
- 质量门：`pnpm check:ci` 不退化。

## Out of Scope

- 不下沉业务编排（C2）；不修改任何 `src/core/**` 业务实现。
- 不改手册双语内容管线与网页（M1 范围）；不新增命令或参数。
- 不做冷启动性能优化与测量（Q0/M1 范围）。
- 不改 Commander 库选型与参数解析行为。

## Draft Plan

- 结构总览：`registry.ts` 成为元数据唯一组装点（静态、纯数据）；`help.ts`/`manual-markdown.ts`/`cli-command-shape` 三个消费者读同一来源；action 薄包装动态加载 `commands/*`；`tests/utils/cli-runner.ts` 为基座，测试文件改为消费。
- 关键契约（下游接口冻结，C2/M1 依赖）：`help` 字段为文案值（非键），类型自 `registry.ts` 导出；`manual` 映射为命令路径 → 手册 source/href 的节点形状，含子树继承规则显式定义；action 薄包装的 Commander 参数透传顺序、返回值与错误约定（异步拒绝归属）显式冻结；`CommandDefinition` 从「含真实 Commander Command」过渡到「静态纯数据 + 包装层」的边界在此合同定义；gate 核验导出类型与合同一致。
- 文件结构：`src/cli/registry.ts`（元数据扩展）、`src/cli/help.ts`（消费重构）、`src/cli/manual-markdown.ts`（路径解析消费）、`src/cli/options.ts`（`-m` 注入不变）、`src/cli/index.ts`（装配）、`src/cli/commands/*`（action 包装，业务函数体不动）、`tests/utils/cli-runner.ts`（新增基座）、既有 CLI 测试文件（helper 迁移）。
- 风险与未决：Commander action 签名在动态 import 下的参数透传需逐一核对（错误用法/选项缺省路径）；`help.ts` 文案与 commander description 的重复内容合并规则需在实现时逐字对照（零文案变更约束）；20 文件迁移是体量最大的机械工作，放独立里程碑。无阻塞拆分的未决项。
- 里程碑草案：M1 元数据统一（行为不变收敛）；M2 懒加载与加载证据；M3 测试基座迁移。

## Implement Plan

worktree `c1-cli-control-plane` 已建（基点 b245c71），SPEC 与施工均在分支交付，开工前 rebase 到 Q0 已集成的 main 并 `mise install && pnpm install`。顺序：M1（元数据统一）→ M2（懒加载）→ M3（基座迁移）；每 Milestone 独立闸门（主代理）。SPEC 通过 STRICT 审查后冻结；strict 不进施工期；一次派遣一个 Milestone 切片 + 合同副本薄壳；gate = 主代理全程。

## Milestone-1

命令元数据统一

- 验证主题：help 文案与手册入口全部从 `commandRegistry` 元数据派生，输出文本与迁移前逐字节一致；`cli-command-shape` 穷举扩展通过。
- 核验基线：`pnpm check:ci`；全部 `-h`/`-m` 输出与迁移前快照对照；`bun test tests/cli-command-shape.test.ts tests/cli-manual.test.ts`。
- 来源：User Story 1；Implementation Decisions 1–2；Testing Decisions 2。

### Task-1

元数据扩展与 help 收敛（来源：User Story 1；Implementation Decisions 1–2）

- 验收标准：`registry` 元数据含全部命令（含二级树）的 help 字段；`help.ts` 删除硬编码常量改为派生；`-h` 输出与迁移前逐字节一致；不同 `LANG` 下输出一致；**命令内平行帮助来源全部改接元数据**——`commands/compress.ts:46,373`、`workspace.ts:30,53`、`manual.ts:16,58-60`、`motion.ts:50` 的帮助输出（含 `manual -h` 在 action 内输出的路径）改接点逐一迁移，快照对照确认零文案变更。
- 可动文件范围：`src/cli/registry.ts`、`src/cli/help.ts`、`tests/cli-command-shape.test.ts`、`src/cli/commands/compress.ts` / `workspace.ts` / `manual.ts` / `motion.ts` 的**帮助文案消费层**（仅帮助输出改接，不改业务逻辑）。
- 依赖：Q0 已集成 main。
- 固有风险：硬编码字符串与 commander description 的合并必须零文案变更，逐字对照；转义/换行细节易漂移。

- [x] 元数据 help 字段全量补齐。（7d9b6a6；registry.ts +380 行元数据，help.ts -100 行硬编码）
- [x] help.ts 派生改造与快照对照测试。（9 条 -h 路径逐字节对照零差异）

### Task-2

手册入口元数据化（来源：User Story 1；Implementation Decision 1）

- 验收标准：`manual-markdown` 的入口查找消费元数据映射；`-m` 对每个命令路径输出与迁移前一致；三级回退链行为不变；`FALLBACK_PAGES` 仅作内容回退。
- 可动文件范围：`src/cli/manual-markdown.ts`、`src/cli/registry.ts`（manual 映射）、`tests/cli-manual.test.ts`。
- 依赖：Task-1。
- 固有风险：不能触碰双语内容管线与 fallback 英文正文（只动入口映射层）。

- [x] manual 入口映射入元数据并改造解析。（manual-markdown.ts 消费元数据映射，三级回退链保留）
- [x] `-m` 全命令路径输出对照验证。（4 条 -m 路径逐字节对照零差异）

> [!IMPORTANT]
> Milestone-1 闸门：主代理对照全部命令 `-h/-m` 输出快照，任一漂移不得进入 M2。
>
> 闸门结果（2026-11-12，通过）：交付 HEAD `7d9b6a6`（13 文件全在 Task-1/2 范围，含 M-02 处方要求的散落帮助生产者改接：manual/motion/night/token-migrate/token-new/workspace）。主代理直审：baseline（main）与交付构建的 9 条 `-h` + 4 条 `-m` 输出**逐字节零差异**；bun test --timeout 15000 全量 1188 pass / 0 fail（新增 cli-command-shape 扩展断言）；工作区冻结。台账 M-02 于本闸门 RESOLVED（改接点全部落地并有快照背书），M-03 待 M2 包装层交付核验，M-01 待 M2 交付核验。

## Milestone-2

业务模块懒加载

- 验证主题：文档路径零业务模块加载；执行路径按需加载且行为一致。
- 核验基线：模块加载证据测试与失败注入矩阵（含观测协议冻结与阳性对照）；全部既有 CLI 测试回归；`pnpm check:ci`。
- 来源：User Stories 2–3；Implementation Decisions 3–4；Testing Decision 3。

### Task-3

action 薄包装与动态加载（来源：User Stories 2–3；Implementation Decisions 3–4）

- 验收标准：`registry` 静态 import 不含任何业务模块；action 为动态 import 薄包装；全部命令懒加载前后行为一致（全量 CLI 测试回归）；文档路径与执行路径的模块加载证据测试通过；**动态 import 失败注入验收**——「模块加载拒绝」与「加载成功后业务失败」两类路径分别固定 stdout / stderr / 退出码，异步拒绝归属正确（归因到加载层或命令层，二者不混淆）；**加载证据观测协议冻结**——同一 CLI 进程内的可重复观测步骤、被观测业务模块集合的显式定义、阳性对照（业务执行 / 故意加载使探针可检出）；Bun 模块缓存观测接口可行性由施工验证，不可用时以替代机制达成同等可证伪性并记录。
- 可动文件范围：`src/cli/index.ts`、`src/cli/registry.ts`、`src/cli/commands/*`（action 包装）、模块加载证据测试。
- 依赖：M1 闸门。
- 固有风险：动态 import 的错误处理路径（模块加载失败 vs 命令失败）不得混淆退出码；`compress.ts` 等文件内二级命令装配需随包装层调整且保持注册语义。

- [ ] action 包装改造与装配调整。
- [ ] 模块加载证据测试与全量回归。
- [ ] 失败注入矩阵：加载拒绝 / 加载成功后业务失败两类路径的输出、退出码与错误归属固定测试。

> [!IMPORTANT]
> Milestone-2 闸门：主代理复核加载证据与行为一致性，通过后进入 M3。

## Milestone-3

进程级测试基座

- 验证主题：共享 `cli-runner` 落位，既有测试行为不变完成迁移。
- 核验基线：全量 `bun test`（1185+ pass / 0 fail 基线不退化）；迁移文件无本地 spawn helper 定义；`pnpm check:ci`。
- 来源：User Story 4；Implementation Decision 5；Testing Decisions 4–5。

### Task-4

共享基座与迁移（来源：User Story 4；Implementation Decision 5）

- 验收标准：`tests/utils/cli-runner.ts` 提供进程启动/输出捕获/退出码/fixture 隔离/LANG 注入能力；约 20 个测试文件的私有 helper 全部迁移为共享消费，断言逐条不变；`tests/utils/` 内新增基座单测。
- 可动文件范围：`tests/utils/cli-runner.ts`（新增）、`tests/utils/cli-runner.test.ts`（新增基座单测）、既有 CLI 测试文件的 helper 迁移。
- 依赖：M2 闸门。
- 固有风险：个别 helper 的私有变体（如 `runWavePty`）语义需保留；迁移是纯机械重构，任何断言修改都属越界。

- [ ] cli-runner 基座实现与单测。
- [ ] 全量测试文件迁移与 grep 断言收尾。

> [!IMPORTANT]
> Milestone-3 闸门：主代理核对迁移零断言变更，通过后 pruner 收尾，按路线图集成 main（C2/M1 的前置）。
