# Wave 依赖资源架构中度重构计划

## TL;DR
> **Summary**: 保留 `themefile -> 主题文档 -> 输出` 这条 Wave 核心管线，引入统一 `RESOURCE` 依赖声明与由 Wave 自己维护的 dependency dictionary；`main.yaml` / `main@night.yaml` / `variants/*.yaml` 继续作为共享同一套依赖的独立主题文档，Style Dictionary 只负责输出阶段。
> **Deliverables**:
> - 新的 `RESOURCE` 依赖语法与兼容的旧语法迁移层
> - Wave 自己的 dependency loader / validator / merge / resolver 改造
> - main/night/variant 独立主题文档共用 dependency dictionary 的 CLI 流程
> - 资源校验、错误提示、集成测试与迁移文档
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 → 2 → 4 → 5 → 6 → 8

## Context
### Original Request
- 用户确认采用方案 A：不迁移到 Style Dictionary 的产品入口模型，保留 Wave 的 `themefile` 处理管线。
- 用户要求统一依赖入口，支持多个 palette / dimension / 外部资源。
- 用户确认 `main.yaml` / `main@night.yaml` / `variants/*.yaml` 应保持为**独立主题文档**，仅共享同一套依赖，不采用 overlay 模型。

### Interview Summary
- 新语法方向：
  - `THEME orca`
  - `RESOURCE palette leonardo`
  - `RESOURCE palette tailwindcss`
  - `RESOURCE dimension wave`
  - `RESOURCE custom ./path/file-a.json`
- `custom` 仅支持 `.yml` / `.yaml` / `.json`。
- 每个资源文件必须且只能有一个顶层 namespace；该 namespace 才是引用 API，文件名不是 API。
- themefile 不允许修改 namespace。
- dependency 之间不允许互相引用。
- 错误提示采用简洁型：文件、行号、原因。
- dependency merge 由 Wave 自己完成，SD 仅负责 transform / filter / format / output。

### Metis Review (gaps addressed)
- 采用**测试先行**，先锁定当前 main/night/variant 独立解析事实，再逐步重构。
- 明确取消“RESOURCE 模式下解析失败后 fallback 到 palette+dimension 直出”的旧路径；解析失败即失败，避免掩盖配置错误。
- 统一 parser / validator / CLI 的配置模型，避免多处各自接受/拒绝不同语法。
- 定义确定性的资源加载顺序与错误契约，避免未来输出不稳定。

## Work Objectives
### Core Objective
- 将当前单 `PALETTE + DIMENSION` 的依赖模型升级为统一 `RESOURCE` 模型，同时保留 Wave 的独立主题文档心智与现有输出能力。

### Deliverables
- `themefile` 支持 `RESOURCE <kind> <ref>` 语法，并在一个兼容窗口内支持旧 `PALETTE` / `DIMENSION`。
- 新的 dependency dictionary 构建层：资源读取、格式校验、namespace 校验、重复 namespace 报错、确定性 merge。
- 引用解析层改为面向“泛化 dependency namespaces + theme namespace”，继续支持 `{}` alias 与 `$ref`。
- CLI `theme` 命令改为：构建一次 dependency dictionary，然后分别解析 main/night/variant 主题文档并输出。
- 文档与错误契约更新：`docs/SPEC.md`、帮助文案、迁移说明。

### Definition of Done (verifiable conditions with commands)
- `bun test` 通过新增与既有测试。
- `bun test tests/resource-parser.test.ts tests/resource-merge.test.ts tests/theme-command.resource.test.ts` 通过。
- `bun run typecheck` 通过。
- 在同一 fixture 上连续执行两次 `bun run src/index.ts theme -f <fixture>/themefile`，输出文件字节完全一致。
- `RESOURCE` 模式下 theme 文档解析失败时，命令返回非 0，并输出简洁错误；不再生成 dependency 直出结果。

### Must Have
- 保留 `main.yaml` / `main@night.yaml` / `variants/*.yaml` 独立主题文档模型。
- dependency 不直接输出，只供引用。
- dependency 间互相引用视为错误。
- 资源文件根节点必须是对象，且恰好 1 个顶层 namespace。
- `custom` 仅支持 `.yml/.yaml/.json`。
- 旧语法有兼容窗口，但不能与 `RESOURCE` 混用。

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- 不要把 Wave 改造成 Style Dictionary 配置驱动产品入口。
- 不要引入 namespace 重命名能力。
- 不要把 night / variants 误实现为 overlay 层。
- 不要继续保留“解析失败就退回 palette+dimension 直出”的隐式成功路径。
- 不要允许 dependency 直接写入最终输出文件。

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **TDD（先 characterization，再新增规则测试，再改实现）** + `bun:test`
- QA policy: 每个任务都包含 happy path + failure path 命令级校验
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: 基线锁定与语法/类型基础（1, 2, 3）
Wave 2: dependency dictionary 与 resolver 改造（4, 5, 7）
Wave 3: CLI 接线、集成测试、文档迁移（6, 8）

### Dependency Matrix (full, all tasks)
| Task | Depends On | Notes |
|---|---|---|
| 1 | - | 锁当前行为与重构基线 |
| 2 | 1 | 新 themefile AST/兼容语法 |
| 3 | 1 | 资源校验与错误契约 |
| 4 | 2,3 | dependency loader / merge |
| 5 | 4 | 泛化 resolver |
| 6 | 4,5 | CLI 与 validator 接线 |
| 7 | 4 | 内置资源命名/注册统一 |
| 8 | 6,7 | 集成测试、文档与迁移说明 |

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `general`, `quick`
- Wave 2 → 3 tasks → `deep`, `general`
- Wave 3 → 2 tasks → `general`, `writing`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. 锁定当前独立主题文档行为基线

  **What to do**: 为当前 `main.yaml` / `main@night.yaml` / `variants/*.yaml` 的独立解析行为补 characterization tests；明确记录当前 fallback 行为、night/variant 命名行为、以及共享 palette+dimension 依赖这一事实，作为后续重构护栏。
  **Must NOT do**: 不修改运行逻辑；不引入 `RESOURCE` 实现；不提前改 help/docs。

  **Recommended Agent Profile**:
  - Category: `general` — Reason: 需要跨 CLI、detector、theme YAML 路径做基线测试。
  - Skills: [`my-coding`] — 需要稳定的 TypeScript/Bun 测试习惯。
  - Omitted: [`git-master`] — 此任务不涉及 git 操作。

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2,3] | Blocked By: []

  **References**:
  - Pattern: `src/cli/commands/theme.ts:442-491` — `main.yaml` 单独解析并在失败时 fallback。
  - Pattern: `src/cli/commands/theme.ts:532-583` — `main@night.yaml` 单独解析与 fallback。
  - Pattern: `src/cli/commands/theme.ts:589-625` — `variants/*.yaml` 单独解析与 fallback。
  - Pattern: `src/core/detector/night.ts:15-42` — 仅检测 `main@night.yaml` 是否存在。
  - Pattern: `src/core/detector/variants.ts:17-71` — 仅扫描 `variants/*.yaml`。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 新增 characterization tests 能断言 main/night/variant 是独立文档，不依赖 main 的中间结果。
  - [ ] 新增 characterization tests 能断言当前 fallback 路径真实存在，并为后续移除提供对照。
  - [ ] `bun test` 通过，且新增 fixture 名称明确表达行为语义。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Lock current independent theme-doc behavior
    Tool: Bash
    Steps: bun test tests/theme-command-current-behavior.test.ts > .sisyphus/evidence/task-1-characterization.txt 2>&1
    Expected: 测试通过，并断言 main/night/variant 分别独立解析
    Evidence: .sisyphus/evidence/task-1-characterization.txt

  Scenario: Lock current fallback behavior
    Tool: Bash
    Steps: bun test tests/theme-command-current-fallback.test.ts > .sisyphus/evidence/task-1-characterization-error.txt 2>&1
    Expected: 测试通过，并断言当前实现遇到 YAML 解析失败会 fallback
    Evidence: .sisyphus/evidence/task-1-characterization-error.txt
  ```

  **Commit**: YES | Message: `test(theme): lock current independent document behavior` | Files: [`tests/**`, `fixtures/**`]

- [ ] 2. 引入 `RESOURCE` 语法 AST 与兼容窗口

  **What to do**: 重构 `themefile` 解析类型，新增 `RESOURCE <kind> <ref>` 语法；旧 `PALETTE` / `DIMENSION` 在一个兼容窗口内继续支持，并在运行时发出 deprecation warning。禁止旧新语法混用；一旦检测到 `RESOURCE`，即进入新模式。
  **Must NOT do**: 不在此任务实现资源加载；不修改 resolver；不触碰 SD 输出逻辑。

  **Recommended Agent Profile**:
  - Category: `general` — Reason: parser + types + validator 都要同步收口。
  - Skills: [`my-coding`] — 需要统一 AST/类型风格。
  - Omitted: [`code-reviewer`] — 当前不是 review 任务。

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4] | Blocked By: [1]

  **References**:
  - Pattern: `src/core/parser/themefile.ts:3-84` — 当前只接受 `PALETTE` / `DIMENSION` / `THEME` / `PARAMETER`。
  - API/Type: `src/types/index.ts:18-31` — 当前 `ParsedThemefile` 仍为旧模型。
  - Pattern: `src/core/validator/config.ts:19-101` — validator 直接消费旧 `ParsedThemefile`。
  - Test: `tests/fixtures/full/themefile:1-5` — 现有 fixture 展示旧语法。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `parseThemefile()` 能产出新的 RESOURCE AST，并在 legacy 模式下保持旧 fixture 可解析。
  - [ ] 混用 `PALETTE/DIMENSION` 与 `RESOURCE` 时返回明确错误。
  - [ ] `RESOURCE custom` 仅接受 `.yml/.yaml/.json`，其余扩展名在 parser/validator 路径被拒绝。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Parse RESOURCE themefile and legacy themefile
    Tool: Bash
    Steps: bun test tests/themefile-resource-parser.test.ts > .sisyphus/evidence/task-2-resource-parser.txt 2>&1
    Expected: 新旧语法 fixture 都能按预期解析，混用语法 fixture 失败
    Evidence: .sisyphus/evidence/task-2-resource-parser.txt

  Scenario: Reject unsupported custom extension
    Tool: Bash
    Steps: bun test tests/themefile-resource-parser.test.ts --test-name-pattern "unsupported custom extension" > .sisyphus/evidence/task-2-resource-parser-error.txt 2>&1
    Expected: 返回 Unsupported custom resource format
    Evidence: .sisyphus/evidence/task-2-resource-parser-error.txt
  ```

  **Commit**: YES | Message: `refactor(themefile): add resource declarations and compatibility mode` | Files: [`src/core/parser/themefile.ts`, `src/types/index.ts`, `src/core/validator/config.ts`, `tests/**`]

- [ ] 3. 建立资源文件校验与简洁错误契约

  **What to do**: 实现资源文件通用校验器，统一 `.yml/.yaml/.json` 解析错误格式；校验根节点是对象、顶层 key 数量恰好为 1、namespace 值为对象；错误输出统一为“文件 + 行号 + 原因”。
  **Must NOT do**: 不做 dependency merge；不解析 theme 文档内部 alias / `$ref`；不引入长篇 hint。

  **Recommended Agent Profile**:
  - Category: `general` — Reason: 解析器与错误模型跨 YAML/JSON。
  - Skills: [`my-coding`] — 需要统一错误对象与 TypeScript 类型。
  - Omitted: [`brainstorming`] — 需求已定。

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4,6] | Blocked By: [1]

  **References**:
  - Pattern: `src/core/parser/palette.ts:53-88` — 现有 YAML schema error 返回 `line + message`。
  - Pattern: `src/core/parser/dimension.ts:45-80` — 现有 dimension schema error 路径。
  - Pattern: `src/core/parser/theme-yaml.ts:4-41` — 现有 theme YAML parse error 结构。
  - API/Type: `src/types/index.ts:79-82` — `ParseError` 基础形态。

  **Acceptance Criteria** (agent-executable only):
  - [ ] root 非对象、空对象、多个顶层 key、namespace 非对象、路径不存在、扩展名非法，都有稳定的错误类型与 CLI 输出。
  - [ ] YAML 与 JSON 解析错误都能附带文件路径与行号；无行号时明确输出 `Line: 1`。
  - [ ] `bun test tests/resource-validation.test.ts` 通过。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Validate supported and invalid resource structures
    Tool: Bash
    Steps: bun test tests/resource-validation.test.ts > .sisyphus/evidence/task-3-resource-validation.txt 2>&1
    Expected: 合法 fixture 通过；非法 fixture 均返回简洁错误
    Evidence: .sisyphus/evidence/task-3-resource-validation.txt

  Scenario: Report duplicate or malformed namespace with file+line
    Tool: Bash
    Steps: bun test tests/resource-validation.test.ts --test-name-pattern "namespace" > .sisyphus/evidence/task-3-resource-validation-error.txt 2>&1
    Expected: 输出包含文件路径、行号、错误原因
    Evidence: .sisyphus/evidence/task-3-resource-validation-error.txt
  ```

  **Commit**: YES | Message: `feat(resource): validate namespace and concise diagnostics` | Files: [`src/core/parser/**`, `src/types/**`, `tests/**`]

- [ ] 4. 构建 Wave 自有 dependency dictionary

  **What to do**: 实现 RESOURCE loader 与确定性 merge：按 themefile 声明顺序读取资源、校验每个资源只暴露一个 namespace、拒绝重复 namespace；将所有 dependency 组装成一个统一 dictionary，并保留资源来源元数据用于报错与调试。
  **Must NOT do**: 不把 merge 委托给 Style Dictionary；不允许 dependency 互相引用；不改变 theme 文档解析入口。

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 这是整个重构的语义核心，涉及确定性、冲突与元数据保留。
  - Skills: [`my-coding`] — 需要稳健的数据结构与错误处理。
  - Omitted: [`shadcn`] — 无关。

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [5,6,7] | Blocked By: [2,3]

  **References**:
  - Pattern: `src/core/resolver/index.ts:15-37` — 当前资源定位只支持单 `palette` / `dimension`。
  - API/Type: `src/types/index.ts:33-39` — 当前 `ResourceType` / `ResolvedResource` 过于狭窄。
  - Pattern: `src/core/resolver/builtin.ts:45-50` — 当前内置资源直接由名字拼路径。
  - Pattern: `src/core/resolver/user.ts:7-57` — 当前用户资源只分 palette/dimension 两类。

  **Acceptance Criteria** (agent-executable only):
  - [ ] dependency dictionary 按 themefile 中 RESOURCE 顺序稳定加载与合并。
  - [ ] 重复 namespace 直接失败，不会发生覆盖。
  - [ ] dependency 合并结果可被 main/night/variant 三类主题文档复用一次，不需重复读取依赖文件。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Build dependency dictionary from mixed resources
    Tool: Bash
    Steps: bun test tests/resource-merge.test.ts > .sisyphus/evidence/task-4-resource-merge.txt 2>&1
    Expected: 生成稳定 dictionary，namespace 与声明顺序符合 fixture 预期
    Evidence: .sisyphus/evidence/task-4-resource-merge.txt

  Scenario: Reject duplicate namespace across two resources
    Tool: Bash
    Steps: bun test tests/resource-merge.test.ts --test-name-pattern "duplicate namespace" > .sisyphus/evidence/task-4-resource-merge-error.txt 2>&1
    Expected: 命令失败并定位到冲突资源文件
    Evidence: .sisyphus/evidence/task-4-resource-merge-error.txt
  ```

  **Commit**: YES | Message: `feat(resource): build deterministic dependency dictionary` | Files: [`src/core/resolver/**`, `src/types/**`, `tests/**`]

- [ ] 5. 泛化引用解析到 dependency namespace 模型

  **What to do**: 将当前 resolver 从硬编码 `leonardo` / `wave` / `theme` 的模型，改为 `theme + 任意 dependency namespace` 模型；继续支持 `{namespace.path}` 与 `$ref: "#/namespace/..."`，同时明确禁止 dependency→dependency 引用。
  **Must NOT do**: 不改变 `{}` 与 `$ref` 的角色边界；不要求 theme 文档之间互相引用；不把 SD 作为 resolver。

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: resolver 需要保持现有 DTCG `$ref` 与 alias 语义，同时泛化 namespace。
  - Skills: [`my-coding`] — 类型、递归与错误处理要求高。
  - Omitted: [`supabase-postgres-best-practices`] — 无关。

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6,8] | Blocked By: [4]

  **References**:
  - Pattern: `src/core/resolver/theme-reference.ts:38-62` — 当前 `$ref` 仅允许 `theme | leonardo | wave`。
  - Pattern: `src/core/resolver/theme-reference.ts:173-183` — 当前按 source 分支选 `palette` / `dimension` / `theme`。
  - Pattern: `src/core/resolver/theme-reference.ts:312-357` — 当前 `{}` 外部引用只认识 `leonardo` / `wave`。
  - API/Type: `src/types/index.ts:188-191` — 当前 `ReferenceDataSources` 仍是 palette/dimension 二元模型。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `{leonardo...}`、`{tailwindcss...}`、`{file-a...}`、`{theme...}` 均能按 namespace 解析。
  - [ ] `$ref` 支持 `#/theme/...` 与 `#/dependency-namespace/...`，保留属性合并行为。
  - [ ] dependency 文件内若引用其他 dependency namespace，返回明确错误。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Resolve alias and $ref against generic dependency namespaces
    Tool: Bash
    Steps: bun test tests/resource-resolver.test.ts > .sisyphus/evidence/task-5-resource-resolver.txt 2>&1
    Expected: alias 与 $ref 都能对任意 dependency namespace 正确解析
    Evidence: .sisyphus/evidence/task-5-resource-resolver.txt

  Scenario: Reject dependency-to-dependency reference
    Tool: Bash
    Steps: bun test tests/resource-resolver.test.ts --test-name-pattern "dependency to dependency" > .sisyphus/evidence/task-5-resource-resolver-error.txt 2>&1
    Expected: 返回非 0，并输出引用非法的文件和行号
    Evidence: .sisyphus/evidence/task-5-resource-resolver-error.txt
  ```

  **Commit**: YES | Message: `feat(resolver): generalize namespaces for resource dictionary` | Files: [`src/core/resolver/theme-reference.ts`, `src/types/index.ts`, `tests/**`]

- [ ] 6. 重写 CLI 与 validator 到 RESOURCE 流程

  **What to do**: 将 `theme` 命令与 `validateThemefile()` 切到统一 RESOURCE 流程：构建一次 dependency dictionary，然后分别解析 main/night/variant 独立主题文档；在新模式下 theme 文档解析失败直接失败，不再 fallback。旧语法兼容窗口内可先转为内部 RESOURCE AST，再走同一流程。
  **Must NOT do**: 不改变 main/night/variant 的独立文档模型；不把 night/variant 叠到 main 上；不把 dependency 输出成 standalone 结果。

  **Recommended Agent Profile**:
  - Category: `general` — Reason: CLI、validator、error contract 三处接线。
  - Skills: [`my-coding`] — 需要安全重构已有长函数。
  - Omitted: [`frontend-design`] — 无关。

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [8] | Blocked By: [4,5]

  **References**:
  - Pattern: `src/cli/commands/theme.ts:339-380` — 当前 themefile 仍硬绑 PALETTE/DIMENSION。
  - Pattern: `src/cli/commands/theme.ts:442-491` — 当前 main 路径含 fallback。
  - Pattern: `src/cli/commands/theme.ts:532-625` — night/variant 当前也是独立解析，但含 fallback。
  - Pattern: `src/core/validator/config.ts:57-100` — validator 仍直接验证旧字段。

  **Acceptance Criteria** (agent-executable only):
  - [ ] 在 RESOURCE 模式下，main/night/variant 共享同一 dependency dictionary，但各自独立解析并独立输出。
  - [ ] 任一主题文档解析失败时，CLI 返回非 0，不会 fallback 到 dependency 直出。
  - [ ] legacy `PALETTE/DIMENSION` 在兼容窗口内仍可运行，但输出 deprecation warning。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Generate main/night/variant from shared resource dictionary
    Tool: Bash
    Steps: bun test tests/theme-command.resource.test.ts > .sisyphus/evidence/task-6-theme-command.txt 2>&1
    Expected: main/night/variant 均生成，且共用同一 dependency fixture
    Evidence: .sisyphus/evidence/task-6-theme-command.txt

  Scenario: Fail fast when a theme document is invalid
    Tool: Bash
    Steps: bun test tests/theme-command.resource.test.ts --test-name-pattern "fail fast" > .sisyphus/evidence/task-6-theme-command-error.txt 2>&1
    Expected: 退出非 0；不生成 palette/dimension 直出文件
    Evidence: .sisyphus/evidence/task-6-theme-command-error.txt
  ```

  **Commit**: YES | Message: `refactor(cli): route theme generation through resource dictionary` | Files: [`src/cli/commands/theme.ts`, `src/core/validator/config.ts`, `tests/**`]

- [ ] 7. 统一内置资源注册与名称契约

  **What to do**: 建立内置资源注册表，统一 palette/dimension 的公开名称与真实文件路径，消除当前 `tailwindcss4` / `tailwindcss-4-0` / help 文案不一致问题。对外公开的 palette 名称固定为 `leonardo`、`tailwindcss`，dimension 名称固定为 `wave`。
  **Must NOT do**: 不引入 built-in theme 回潮；不把文件名直接暴露成 API；不修改用户自定义 namespace 规则。

  **Recommended Agent Profile**:
  - Category: `general` — Reason: 需要收口 resolver、validator、docs/help 中的命名漂移。
  - Skills: [`my-coding`] — 需要统一契约与错误输出。
  - Omitted: [`git-flow-branch-creator`] — 无关。

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8] | Blocked By: [4]

  **References**:
  - Pattern: `src/core/resolver/builtin.ts:45-50` — 当前直接 `${name}.yaml` 拼路径。
  - Pattern: `src/core/validator/config.ts:158-170` — 当前 validator 仍检查 `tailwindcss4.yaml`。
  - Pattern: `docs/SPEC.md:94-109` — 当前 SPEC 的内置资源命名已与实现不一致。
  - Pattern: `src/cli/commands/help.ts:33-35` — 帮助文案仍保留旧内置主题示例。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `RESOURCE palette tailwindcss` 能稳定解析到正确内置资源。
  - [ ] 旧漂移名称不会继续出现在 help、validator、SPEC 中。
  - [ ] `bun test tests/builtin-resource-registry.test.ts` 通过。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Resolve canonical builtin resource names
    Tool: Bash
    Steps: bun test tests/builtin-resource-registry.test.ts > .sisyphus/evidence/task-7-builtin-registry.txt 2>&1
    Expected: leonardo / tailwindcss / wave 都映射到正确文件
    Evidence: .sisyphus/evidence/task-7-builtin-registry.txt

  Scenario: Reject unknown builtin resource names
    Tool: Bash
    Steps: bun test tests/builtin-resource-registry.test.ts --test-name-pattern "unknown builtin" > .sisyphus/evidence/task-7-builtin-registry-error.txt 2>&1
    Expected: 返回 INVALID_RESOURCE，并输出简洁错误
    Evidence: .sisyphus/evidence/task-7-builtin-registry-error.txt
  ```

  **Commit**: YES | Message: `feat(resource): normalize builtin registry names` | Files: [`src/core/resolver/**`, `src/core/validator/**`, `docs/SPEC.md`, `src/cli/commands/help.ts`, `tests/**`]

- [ ] 8. 完成端到端验证与迁移文档

  **What to do**: 建立 end-to-end fixture matrix，覆盖 RESOURCE happy path、legacy 兼容、main/night/variant 独立主题文档、deterministic output；同步更新 `docs/SPEC.md` 与 README/帮助文案，说明 RESOURCE 模型、独立主题文档模型、简洁错误契约和 legacy 迁移路径。
  **Must NOT do**: 不在文档中描述 overlay；不保留“main.yaml 失败后仍会生成 dependency 直出”的旧描述；不让 docs 与代码分叉。

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: 需要整理面向设计师的清晰文档，同时带集成测试收尾。
  - Skills: [`humanizer`] — 保证文档自然、非模板腔；[`my-coding`] — 集成测试仍需精确命令。
  - Omitted: [`create-readme`] — 不是新建 README。

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [] | Blocked By: [6,7]

  **References**:
  - Pattern: `docs/SPEC.md:11-35` — 当前 mental model 仍是 PALETTE/DIMENSION 数据源模型。
  - Pattern: `docs/SPEC.md:59-109` — 当前 themefile 与内置资源章节需整体更新。
  - Pattern: `src/core/generator/style-dict.ts:52-135` — SD 仍是最终输出引擎。
  - Test: `tests/theme-transformer.test.ts:5-119` — 现有测试风格可延续到 resource E2E。
  - Command: `package.json:11-15` — 可执行 `bun run typecheck`。

  **Acceptance Criteria** (agent-executable only):
  - [ ] `docs/SPEC.md` 明确 RESOURCE 模型、独立主题文档模型、custom 支持格式与简洁错误契约。
  - [ ] 端到端测试覆盖 RESOURCE 模式与 legacy 兼容模式。
  - [ ] 同一 fixture 连续生成两次输出文件字节一致。
  - [ ] `bun test && bun run typecheck` 全通过。

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Run full end-to-end fixture matrix
    Tool: Bash
    Steps: bun test && bun run typecheck > .sisyphus/evidence/task-8-e2e.txt 2>&1
    Expected: 所有测试与 typecheck 通过
    Evidence: .sisyphus/evidence/task-8-e2e.txt

  Scenario: Verify deterministic output
    Tool: Bash
    Steps: rm -rf .sisyphus/evidence/determinism && mkdir -p .sisyphus/evidence/determinism && bun run src/index.ts theme -f tests/fixtures/resource-happy/themefile -o .sisyphus/evidence/determinism/run1 && bun run src/index.ts theme -f tests/fixtures/resource-happy/themefile -o .sisyphus/evidence/determinism/run2 && diff -r .sisyphus/evidence/determinism/run1 .sisyphus/evidence/determinism/run2 > .sisyphus/evidence/task-8-e2e-error.txt 2>&1
    Expected: diff 无输出，两个目录内容完全一致
    Evidence: .sisyphus/evidence/task-8-e2e-error.txt
  ```

  **Commit**: YES | Message: `docs(theme): document resource model and migration` | Files: [`docs/SPEC.md`, `README.md`, `src/cli/commands/help.ts`, `tests/**`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- 采用 8 个原子提交，对应 8 个任务；避免在未锁定 characterization tests 之前重写 CLI。
- 先 `test(...)` 再 `refactor(...) / feat(...)`，确保 fallback 移除与 RESOURCE 接入都有测试护栏。
- `docs(...)` 单独成提交，最后再更新 SPEC / README / help，避免文档先于行为漂移。

## Success Criteria
- Wave 继续以 `themefile` 为产品入口，不暴露 SD config 心智。
- `RESOURCE` 成为统一依赖入口；旧 `PALETTE/DIMENSION` 进入兼容窗口并可被后续安全移除。
- main/night/variant 保持独立主题文档，且共享同一 dependency dictionary。
- dependency 不输出、不互相引用、namespace 唯一且稳定。
- 所有生成流程在错误时 fail-fast，不再用 fallback 掩盖无效配置。
- 文档、帮助、validator、CLI 和测试对同一语义保持一致。
