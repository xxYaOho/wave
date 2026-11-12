---
date: 2026-11-10
state: 草案
dispatch: ~
---

# Wave 质量与极致性能路线图 Plan

## Problem Statement

当前 CLI 重构解决公开命令和输入输出合同，但仓库仍存在质量门失真、静态加载、重复计算、业务编排散落和输出策略不一致等债务。这些工作具有不同依赖与风险，若压缩成三个大型施工计划，仍会阻碍并行推进和独立验收。

## Solution

采用「一份路线图、七个独立实施计划」的组合。路线图维护依赖、worktree、进度和集成顺序；每个实施计划只解决一类可独立验证的问题，并分别经过 STRICT、施工、GATE、清理和合并。三个 Cycle 仅保留为宏观阶段，不再充当施工计划边界。

## Further Notes

- 当前 CLI 接口计划不计入七个后续计划，必须先完成。
- 每个实施计划使用独立分支与 worktree；同一 worktree 同一时间只有一个执行者。
- 主代理维护路线图状态、依赖和集成顺序，不把未提交改动跨 worktree 共享。
- 只有当前计划通过 gate 且其依赖已集成，后续计划才可进入施工。
- 计划数量按独立合同与风险划分，不按文件数量或预估工时划分。
- 计划评审形态（2026-11-11 Human 裁决）：每计划 SPEC 通过 STRICT 审查后冻结进入施工（FAIL 走修正轮直至 PASS，轮次由飞轮决定）；施工编排与 gate 生命周期遵循 workflow/coding.md——Milestone 为施工包与 gate 单元，coder-plus 一次派遣消费一个 Milestone 并自验证其内部 Task，Orchestrator 兼任该计划的 gate reviewer 且全程复用，在 Milestone 边界核验（开工 HEAD → 交付 HEAD、提交审计、全量核验基线、MAJOR 台账关闭）；strict 不进入施工期。

## User Stories

1. 作为项目维护者，我希望完整质量门能够直接判断成败，以便安全地持续重构。
2. 作为设计师，我希望命令只执行当前任务所需的工作，以便获得稳定快速的本地体验。
3. 作为项目维护者，我希望不同债务可以独立施工和验证，以便使用多个 worktree 而不混淆改动归属。
4. 作为项目维护者，我希望性能优化具有等价输出和可重复测量，以便只保留真实收益。
5. 作为项目维护者，我希望路线图持续记录计划状态和依赖，以便按明确顺序集成到 main。

## Constraints

- 公共 CLI 命令、输入输出和写入安全合同不因后续重构或性能优化改变。
- 所有 token 性能优化必须通过 Quality Harness 等价检查和真实 consumer 验证。
- 不引入默认跨进程缓存；优先消除单次进程内重复工作。
- 并发必须有 CPU/内存边界，不能以资源峰值换取单一样本的表面速度。
- 性能预算来自实测分布和回归容忍度，不预先编造绝对耗时。
- 生产、实验和生成物通过配置边界区分，不通过禁用必要检查掩盖问题。
- 任一计划出现共享文件冲突时暂停该分支并调整集成顺序，不扩大写入范围。
- 合并到 main 前必须完成当前计划的独立审查、完整验证和用户要求的合并流程。

## Implementation Decisions

1. `Q0 质量基线与性能观测`：恢复完整质量门；区分生产、实验和生成物；建立开发入口与构建产物的冷启动、token、多 profile、Night、compress 和 manual 测量。
2. `C1 CLI 控制面`：使命令注册、帮助、Markdown 手册路径和命令覆盖测试共享一份元数据；实现业务模块懒加载；建立共享进程级 CLI 测试基座。
3. `C2 Token 应用服务`：将 build、inspect、wcag、create 等业务编排从 CLI 下沉到可独立调用的 core 服务；CLI 只保留参数解析和渲染。
4. `C3 OutputPlan 输出合同`：统一目标类型、默认/自定义来源、存在状态、写入集合、dry-run/force 和消费提示；目录与单文件保留各自写入实现。
5. `P1 Token 性能`：消除单进程内重复的 base 解析、依赖字典和只读资源工作；缓存上下文包含影响结果的配置与路径，避免 profile 污染。
6. `P2 Compress 性能`：实现有界并发、扫描与工具发现复用；验证部分失败、取消、输出冲突和资源峰值。Motion 不为单一编码任务引入无收益并发。
7. `M1 Manual 性能`：静态内容、构建时搜索索引和路由按需加载；`-m` 直接读取打包文本，不启动网页运行时。
8. 三个宏观阶段仅为：质量与观测（Q0）；模块边界（C1、C2、C3）；测量驱动的优化（P1、P2、M1）。允许跨阶段并行必须满足本文依赖，而不受阶段名称限制。
9. 旧命名和残留由当前计划及各实施计划的 Pruner/Scout 收尾处理，不另建泛化清理计划。
10. 手册视觉重设计属于当前 CLI 计划的追加范围；M1 只承接其性能和静态内容架构。

## Testing Decisions

- Q0 要求完整质量门在干净检出中可重复通过，性能脚本输出机器可读结果、样本分布和环境元数据。
- C1 验证所有公开命令在懒加载前后行为一致，并用模块加载证据证明文档路径不加载业务模块。
- C2 同时保留进程级 CLI 测试与直接服务测试，确保业务下沉不改变公共行为。
- C3 对所有产物验证默认路径、自定义路径、既有目标、dry-run、force 和失败零写入。
- P1 先证明输出等价，再比较性能分布，并运行真实 Orca 全 profile canary。
- P2 覆盖工具失败、部分文件失败、重复输出、取消与资源上限，不只测成功耗时。
- M1 在开发服务与构建产物中分别验证内容一致、按需加载和无服务端依赖的 `-m`。
- 每个计划只有在相对基线有明确收益且质量门不退化时才保留性能机制；无收益的复杂机制撤回。

## Out of Scope

- 不实施 monorepo、Turborepo、WorkspaceIO 或大规模目录迁移。
- 不修改 DTCG 类型、Night 色彩规则、压缩算法或编码器实现。
- 不引入新的公共 alias、命令选择参数或持久缓存协议。
- 不在没有测量收益时增加 worker 线程、复杂调度或原生模块。
- 本路线图不包含七个计划的实施任务；每个计划在开工前单独撰写并升入实施 SPEC。

## Draft Plan

- 结构总览：路线图是组合与进度真源，七份实施计划是施工真源。Q0 提供可信质量门和性能基线；C1 收敛命令控制面；P1/P2 优化独立业务模块；C2 在控制面和 token 性能稳定后下沉服务；M1 优化手册运行时；C3 最后统一输出计划，避免与服务下沉并行修改同一创建链路。
- 关键契约：计划之间只通过已提交、已 gate 的公共接口集成；性能测量包含等价结果；worktree 不共享未提交状态；任一计划的偏差必须回流路线图。
- 文件结构：
  - `Q0`：`tsconfig*.json`、Biome 配置、`experiments/*`、生产 Night 类型和 `benchmarks/*`。
  - `C1`：`src/cli/registry.ts`、帮助与手册入口、`src/cli/index.ts`、`tests/utils/*` 和 CLI 测试。
  - `C2`：`src/cli/commands/*`、`src/core/pipeline/*`、`src/core/doctor/*`、`src/core/night/*`。
  - `C3`：`src/core/pipeline/source-output.ts`、各业务输出模块及对应测试。
  - `P1`：`src/core/pipeline/*`、resolver/resource 只读路径和 design-token benchmarks。
  - `P2`：`src/core/compress/*`、`src/core/tools/*` 及压缩测试和测量。
  - `M1`：`manual/*`、`scripts/build-manual.ts`、`src/manual-app/*` 和 Markdown 打包链路。
- 风险与未决：Q0 的具体修复范围需实测；P1/P2 的性能收益尚无数据；C2 与 P1 的集成顺序用于避免 pipeline 双写；M1 不包含尚未取得参考证据的视觉设计判断。没有影响计划拆分的未决项。
- 里程碑草案：每个计划在实施 SPEC 内自行划分；路线图不预支其 Task。Q0 至少包含质量门和观测两个独立里程碑，其余计划按公共合同、行为保持和性能证据分别设置闸门。

## Portfolio Dependency

```text
当前 CLI 接口计划
    ↓
Q0 质量基线与性能观测
    ├── C1 CLI 控制面 ──┐
    ├── P1 Token 性能 ──┤
    └── P2 Compress 性能（独立交付）
                       ↓
                  C2 Token 应用服务 ──→ C3 OutputPlan
                       │
C1 + 当前手册施工 ────→ M1 Manual 性能（可与 C2 并行）
```

P2 不依赖 C1/C2，可在 Q0 后独立交付。C2 同时依赖 C1 与 P1，避免一边下沉服务一边改变 token 性能实现。C3 依赖 C2。M1 依赖当前手册施工和 C1，可与 C2 并行。

## Worktree 与集成策略

| 波次 | 可并行计划 | 独立 worktree 写边界 | 集成条件 |
| --- | --- | --- | --- |
| 当前 | 当前 CLI 接口计划 | 当前命令、核心输入输出和手册 | 完整交付后进入 Q0 |
| 1 | Q0 | 质量配置、生产类型修复、测量基座 | 干净检出完整通过并集成 |
| 2 | C1、P1、P2 | CLI 控制面；token pipeline；compress/tools | 各计划独立 gate，按无冲突顺序集成 |
| 3 | C2、M1 | token 应用服务；manual 运行时 | C1/P1 已集成；当前手册与 C1 已集成 |
| 4 | C3 | 输出计划与写入语义 | C2 已集成并验证 |

C1、P1、P2 若出现共享文件，以实际依赖为准暂停冲突分支。合并到 main 时逐计划重跑完整质量门和必要的 consumer 验证，不以 worktree 内测试代替集成验证。

## Portfolio Status

状态由主代理在每次分派、gate、阻塞和集成后更新。计划路径在对应草案创建后补充，HEAD 以实际交付为准。

| ID | 计划 | 依赖 | 状态 | Worktree / HEAD | 备注 |
| --- | --- | --- | --- | --- | --- |
| Q0 | 质量基线与性能观测 | 当前 CLI 计划 | 已交付（2026-11-12 集成 main，台账全清） | main @ 0d7d36c | SPEC: docs/island/plans/2026-11-11-q0-quality-baseline.md |
| C1 | CLI 控制面 | 当前 CLI 计划、Q0 | 已交付（2026-11-12 集成 main，台账全清；元数据统一 + 懒加载 + 共享测试基座） | main @ 57fd14f | SPEC: docs/island/plans/2026-11-11-c1-cli-control-plane.md |
| P1 | Token 性能 | Q0 | 拆分为 P1a/P1b（Human 裁决 2026-11-12）；**P1a（缓存 memo）已交付（2026-11-12 集成 main，闸门 PASS，台账全清：进程内四层 memo + 三入口穿线，三场景与基线 v2 逐字节一致）**；P1b（统计与测量）待撰写，在 P1a 交付机制上建立 | main @ 3b6a51c | SPEC: docs/island/plans/2026-11-12-p1a-cache-memo.md（P1b 另立） |
| P2 | Compress 性能 | Q0 | 已交付（2026-11-12 集成 main，台账全清；真实收益 oxipng/SVGO 中位加速 1.90x） | main @ 0a0b458 | SPEC: docs/island/plans/2026-11-11-p2-compress-performance.md |
| C2 | Token 应用服务 | C1、P1 | 未撰写 | 未创建 | 避免与 P1 双写 pipeline |
| M1 | Manual 性能 | 当前手册施工、C1 | 未撰写 | 未创建 | 可与 C2 并行 |
| C3 | OutputPlan 输出合同 | C2 | 未撰写 | 未创建 | 最后统一输出语义 |
