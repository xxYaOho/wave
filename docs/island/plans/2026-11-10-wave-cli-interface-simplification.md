---
date: 2026-11-10
state: 施工中
dispatch: ~
---

# Wave CLI 接口简化与模块深化 Plan

## Problem Statement

Wave 多轮迭代后同时存在能力域、默认动作、格式子命令、隐藏别名和 argv 快捷改写。相同意图有多个入口，文件位置参数与选择参数混用，顶层帮助、模块帮助、用户手册和实际行为已经漂移。设计师需要记忆实现历史，Agent 也难以获得稳定、范围明确的命令说明。

## Solution

采用「高频任务直接执行，复杂能力在模块内展开」的命令模型。顶层只暴露 `token`、`compress`、`motion`、`workspace` 等直接任务；token 的创建、检查、维护、迁移和资源能力在模块内分层。统一源文档输入、产品输出和写入安全参数，并提供面向 Human 的简洁帮助、面向 Agent 的分层 Markdown 手册，以及独立的可视化网页手册。

## Further Notes

- 本次是公开 CLI 的干净切换，不保留 `design-token`、`dt`、`mg` 或隐藏 argv 兼容层。
- 用户可使用 `profiles`、`themes`、`variants` 或任意其他目录名；显式文件输入不得依赖固定目录名。
- 未来若出现无法由源文档路径表达的选择需求，再单独扩展选择合同，不预设新的 profile flag。

## User Stories

1. 作为设计师，我希望直接运行高频任务，以便无需理解模块内部结构即可完成构建、压缩、动效生成和工作区创建。
2. 作为 token 维护者，我希望创建、检查、身份维护、迁移和资源命令具有稳定分组，以便快速找到低频能力。
3. 作为 token 维护者，我希望通过实际源文档路径选择 main 或 profile，以便自由组织目录而不学习重复的选择参数。
4. 作为设计师，我希望所有产品输出都支持统一的输出参数和覆盖保护，以便安全地控制交付结果。
5. 作为 Agent，我希望按命令路径获取结构化 Markdown 手册，以便只读取当前任务所需的使用合同。
6. 作为项目维护者，我希望命令注册、帮助、手册和行为测试共享明确边界，以便后续新增能力不再造成接口漂移。

## Constraints

- 保留现有 design-token 解析、profile 差量合并、Night 色彩规则、输出格式和工具链核心能力；本次不重写业务算法。
- `main.yaml` 的 `$config` 继续承载构建配置；profile 的 base 身份、覆写和 Night 身份规则保持不变。
- `wave token`、`wave compress`、`wave workspace` 保留直接默认动作；`wave token migrate` 必须显式选择迁移对象。
- `wave manual` 继续启动可视化网页；`-m, --manual` 只向标准输出打印当前命令范围的结构化 Markdown。
- `-f, --file` 与 `-o, --output <path>` 是唯一规范输入、输出名称；不保留位置文件输入、`--out` 或 `--output` 的重复别名。
- 任意目录名适用于显式 `-f` 源文件。批量 `--profiles all` 仍使用既有 workspace 发现规则，不递归猜测所有 YAML 文件。
- 自定义 profile/Night 输出只改变本次写入位置，不扩大构建的隐式发现范围；结果必须提示非约定位置的后续消费方式。
- 写入参数按语义共享定义，但只出现在支持该行为的命令上，不制造无效果的全局参数。

## Implementation Decisions

1. 顶层规范语法为 `wave <command> [flags]`。公开命令为 `token`、`compress`、`motion`、`workspace`、`doctor`、`install`、`manual` 和 `version`；`--version` 继续作为版本 flag。`motion` 不再提供 `mg`。
2. `token` 默认构建，并提供 `build`、`new`、`doctor`、`wcag`、`ids`、`migrate`、`show`、`update`、`status`。
3. `token new` 默认创建 token workspace；`token new profile <name>` 创建 profile；`token new night` 从 Day main 或 Day profile 创建 Night overlay。顶层 `night` 命令移除。
4. `token migrate extensions` 承接现有扩展迁移；`migrate` 本身不执行默认迁移。
5. `compress` 直接执行压缩，不再公开 `run`；`workspace` 直接创建工作区，不再公开 `create`。
6. `motion` 直接执行编码，通过 repeatable 之外的单值 `--format gif|apng` 选择格式。省略格式时仅在 TTY 中询问，非交互环境报错。不再公开 `gif/apng` 子命令。
7. 默认动作直接复用命令处理函数，不在解析前注入子命令；删除 `--build`、`--ids`、`--ids-write` 等快捷旗。
8. 对支持单文档选择的 token 命令，`-f` 缺省读取 `./main.yaml`，目录展开为 `<dir>/main.yaml`，`main.yaml` 表示 main，其他合法 Day YAML 表示 profile。profile 的 base 从最近祖先目录中的 `main.yaml` 解析，并通过既有 `$config.base` 身份合同核验。既有 main symlink 输入保持有效，resource、profile、输出和 base 的相对路径均以用户传入的 symlink 所在位置为基准，不因 realpath 改变。
9. `build`、`wcag`、`doctor`、`new night` 移除 `--profile`；`wcag` 同时移除 `[scope]`。批量构建保留 `--profiles all`，且只能与 main 或目录输入组合。
10. `new profile`、`ids` 和 `migrate extensions` 保持 base/workspace 级操作，只接受 main 或包含 main 的目录，不将任意 profile 文件扩大为新的工作区入口。
11. 顶层 `doctor` 只检查运行环境和工具链；`token doctor` 检查 workspace、resource 与身份；`token wcag` 独立检查对比度。删除顶层和 token doctor 的 `--contrast` 及顶层 doctor 的 token 文件输入。
12. 所有产生产品输出的命令支持 `-o, --output`。构建、压缩使用目录语义；motion、new profile 和 new night 使用文件语义；token new 使用目标目录语义；token doctor 保留既有输出目录检查语义。workspace 的 `--output` 直接指定最终 `targetDir`，不是父目录；逻辑 workspaceName 仍来自交互答案。
13. `new profile` 默认写入 `<workspace>/profiles/<name>.yaml`；`new night` 默认写入 Day 文件旁的 `<stem>@night.yaml`。显式输出可改变位置，但不改写 Day 配置。profile 输出文件的 stem 必须等于规范化后的 `<name>`，否则返回参数错误。profile 若被输出到 base main 的祖先目录树之外，不能仅凭 `$config.base` 直接消费；receipt 和手册必须提示先将同一 `<name>.yaml` 移到 base main 所在目录或其子目录，再通过 `-f` 选择。
14. `--dry-run` 表示只计算和展示计划，`--write` 表示写回 ids/migrate 源文档，`--yes` 只跳过确认，`--force` 只授权覆盖既有目标。
15. 新建 workspace、profile 和 Night 源文档时，目标已存在则默认拒绝，只有 `--force` 覆盖；Night 因此改变当前默认覆盖行为。workspace 已有目标在 force 下必须是目录，只覆盖本次计划生成的文件，保留其他文件且不递归删除；目标是普通文件时即使 force 也拒绝。普通 token build 的生成产物沿用既有覆盖行为。
16. token 构建的平台列表收入 `main.yaml` 的 `$config` 和 parameter groups，不再开放 CLI `--platform`。其余列表参数只接受 repeatable 形式，不接受逗号分隔。
17. `compress` 与 `motion` 统一使用 `-q, --quality <value>`；`--json`、`--status`、`--verbose` 仍只由支持它们的诊断或业务命令公开。
18. 每一级命令都支持 `-m, --manual`。该选项短路默认业务动作，输出无终端装饰的 Markdown，不启动服务、不写文件、不进入交互。
19. Markdown 手册按根、模块、命令组和叶子命令分层，至少包含适用范围、用法、命令或参数、默认行为、示例和相关命令。自定义 Night 输出的手册与 receipt 必须给出唯一后续操作：将文件放回向 Day 对应的 `<stem>@night.yaml` 约定位置后，再运行 `token build -f <Day 源文档> --night`；profile 场景的 Day 源文档必须是该 profile 文件，不能只构建 main。不得只提示“不会自动发现”。命令元数据与手册索引保持同源，详细内容复用用户手册并在构建时随 CLI 打包。
20. 顶层帮助按 Common commands、Workspace、Toolchain、Other 分组；token 帮助按 Commands 与 Resources 分组。帮助只展示当前层级真实可用的命令和参数。

## Testing Decisions

- 以进程级 CLI 行为测试验证公开命令、退出码、标准输出和标准错误；旧命令必须明确失败并给出新入口。
- 对默认动作与显式动作做等价验证，但不再测试 argv 字符串改写。
- 为目录、main、任意目录中的 profile、缺失 base、错误 base 身份和 Night 输入建立表驱动测试。
- 为所有输出命令验证默认路径、自定义 `--output`、既有目标拒绝、`--force` 覆盖和适用的 `--dry-run` 零写入。
- Night profile 测试必须证明先完成 base/profile 合并与引用解析，再派生 overlay，并保持 Day/Night 身份合同。
- Doctor 测试分别证明全局诊断不依赖 token 文件、token 诊断不隐含 WCAG、WCAG 使用统一源文档选择。
- Markdown 手册按每个层级验证标题、命令范围、参数和示例；同时验证无 ANSI、无交互、无业务副作用及构建产物中的可用性。
- 保留既有核心回归和真实 Orca 全 profile canary；自定义输出位置不得被误加入隐式发现断言。

## Out of Scope

- 不修改 DTCG 类型、引用解析、颜色转换、Sketch payload 或 Night 色彩规则。
- 不重新设计可视化手册的信息架构和页面样式，只整理内容映射与分层输出。
- 不为自定义 Night 输出增加新的隐式搜索、配置字段或额外 overlay 选择参数。
- 不实现 `doctor --fix`、压缩 `safe/small` 模式或新的资源类型。
- 不保留旧 CLI alias、快捷旗和位置参数兼容层。

## Draft Plan

- 结构总览：CLI 层分为命令注册、默认动作路由、共享参数、源文档输入、帮助渲染和 Markdown 手册；core 层增加统一的 main/profile 源文档加载入口，并让构建、诊断、WCAG 和 Night 创建复用。输出策略在业务服务中计算目标路径，在 CLI 层统一传入和报告。数据流为「命令路径 → 参数与文档模式短路 → 源文档解析 → 业务能力 → 输出/写入策略 → receipt」。
- 关键契约：公开命令树以决策层为准；源文档解析结果为 main 或带 base 上下文的 profile，绝不把 Night overlay 当 Day 输入；输出解析区分文件与目录；文档输出和 help 在任何默认动作之前短路；自定义输出与隐式发现解耦并显式提示。
- 文件结构：
  - `src/cli/index.ts`：只负责程序装配、顶层文档模式和解析。
  - `src/cli/registry.ts`：维护顶层命令、分组和手册范围元数据。
  - `src/cli/options.ts`：共享输入、输出、写入和文档参数定义及冲突检查。
  - `src/cli/file-input.ts`：解析目录/main/profile 输入，不再处理位置参数互斥。
  - `src/cli/help.ts`：统一顶层、模块和命令组帮助渲染。
  - `src/cli/manual-markdown.ts`：按命令路径选择并输出分层 Markdown。
  - `src/cli/commands/token.ts`：token 模块与默认 build 路由，由现有 `dt.ts` 收敛而来。
  - `src/cli/commands/token-new.ts`：new、profile、night 创建命令组。
  - `src/cli/commands/token-migrate.ts`：migrate 命令组，复用现有 extensions 处理器。
  - `src/cli/commands/build.ts`、`doctor.ts`、`dt.ts`、`dt-ids.ts`、`show.ts`：承接新输入合同和命令命名；不再由 wcag 间接解析 doctor 命令。
  - `src/cli/commands/compress.ts`、`motion.ts`、`workspace.ts`：直接默认动作、统一输出与写入参数。
  - `src/cli/commands/night.ts`：移入 token new 命令组后删除独立顶层注册。
  - `src/core/pipeline/workspace-loader.ts` 与 `profile-resolver.ts`：提供统一源文档和最近祖先 base 解析，复用既有 profile 合并。
  - `src/core/night/emit.ts`：支持合并后的 Day profile、输出覆盖、dry-run 和 force。
  - `src/core/workspace/*`、`src/cli/commands/dt-new-profile.ts`：承接自定义输出和写入保护。
  - `manual/pages/*`、`manual/manual.config.yaml`：补齐新命令映射、Night 创建和分层手册内容。
  - `scripts/build-manual.ts`、`scripts/build-cli.ts`：确保 Markdown 手册在开发运行与构建 CLI 中一致可用。
  - `tests/cli-*.test.ts`、`file-input.test.ts`、`night-*.test.ts`、`profile-*.test.ts`、`manual-*.test.ts`：替换旧公共合同并补充新行为；移除 `normalize-argv.test.ts`。
  - `README.md`、`docs/SPEC.md`、`CLAUDE.md`：同步唯一公共命令模型和必要验证命令。
- 风险与未决：公开命令切换会影响全部 CLI 集成测试；任意位置 profile 必须可靠定位 base，不能靠目录名；Commander 的父命令选项与默认动作需要避免重复解析；输出到 base 祖先目录树之外的 profile 不能被直接消费，自定义 Night 输出不会被默认 build 自动发现，两者都必须在手册和 receipt 中给出迁回约定范围的具体步骤；构建后手册资源缺失需要独立 canary。没有阻塞施工的产品未决项。
- 里程碑草案：先冻结公共命令合同，再实现源文档选择，随后完成创建与输出安全、其他模块和 Doctor 收敛，最后交付分层手册、文档和真实 consumer 验证。

## Implement Plan

施工前从 `main` 创建单一特性分支。Milestone-1 至 Milestone-5 的 Task-1 按序分派当前切片给 coder-plus；Milestone-5 的分层手册内容架构与文字改写由主代理使用既定写作技能完成，不交给 coder-plus。执行者完成实现与局部验证后，由主代理复核公共合同、运行里程碑基线并提交该完整变更。里程碑未通过不得进入下一里程碑。最后由主代理执行完整交付闸门和真实 consumer canary。

## Milestone-1

公开命令树与默认动作

- 验证主题：所有顶层与 token 命令只呈现新范式；默认动作不依赖 argv 改写；旧命令和快捷入口明确失败。
- 核验基线：`bun test tests/cli-token.test.ts tests/cli-command-shape.test.ts tests/cli-motion.test.ts tests/cli-compress.test.ts tests/cli-workspace.test.ts && pnpm typecheck`。
- 来源：User Stories 1、2、6；Implementation Decisions 1–7、20。

### Task-1

建立命令元数据、共享文档选项与统一帮助（来源：User Story 6）

- 验收标准：顶层帮助按约定分组，`version` 与 `--version` 均保留；token 帮助完整列出 build/new/doctor/wcag/ids/migrate，并在 Resources 分组列出 show/update/status，不新增 `token resources` 命令；new 和 migrate 有各自层级帮助；所有层级接受 `-m` 但本里程碑只接入后续手册入口，不执行默认业务；不再出现旧 alias、快捷旗、位置文件和 `--out`。
- 可动文件范围：`src/cli/index.ts`、`registry.ts`、`options.ts`、`help.ts`、`commands/token.ts`、`token-new.ts`、`token-migrate.ts` 及必要命令工厂；新增 `tests/cli-command-shape.test.ts`。
- 依赖：无。
- 固有风险：Commander 默认 help/version 退出码和父命令选项继承可能产生双重渲染。

- [ ] 先写顶层、模块、命令组帮助和旧入口拒绝测试。
- [ ] 用集中元数据驱动注册与帮助，移除索引中的专用 help 分支。
- [ ] 运行局部测试与类型检查，返回实际输出。

### Task-2

收敛默认动作和格式选择（来源：User Stories 1、2）

- 验收标准：`token` 等价于 `token build`，`token new` 创建 workspace，`compress` 直接压缩，`workspace` 直接创建；`motion --format gif|apng` 直接编码，TTY 省略格式可询问，非 TTY 省略格式报错；`migrate` 无默认动作；`design-token/dt/mg/night/show` 及 `compress run`、`motion gif/apng`、`workspace create` 和 argv 快捷旗均退出。
- 可动文件范围：`src/cli/commands/*`、`src/cli/normalize-argv.ts`、`src/cli/index.ts`、`src/cli/registry.ts`；相关 `tests/cli-*.test.ts` 和 `tests/normalize-argv.test.ts`。
- 依赖：Task-1。
- 固有风险：默认动作与显式动作不能通过二次 Commander parse 实现，否则选项来源和退出码会再次分裂。

- [ ] 抽取可复用命令处理函数，让默认动作与显式动作直接调用同一实现。
- [ ] 删除 argv 注入和不再公开的命令注册，更新错误提示。
- [ ] 验证默认/显式等价、非交互 motion 和旧入口退出码。

> [!IMPORTANT]
> Milestone-1 闸门：主代理逐条比对公开命令树，运行核验基线并检查无重复 help；未通过不进入 Milestone-2。

## Milestone-2

统一源文档选择与 token 检查/构建

- 验证主题：目录、main 和任意目录中的 Day profile 通过同一 `-f` 合同进入 build、wcag、doctor 和后续 Night 创建；profile base 解析不依赖目录名。
- 核验基线：`bun test tests/file-input.test.ts tests/workspace-loader.test.ts tests/profile-resolver.test.ts tests/cli-token.test.ts tests/cli-doctor.test.ts tests/doctor-contrast-score.test.ts && pnpm typecheck`。
- 来源：User Story 3；Implementation Decisions 8–11、16。

### Task-1

实现源文档解析和最近祖先 base 定位（来源：User Story 3）

- 验收标准：缺省/目录/main 得到 main；其他 Day YAML 得到 profile；profile 从最近祖先 `main.yaml` 加载 base 并核验 `$config.base`；缺失或错误 base、resource、Night overlay 输入明确失败；main symlink 保留既有路径基准；批量模式拒绝 profile 文件；ids/migrate/new profile 仍只接受 main 或目录。
- 可动文件范围：`src/cli/file-input.ts`、`src/core/pipeline/workspace-loader.ts`、`profile-resolver.ts`、必要类型；`tests/file-input.test.ts`、`workspace-loader.test.ts`、`profile-resolver.test.ts`。
- 依赖：Milestone-1。
- 固有风险：不能通过字符串包含 `profiles` 判断身份，也不能把任意 YAML 当 profile 后绕过 schema。

- [ ] 用 main、平级 profile、任意命名嵌套目录、main symlink 和错误输入建立表驱动测试。
- [ ] 实现单一解析入口并复用既有 profile 合并与身份核验。
- [ ] 验证错误路径不创建或修改输出。

### Task-2

将 build、wcag、doctor 接到源文档合同（来源：User Stories 2、3）

- 验收标准：三个命令移除 `--profile`，wcag 移除 `[scope]`；`-f <profile.yaml>` 只处理所选 profile；build 保留 `--profiles all` 且只接受 main/目录；token build 不再接受 `--platform`，平台来自 `$config`；wcag 直接调用对比度服务，不再构造 doctor argv。
- 可动文件范围：`src/cli/commands/build.ts`、`doctor.ts`、`token.ts`、`src/core/pipeline/theme-service.ts`、必要 pipeline 类型；相关 CLI、doctor、profile 和 parameter-group 测试。
- 依赖：Task-1。
- 固有风险：profile 自定义路径不能只传 profile 名称给既有发现器；显式 profile 与 `--profiles all` 必须互斥。

- [ ] 先迁移进程级测试和 pipeline 输入类型。
- [ ] 接入统一源文档结果，移除旧选择参数和 CLI 平台覆盖。
- [ ] 验证 main、单 profile、批量 all 及配置驱动平台输出。

> [!IMPORTANT]
> Milestone-2 闸门：主代理使用非 `profiles` 目录名的 hermetic fixture 验证完整链路，并运行核验基线；未通过不进入 Milestone-3。

## Milestone-3

创建命令、产品输出与源文件写入安全

- 验证主题：new、new profile、new night 支持约定默认输出和显式 `--output`，并统一 dry-run/force；Night 可从 main 或 profile Day 源生成。
- 核验基线：`bun test tests/dt-new-profile.test.ts tests/night-emit.test.ts tests/night-params.test.ts tests/cli-token.test.ts tests/cli-workspace.test.ts && pnpm typecheck`。
- 来源：User Story 4；Implementation Decisions 12–15。

### Task-1

补齐 workspace 与 profile 创建的输出和写入策略（来源：User Story 4）

- 验收标准：`token new` 支持目标目录输出；`token new profile <name>` 默认写入约定位置并支持输出文件覆盖，但输出 stem 必须等于规范化 name；既有目标默认拒绝，`--force` 才覆盖；名称冲突针对 workspace 已发现的同名 profile，目标冲突针对解析后的输出路径，force 仅在两者指向同一目标时允许覆盖，不能借自定义路径制造同名冲突；适用的 `--dry-run` 计算完整计划且零写入；输出到 base 祖先目录树之外时，明确提示先移回 base main 所在目录或其子目录再通过 `-f` 消费。
- 可动文件范围：`src/cli/commands/token-new.ts`、`dt-init.ts`、`dt-new-profile.ts`、必要 core workspace/profile 模块；`dt-new-profile.test.ts`、`cli-token.test.ts`。
- 依赖：Milestone-2。
- 固有风险：profile 名称冲突检查与自定义文件名不能互相绕过；force 只能覆盖目标文件，不能附带修改 base。

- [ ] 为默认路径、自定义路径、dry-run、force 和失败零写入补测试。
- [ ] 实现输出解析与安全写入，更新 next-step 提示。
- [ ] 验证默认位置及移回 base 可发现目录树后的 profile 可通过显式 `-f` 被 build 消费；外部自定义路径只验证提示和明确失败，不承诺脱离 base 直接消费。

### Task-2

将 Night 创建并入 token new 并支持 Day profile（来源：User Stories 2、4）

- 验收标准：`token new night` 接受 main/目录/profile 文件；profile 输入先合并 base 与引用再派生；默认输出到 Day 旁，`--output` 可指定文件；已存在时无 force 失败且字节不变，force 才覆盖；dry-run 零写入；Night 输入及旧 `--chroma/--chroma-ev` 别名被拒绝；非约定输出明确提示需迁回 Day 对应的 `<stem>@night.yaml` 位置，并运行 `token build -f <原 Day 源文档> --night` 消费。
- 可动文件范围：`src/cli/commands/token-new.ts`、`night.ts`、`src/core/night/emit.ts` 及必要 pipeline 接口；`night-emit.test.ts`、`night-params.test.ts`、`cli-token.test.ts`。
- 依赖：Task-1。
- 固有风险：Night 参数必须来自实际 Day 源及其 base 配置，不能只读取 profile 局部 `$config`；自定义输出不得改变既有身份和 overlay 内容。

- [ ] 增加 main/profile、任意目录、自定义输出和写入安全测试。
- [ ] 复用统一源文档加载结果改造 emit，保留纯色彩规则不变。
- [ ] 验证默认 overlay 可被既有 build 消费，自定义 overlay 有明确提示。

> [!IMPORTANT]
> Milestone-3 闸门：主代理核验所有失败路径零写入、force 只覆盖声明目标，并运行核验基线；未通过不进入 Milestone-4。

## Milestone-4

模块输出参数、写入 flags 与 Doctor 边界

- 验证主题：compress、motion、workspace 和 token 使用一致的输出名称及写入语义；诊断命令不再跨模块。
- 核验基线：`bun test tests/cli-compress.test.ts tests/cli-motion.test.ts tests/cli-workspace.test.ts tests/cli-doctor.test.ts tests/cli-tools.test.ts tests/doctor-runner.test.ts && pnpm typecheck`。
- 来源：User Stories 1、4；Implementation Decisions 11–17。

### Task-1

统一业务模块输出和列表/写入参数（来源：User Story 4）

- 验收标准：所有产品输出只公开 `-o, --output`；compress 和 motion 都支持 `-q, --quality`；列表只接受 repeatable；workspace 的 output 直接指定最终 targetDir，支持适用的 dry-run/yes/force，force 只覆盖计划生成文件且不删除或覆盖其他文件，目标为普通文件时仍拒绝；compress/motion 保持预览、确认、dry-run 和 force 的区分；旧 `--out`、motion `--overwrite` 和逗号列表失败。
- 可动文件范围：`src/cli/options.ts`、`commands/compress.ts`、`motion.ts`、`workspace.ts`、`src/core/workspace/*` 和必要 motion/compress 输入类型；相关 CLI/core 测试。
- 依赖：Milestone-3。
- 固有风险：父命令和子命令选项不能重复注册导致覆盖；`--yes` 不得隐式获得覆盖权限。

- [ ] 先写选项冲突、repeatable、输出路径和写入组合测试。
- [ ] 用共享定义替换散落声明，接入 workspace 输出计划。
- [ ] 验证 dry-run 无写入、yes 仍需 force 才能覆盖。

### Task-2

分离全局 Doctor、token Doctor 和 WCAG（来源：User Stories 1、2）

- 验收标准：顶层 doctor 无文件/contrast/profile/night 选项且不依赖 main；token doctor 只负责 workspace/resource/identity；token wcag 独立处理对比度和 `--night`；motion doctor 通过 `-f, --file <dir>` 接收可选帧目录，不再接受位置参数；旧 doctor 跨域参数返回参数错误并提示新命令；模块 compress/motion doctor 的其余行为保持。
- 可动文件范围：`src/cli/commands/doctor.ts`、`token.ts`、`motion.ts`、`src/core/doctor/*` 的必要编排接口；`cli-doctor.test.ts`、`cli-motion.test.ts`、`doctor-runner.test.ts`、`doctor-contrast-score.test.ts`。
- 依赖：Milestone-2，且必须在 Milestone-4 Task-1 完成后执行。
- 固有风险：通用工具链和 workspace findings 的 JSON/status 退出码必须保持一致，不能因拆命令而丢失诊断。

- [ ] 将共享诊断渲染与命令作用域分离。
- [ ] 删除跨域选项及隐藏 `--theme` 兼容路径。
- [ ] 分别验证 text/json/status/verbose 和错误退出码。

> [!IMPORTANT]
> Milestone-4 闸门：主代理运行核验基线并抽查所有输出命令的 `--output` 与写入组合；未通过不进入 Milestone-5。

## Milestone-5

分层 Markdown 手册、可视化手册映射与文档同步

- 验证主题：每个命令路径都能获得当前范围的结构化 Markdown；网页手册、README、SPEC 和项目指引只描述新范式；开发运行与构建 CLI 一致。
- 核验基线：`bun test tests/cli-manual.test.ts tests/manual-loader.test.ts tests/manual-app.test.ts tests/build-cli.test.ts tests/cli-command-shape.test.ts && pnpm build && pnpm typecheck`。
- 来源：User Stories 5、6；Implementation Decisions 18–20。

### Task-1

实现分层 Markdown 手册运行链路和构建打包（来源：User Story 5）

- 验收标准：根、模块、命令组和叶子命令均支持 `-m`；输出包含适用范围、用法、命令/参数、默认行为、示例和相关命令；无 ANSI、交互、服务或业务副作用；`wave manual` 仍启动网页；构建后的 CLI 不依赖仓库当前目录即可输出相同手册。
- 可动文件范围：`src/cli/manual-markdown.ts`、`registry.ts`、`index.ts`、`options.ts`、`scripts/build-manual.ts`、`scripts/build-cli.ts`、手册内容索引；`cli-manual.test.ts`、`build-cli.test.ts`。
- 依赖：Milestone-4。
- 固有风险：开发时读取源码目录的方案在单文件构建后可能失效；`-m` 必须在默认 action 和交互之前短路。

- [ ] 为每个层级和构建产物手册可用性建立测试。
- [ ] 实现命令路径到内容范围的解析与构建时打包。
- [ ] 验证文档模式与业务参数组合时无任何业务副作用。

### Task-2

重梳手册内容并同步所有公共文档（来源：User Stories 5、6；主代理负责）

- 验收标准：手册覆盖完整新命令树、任意目录源文档、自定义输出发现边界、写入 flags、Doctor 边界和 motion 格式；网页导航可找到相同内容；README/SPEC/CLAUDE 不再出现旧命令和矛盾输入合同；文档无 Emoji。
- 可动文件范围：`manual/pages/*`、`manual/manual.config.yaml`、`README.md`、`docs/SPEC.md`、`CLAUDE.md`、相关 manual loader/app 测试。
- 依赖：Task-1。
- 固有风险：不能只替换命令字符串而保留旧 profile/main-only 语义；SPEC 是行为快照，不得写成未来蓝图。

- [ ] 按命令层级整理手册内容并建立网页映射。
- [ ] 更新快速开始、命令索引、token、资源、素材、工具链和故障排查。
- [ ] 全库检索旧命令与旧 flags，确认仅历史材料或明确拒绝说明可以保留。

> [!IMPORTANT]
> Milestone-5 闸门：主代理在开发与构建产物中各抽查根/token/new/night/migrate extensions 手册，并运行核验基线。

## Milestone-6

完整交付验证与发版记录

- 验证主题：完整仓库质量门、真实 consumer 和构建产物均符合新 CLI 合同。
- 核验基线：`pnpm check:ci && pnpm bench:smoke`；运行 `bun test tests/profile-orca-canary.test.ts`，若本机 Orca 可用则按其真实仓库流程执行全 profile canary，不添加全局平台覆盖。
- 来源：全部 User Stories；Testing Decisions。

### Task-1

执行交付审计和真实 consumer 验证（来源：Problem Statement 与全部 User Stories）

- 验收标准：完整质量门通过；Quality Harness 等价性不受 CLI 改名影响；真实 Orca main/profile/Night 输出和跳过规则保持；新增 minor changeset；工作树只包含本计划相关变更。
- 可动文件范围：`.changeset/*`、为修复最终验证发现的问题所必需且已在前述范围声明的文件、本计划文档。
- 依赖：Milestone-5。
- 固有风险：真实 consumer 不可用时必须明确报告未执行，不能以 hermetic 测试冒充；任何行为修复仍需回到对应里程碑补回归。

- [ ] 主代理运行完整质量门和构建产物 smoke。
- [ ] 主代理运行 Orca canary 或明确记录环境阻塞。
- [ ] 添加 minor changeset，更新计划状态并完成最终差异审计。
