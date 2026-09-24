---
class: material
ingested: true
metadata: ~
---

# Design Token 历史兼容裁剪设计

Date: 2026-07-28
Status: 已批准方案，待书面规格审阅
Target: Wave 0.22.0

## 背景

Wave 0.21.0 已将 `main.yaml::$config` 建立为 design-token 主入口，但仍保留完整的 `themefile` 兼容链：旧文件解析、无 `main.yaml` 时的 RESOURCE 直出、顶层 `create` / `init` 命令、双文件 fixture 和 legacy benchmark 模式。

这条兼容链直接影响 v0.21.0 的 resource loading 设计。主链路需要宽松收集资源，让有效 token 图决定 build 是否成功；legacy fallback 则必须严格校验 palette 和 dimension，再从资源合成 token tree。两种输入模型迫使 pipeline 同时维护不同的加载、校验和生成语义。

`themefile` 已基本弃用。本迭代执行一次明确的 breaking cutover，不再延长过渡期。

## 目标

- 将 `main.yaml::$config` 设为唯一 design-token 项目入口。
- 删除 `themefile` 和无 `main.yaml` RESOURCE 直出链路。
- 删除由旧入口产生的 CLI、fixture、测试、benchmark 和文档负担。
- 保留现代主链路的行为覆盖，不以删除测试换取通过。
- 统一 Build、Doctor 和 WCAG 的入口识别及失败语义。
- 在独立节点修复审计发现的高风险生成问题。

## 非目标

- 不删除真实 Orca 输入仍使用的 DTCG color fallback、legacy color wrapper 或 `currentColor` 兼容。
- 不重构 transformer 的 color shape classification。
- 不合并 resolver 的 external/internal recursive walker。
- 不删除 `wave design-token`、顶层 `wave show` 或其它与 `themefile` 无直接耦合的命令和 alias。
- 不在本迭代决定 JSONC composite 的最终结构。
- 不自动迁移或修改用户项目。

## 产品入口

### 保留

- `wave dt` 与 `wave design-token` 保持等价。
- `wave dt build` 默认读取当前目录的 `main.yaml`。
- `wave dt init` 只创建 `main.yaml` 主入口及当前模板所需文件。
- `wave dt doctor` 检查 design-token workspace。
- `wave dt wcag` 检查 default profile、named profile 或对应 night overlay。
- `wave dt show` 与顶层 `wave show` 继续浏览 resource。
- 顶层 `wave doctor` 继续承担通用工具链检查。仅当命令带 `--file` 或 `--contrast` 时，design-token 检查部分遵循本设计的 main-only 输入合同。

### 删除

- 顶层 `wave create`。
- 顶层 `wave init`。
- `themefile` parser 和所有 public re-export。
- 无 `main.yaml` 时从 palette + dimension 直接生成 token 的 fallback。
- `dt init` 生成或预检 `themefile` 的行为。
- Quality Harness 的 `themefile-legacy` entry kind、suite 和 case。
- 通用 fixture loader 对 `themefile` 的强制要求和自动生成。

`wave theme`、`wave list`、`--output`、`platform=general` 和资源更新参数 alias 不属于本次 cutover。后续如需删除，应单独取得产品合同和使用证据。

## Workspace 输入合同

### 入口解析

无显式文件时，design-token 命令只解析 `<cwd>/main.yaml`。Wave 不探测 `themefile`，也不从 resource、profile 或目录推断项目入口。

显式文件通过位置参数或 `-f, --file` 传入时，入口必须满足：

- 路径指向普通文件。
- 文件名为 `main.yaml`。
- YAML 根为 object。
- 根包含有效的 `$config` object。

名为 `main.yaml` 且最终指向普通文件的 symlink 可以作为入口。resource 和输出相对路径继续以用户传入的 symlink 所在目录为 workspace 基准，不能因解析 realpath 改变项目语义。

`main.yaml::$config` 使用闭合 schema：

- `theme` 必填，值为 trim 后非空字符串。
- `resource` 可选，值为 object；只允许 `palette`、`dimension`、`custom`，每项为非空字符串或非空字符串数组。
- `parameter` 可选，值为 object；只允许 `outputDir`、`platform`、`filterLayer`、`colorSpace`。
- `parameter.outputDir` 为非空字符串。
- `parameter.platform` 为非空数组，成员只能是 `json`、`jsonc`、`css`、`sketch`。
- `parameter.filterLayer` 为大于等于 0 的整数。
- `parameter.colorSpace` 只能是 `hex`、`oklch`、`srgb`、`hsl`。
- `parameterGroup` 可选，值为 group name 到 parameter object 的 object；每个 group 使用相同的闭合 parameter schema。
- `$config`、`resource`、`parameter` 或 parameter group 中的未知字段、错误类型、空字符串和混合类型数组均返回 `FORMAT_ERROR`，错误包含字段路径。

profile 的 `$config` 继续遵循 profile inheritance 合同：不得用本地 `theme` 改写项目名，可覆盖或追加的字段由现行 profile schema 决定。本次 cutover 不借 main schema 收紧扩大 profile 行为。

named profile 和 night overlay 只能通过 `--profile`、`--profiles all` 和 `--night` 选择。`wave dt wcag [scope]` 的 `scope` 保持现行 profile 选择语义，不是文件位置参数；`scope=main` 选择 default profile，其它值选择同名 profile。profile 和 night 文件不能充当 workspace 入口。

`dt build` 的文件位置参数和 `--file` 同时出现时，命令返回 `INVALID_PARAMETER`，不自行选择优先级。`dt wcag <scope> --file ./main.yaml` 合法：`scope` 选择 profile，`--file` 选择 workspace 入口。

### 拒绝矩阵

Build、design-token Doctor 和 WCAG 对 workspace 文件共用以下入口分类。矩阵中的“位置参数”只指 `dt build` 的文件位置参数，不包括 WCAG profile scope：

| 输入 | 结果 |
| --- | --- |
| 省略输入且 `<cwd>/main.yaml` 不存在 | `FILE_NOT_FOUND` |
| 显式路径不存在 | `FILE_NOT_FOUND` |
| `themefile` | `INVALID_PARAMETER` |
| 目录 | `INVALID_PARAMETER` |
| resource 文件 | `INVALID_PARAMETER` |
| `profiles/<name>.yaml` | `INVALID_PARAMETER` |
| `main@night.yaml` 或 profile night 文件 | `INVALID_PARAMETER` |
| 文件名不是 `main.yaml` 的任意 YAML | `INVALID_PARAMETER` |
| `main.yaml` 无法读取且不是不存在 | `GENERAL_ERROR` |
| `main.yaml` YAML 语法错误 | `FORMAT_ERROR` |
| `main.yaml` 缺少或包含无效 `$config` | `FORMAT_ERROR` |
| 位置参数与 `--file` 同时提供 | `INVALID_PARAMETER` |

错误信息必须包含被拒绝路径、失败原因和现代入口提示。对旧入口的提示统一指向 `main.yaml` 和 `wave dt init`，不提供自动 fallback。

Doctor 命令按以下边界工作：

- `wave doctor`、`wave doctor --json`、`wave doctor --status` 和 `wave doctor --verbose` 保持通用工具链诊断，不要求当前目录存在 `main.yaml`。
- `wave doctor --file <path>` 在通用诊断之外检查指定 workspace，文件必须符合 main-only 输入矩阵。
- `wave doctor --contrast` 进入 design-token contrast 检查；没有 `--file` 时默认使用 `<cwd>/main.yaml`。
- `wave dt doctor` 默认检查 `<cwd>/main.yaml`；`--file` 只能指定合法 `main.yaml`。
- `wave dt doctor` 和 `wave doctor --file` 默认只严格检查 default profile 的 resource 声明；`--profile <name>` 只检查显式选择的 profile。本迭代不增加 all-profile Doctor scan。
- 任何显式 `--file` 都先执行入口校验，再决定 text 或 JSON renderer。`wave doctor --json --file ./themefile` 因而返回 `INVALID_PARAMETER`，不能绕过文件合同。
- `wave dt doctor` 的所有 renderer 都先校验默认或显式 workspace。`wave dt doctor --json` 在当前目录缺少 `main.yaml` 时返回 `FILE_NOT_FOUND`，不能退化为仅输出通用 toolchain JSON。

### 失败副作用

本次 cutover 新增的入口拒绝或 `main.yaml` 解析失败时：

- 不创建新的输出文件。
- 不覆盖已有输出文件。
- 已有输出文件内容保持字节不变。
- CLI 可以输出诊断和 receipt；“零输出”只指零新增或修改的生成产物。

## Pipeline 边界

### Workspace loader

将当前 `loadThemefile()` 收敛为 main-only workspace loader。loader 负责：

- 展开并校验输入路径。
- 读取 `main.yaml`。
- 解析 `$config`。
- 从 token document 移除 `$config` 后，把配置和 token 内容交给后续阶段。

loader 不解析旧文本指令，不读取相邻 `themefile`，也不根据扩展名切换输入模型。

### Resource loading

Build 保留 v0.21.0 的 reference-gated contract：

- `$config.resource` 可省略。
- Build 尝试加载声明，但只在有效 token 图引用缺失或歧义 namespace 时失败。
- Doctor 严格检查其目标 workspace 中的全部 resource 声明。
- RESOURCE 只提供引用解析数据，不直接生成 token。

删除 legacy fallback 后，`buildDependencyDictionary()` 不再承担 palette + dimension 直出的 build 分支。若 Doctor 仍需要严格 validation，函数应以 Doctor 语义命名和归属，避免被主 build 误用。

### Generation

删除 `generateThemeTokens()` 及其 synthetic palette/dimension tree。所有格式只接收从 `main.yaml` token document 解析、resolve 和 transform 后的 token。

generator 不感知 workspace 文件类型，也不承担 legacy 输入判断。

## CLI 与帮助

- command registry 移除顶层 `create`、`init` 及无读取方的对应 legacy metadata。
- `wave dt` 与 `wave design-token` 的 help、参数、错误码、stdout/stderr 和 receipt 保持等价。
- 所有 design-token `--file` help 只描述 `main.yaml`。
- `dt init` 的成功输出只列出实际创建的现代文件。
- 顶层 help、manual 和 `docs/SPEC.md` 不再展示 `themefile`、RESOURCE 直出或 `wave create` 作为可用路径。
- 保留的 `wave theme` 迁移提示改为指向 `wave dt`，不能继续提示已删除的 `wave create`。

## Fixture 与 Quality Harness

### Fixture 迁移

含 `themefile` 的 fixture 不能按文件存在性批量删除。实施计划必须先建立可审计迁移表。迁移表逐项列出被删除的 test / fixture / benchmark case、原行为、正向或负向合同、替代 test / fixture，以及只属于 legacy 因而无需替代的理由。没有映射的测试不能删除。

迁移表至少覆盖以下非 legacy 行为，并把它们写入 main-only fixture：

- GROUP / `parameterGroup` pass。
- resource 引用和内部引用。
- `$extends`。
- colorSpace。
- CSS、JSON、JSONC 和 Sketch 输出。
- profile、Night 和 WCAG。
- `inheritColor` 与 Wave extensions。

迁移后的测试必须断言输出语义，而不只断言 `result.ok` 或文件存在。对输出合同，保留迁移前代表性 artifact 的结构断言或 hash 基线；对负向合同，保留错误类型、token path 和退出码断言。

只保留一个面向旧入口的拒绝合同组，覆盖 `themefile`、no-main workspace 和禁止的显式文件类型。拒绝测试断言退出码、迁移提示和已有产物字节不变。

### Benchmark

- 删除 `themefile-legacy` entry kind 和四个 legacy case。
- 将仍有价值的 case 转为 `main-config`，不得只因旧入口消失而丢失真实行为或规模覆盖。
- 保留 `orca-realistic`、profile、synthetic 和其它 example-derived case。
- case registry 变化后使用 `pnpm bench:baseline` 生成同一 registry 的本地 baseline。`benchmarks/.results/` 保持 ignored，不把本地报告提交为产品真源。
- compare mode / case-version mismatch guard 属于独立 Quality Harness 节点，不与 themefile cutover 混入一个提交。该节点实施前需另定结构化状态和错误文案。
- `new`、`missing`、`changed` 和 `regressed` artifact 均保持失败语义。

## 文档真源

- `docs/SPEC.md` 更新为 cutover 后的当前行为。
- `manual/` 只描述 `main.yaml` 主入口，并用有效 YAML 展示 `parameterGroup`。
- `docs/research/handoff.md` 保留历史内容，只追加 cutover 结果和现行真源链接，不把旧决策改写成从未存在。
- `docs/research/dtcg-color-legacy-compatibility.md` 继续记录独立的 color compatibility，不因 `themefile` 移除而删除。
- 发布使用 Changesets。本实现创建 `"wave": minor` changeset，文案明确 `themefile`、RESOURCE 直出和顶层 `create/init` 已移除，并给出 `main.yaml` / `wave dt init` 迁移方向。
- `0.22.0` 是发布目标，不在实现提交中直接修改 `package.json`。只有独立 release 流程执行 `pnpm changeset version`。

## 后续质量节点

这些节点不与 `themefile` cutover 混成一个实现提交。每个节点独立测试、提交和 gate。

### Unknown platform

pipeline 在 formatter 执行前规范化 platform 列表。未知 platform、空列表或去重后没有有效 platform 时，build 返回失败；禁止 `success: true` 且 `files: []`。

### GROUP 输出碰撞

在首次写入前规划所有 pass 的最终输出路径。两个 pass 可能写入同一文件时，build 返回失败。碰撞判断基于最终文件路径，不使用当前不完整的 `outputDir + platform list` warning key。

### 多文件写入原子性

当前多文件写入可能在中途失败后留下部分产物。跨多个路径的发布与回滚不存在天然原子性，不能只用临时文件和 rename 宣称已解决。本问题保留为独立可靠性设计：先定义 staging、旧文件备份、发布日志、回滚失败和恢复提示合同，再进入实施。它不属于本规格后续实施计划的已批准节点。

### JSONC composite

JSON 与 JSONC 的 composite shape 当前不一致。该问题可能影响现有 consumer，需独立确定输出合同后实施，不阻塞前述三个节点。

## 验收

### Cutover

- 仓库源码、测试、fixture、benchmark、SPEC 和 manual 中不再把 `themefile` 当作受支持输入。
- 受支持入口的源码、help、SPEC、manual、fixture loader 和 benchmark registry 不再包含 `themefile` 分支；历史 research、changeset/changelog 和拒绝合同可继续出现该词。
- `wave dt` 与 `wave design-token` 只从 `main.yaml` 进入。
- 顶层 `wave create`、`wave init` 不再注册。
- Build、Doctor、WCAG 通过完整拒绝矩阵。
- 拒绝矩阵中的失败路径保持已有产物字节不变。
- main-only fixture 保留迁移前的非 legacy 行为覆盖。
- Quality Harness 不再包含 legacy entry mode；本地 default-mode baseline 与当前 default-mode case registry 一致。stress mode 不属于 `pnpm bench:baseline` 的比较集合。
- 实施计划包含完整 test / fixture / benchmark 迁移表，且每个删除项都有替代覆盖或 legacy-only 理由。
- `pnpm changeset status` 识别一个面向 `wave` 的 minor changeset；实现阶段的 `wave --version` 仍为 `0.21.0`。

### 直接验证

- `pnpm typecheck`
- `bun test`
- `pnpm check:style`
- `pnpm manual:build`
- `pnpm bench:smoke`
- main-only CLI build smoke，覆盖 CSS 与 Sketch。
- 真实 Orca smoke 固定读取 `/Users/teatao/Projects/my-color/orca/main.yaml`，使用 default profile，CSS 与 Sketch 输出写入 `mktemp -d` 创建的任务临时目录。验证前后对 Orca 输入文件执行 hash 清单比较，并在完成后清理任务临时目录；不得写入 Orca 项目目录。
- 拒绝 `themefile` 的 CLI smoke，确认旧输出文件哈希不变。

每个实现节点完成直接验证后，使用 `critic-gate` 检查规格忠实度、回归和隐藏合同风险。

## 实施边界

Cutover、unknown platform 和 GROUP collision 分别构成独立可回滚节点。多文件写入可靠性需要独立设计，JSONC composite 需要独立产品决策；两者都不阻塞已批准节点。

本规格批准后先形成逐文件实施计划。实施遵循 TDD、原子化提交、节点直接验证和节点 `critic-gate`，最终再执行全量验证与总体验收。
