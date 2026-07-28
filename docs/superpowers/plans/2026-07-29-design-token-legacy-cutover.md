# Design Token 历史兼容裁剪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Wave 0.22.0 完整移除 `themefile` 与 RESOURCE 直出，同时修复无效 platform 成功零产物和跨 pass 输出覆盖。

**Architecture:** 使用闭合 `$config` validator 和 main-only workspace loader 统一 Build、Doctor、WCAG 的入口合同。Build 保留 reference-gated resource collection，Doctor 使用独立严格 resource validator。生成侧先规划单 pass 输出，再在 service 层汇总全部实际 day/profile/night pass，以最终文件路径做全局碰撞检查。

**Tech Stack:** TypeScript strict mode、ESM、Bun、Zod 4、Commander、js-yaml、pnpm、Changesets。

---

## 基线

- Approved spec: `docs/superpowers/specs/2026-07-28-design-token-legacy-cutover-design.md`
- Current version: `0.21.0`
- Design commit: `3dc8b2f`
- 用户已有 `.gitignore` 修改不属于本计划，所有 staging 必须显式列文件。
- DTCG color fallback、legacy color wrapper、`currentColor`、顶层 `wave show`、`wave design-token` 均保留。
- 多文件写入可靠性与 JSONC composite 合同不在本计划实施范围。

## 里程碑

1. **M1 Main-only cutover**：Task 1-7。Build、Doctor、WCAG 只接受 `main.yaml`；legacy parser/fallback/CLI/benchmark 清零；现代 fixture 行为覆盖不倒退。
2. **M2 Platform validation**：Task 8。unknown、empty platform 在 formatter 与写入前失败，合法 platform trim + stable dedupe。
3. **M3 Global output planning**：Task 9。所有实际 day/profile/night pass 在首次写入前按最终路径预检，碰撞直接失败。
4. **Final release readiness**：Task 10。全量 gate、真实 Orca 只读 smoke、changeset 和最终 critic-gate。

同一里程碑内仅并行文件集不重叠的工作：

- M1 Wave A：Task 1 与 Task 2 并行。
- M1 Wave B：Task 5 与 Task 6 并行；前置 Task 1-4 必须完成。
- Task 3、Task 4、Task 7、M2、M3 串行。
- 并行 worker 不提交 Git；主代理按 task 边界显式 staging 和提交。

## M1 迁移映射

实施前后都以此表核对测试覆盖。没有映射的 legacy test / fixture 不得删除。

| 旧工件 | 现代行为 | 迁移或删除 |
| --- | --- | --- |
| `tests/fixtures/themes/standard` | resource 引用、color alpha、shadow、dimension、JSON/CSS | main.yaml 加闭合 `$config`，保留 artifact 断言 |
| `tests/fixtures/themes/ref-test` | internal/external ref、alpha、链式引用 | main-only，保留 resolver artifact 断言 |
| `tests/fixtures/themes/extends-test` | `$extends`、JSON/CSS/Sketch | main-only，保留三平台断言 |
| `tests/fixtures/themes/inherit-color` | inheritColor/currentColor、三平台 | main-only；删除 token tree 中伪 `themefile` metadata |
| `tests/fixtures/smooth-gradient` | smoothGradient JSON/CSS | main-only，保留 artifact 值 |
| `tests/fixtures/themes/doctor-contrast-*` | WCAG pass/report/invalid/empty/profile/night | main-only；按 scope/profile/night 继续断言 |
| `tests/fixtures/baseline-independent` | 默认 build 不自动发现 night/variant | 行为已由 `config-main`/profile tests 覆盖，删除旧 create fixture |
| `tests/fixtures/baseline-fallback` | main parse/ref fail-fast | 映射到 main-only rejection tests，删除旧 create fixture |
| `tests/fixtures/themes/legacy-no-main` | RESOURCE 直出 | 纯 legacy 成功路径删除；统一拒绝矩阵用临时输入 |
| `tests/fixtures/{alias,alias-filter1,full,minimal}` | 未使用旧入口 | 整组删除 |
| `tests/themefile-group-parser.test.ts` | 文本 GROUP parser | 纯 legacy 删除；parameterGroup schema 由 workspace loader tests 覆盖 |
| `tests/themefile-resource-parser.test.ts` | 文本 RESOURCE parser | 纯 legacy 删除；custom validation 迁到 Doctor validator tests |
| `tests/themefile-group-pipeline.test.ts` | parameter merge/pass | 重命名 `parameter-group-pipeline.test.ts`，改新 config 类型 |
| `tests/theme-command-current-*.test.ts` | 顶层 create | 删除；非 legacy 断言迁入 dt/integration tests |
| `tests/cli-binary-resource.test.ts` | binary 对外入口的 resource build | 改为 `dt build -f .../main.yaml`，保留真实子进程和 artifact 断言 |
| `tests/resource-cache.test.ts` | cache 优先级参与 token build | 临时 workspace 改写 `main.yaml::$config.resource`，保留 cache/builtin 选择断言 |
| `tests/smooth-gradient-output.test.ts` | smoothGradient JSON/CSS artifact | 改为 `dt build -f .../main.yaml`，保留精确输出值断言 |
| 4 个 `themefile-legacy` benchmark case | standard/ref/extends/inherit 行为与规模 | 同 id 转 `main-config`，`caseVersion: 2`，进入 default suite |

### Task 1: 建立闭合 Main Config 与 Workspace Loader

**Files:**
- Create: `src/core/validator/design-token-config.ts`
- Create: `src/core/pipeline/workspace-loader.ts`
- Create: `tests/design-token-config.test.ts`
- Create: `tests/workspace-loader.test.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: 先并行定义中性内部模型**

在现有 `ParsedThemefile` 旁新增：

```ts
export interface DesignTokenBuildConfig {
	theme: string;
	parameter: ParameterSet;
	resources: ResourceDeclaration[];
	parameterGroups: ParameterGroup[];
}

export interface ParameterGroup {
	name: string;
	parameter: ParameterSet;
}
```

本 task 不修改或 alias 现有 `ParsedThemefile`，因此旧 pipeline 继续 typecheck。Task 7 在全部 consumer 迁移完成后删除旧 interface。

- [ ] **Step 2: 写 config validator 失败测试**

`tests/design-token-config.test.ts` 覆盖：

```ts
expect(validateMainConfig({ theme: 'orca' }).ok).toBe(true);
expect(validateMainConfig({ theme: ' ', plaform: ['css'] })).toMatchObject({
	ok: false,
	exitCode: ExitCode.FORMAT_ERROR,
});
expect(validateMainConfig({ theme: 'orca', parameter: { platform: 'css' } }).ok).toBe(false);
expect(validateMainConfig({ theme: 'orca', resource: { custom: [42] } }).ok).toBe(false);
```

同时覆盖 `outputDir` 非空、platform enum/non-empty array、`filterLayer` 非负整数、colorSpace enum、parameterGroup 使用同一闭合 parameter schema，错误文案包含 Zod issue path。

- [ ] **Step 3: 运行失败测试**

Run: `bun test tests/design-token-config.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现纯 validator**

使用 Zod `.strict()`，返回归一化后的内部模型：

```ts
export type MainConfigValidationResult =
	| { ok: true; config: DesignTokenBuildConfig }
	| { ok: false; exitCode: typeof ExitCode.FORMAT_ERROR; message: string };

export function validateMainConfig(value: unknown): MainConfigValidationResult;
```

`parameter.platform` array 在 validator 内归一化为 downstream 现有 `ParameterSet.platform` 逗号字符串；`outputDir` 映射为 `parameter.output`。resource string/string[] 展开为 `ResourceDeclaration[]`。未知字段 fail closed。

- [ ] **Step 5: 写 workspace loader 失败测试**

`tests/workspace-loader.test.ts` 使用 temp dir 覆盖：默认 cwd、显式 main、ENOENT、目录、非 main YAML、resource/profile/night、坏 YAML、缺 `$config`、不可读文件（平台允许时）、symlink main。断言精确 `exitCode`、被拒绝路径和迁移提示。

成功结果固定为：

```ts
export interface LoadedDesignTokenWorkspace {
	path: string;
	workspaceDir: string;
	config: DesignTokenBuildConfig;
	tokenContent: string;
}

export type WorkspaceLoadResult =
	| { ok: true; workspace: LoadedDesignTokenWorkspace }
	| { ok: false; exitCode: ExitCodeType; message: string; path: string };
```

- [ ] **Step 6: 实现 main-only loader**

`loadDesignTokenWorkspace(input?: string, cwd = process.cwd())`：

1. 默认 `<cwd>/main.yaml`。
2. 展开 `~/` 与 `${HOME}/`。
3. supplied basename 必须为 `main.yaml`。
4. `fs.stat()` 必须是 regular file；symlink 最终指向 regular file可接受，但 `workspaceDir` 使用 supplied path dirname。
5. `ENOENT -> FILE_NOT_FOUND`，其它读错误 `GENERAL_ERROR`。
6. js-yaml 语法错误和 `$config` schema 错误 `FORMAT_ERROR`。
7. 删除 root `$config`，用 `yaml.dump(..., {lineWidth: -1})` 生成 `tokenContent`。

- [ ] **Step 7: 验证与提交**

Run:

```bash
bun test tests/design-token-config.test.ts tests/workspace-loader.test.ts
pnpm typecheck
pnpm check:style
```

Expected: PASS。

Commit: `refactor(dt): add validated main workspace model`

### Task 2: 迁移 Fixtures 与测试工具到 Main-only

**Files:**
- Modify: `tests/fixtures/themes/standard/main.yaml`
- Modify: `tests/fixtures/themes/ref-test/main.yaml`
- Modify: `tests/fixtures/themes/extends-test/main.yaml`
- Modify: `tests/fixtures/themes/inherit-color/main.yaml`
- Modify: `tests/fixtures/smooth-gradient/main.yaml`
- Modify: `tests/fixtures/themes/doctor-contrast-*/main.yaml`
- Test: existing fixture-driven integration and CLI tests

- [ ] **Step 1: 为现代 fixture 补齐闭合 `$config`**

按迁移表转换 11 个承载现代行为的 main 文件。每个 main 增加以下结构，字段值与相邻旧配置保持等价：

```yaml
$config:
  theme: <name>
  resource:
    palette: <palette>
    dimension: <dimension>
  parameter:
    platform: [<platforms>]
    colorSpace: <colorSpace>
theme:
  # rendered tokens
```

本 task 只修改 fixture 内容；现有集成/CLI tests 继续作为行为验证，不在并行 worker 中改测试代码，避免与后续 consumer 迁移交叉 ownership。

- [ ] **Step 2: 暂时保留旧文件保证当前主链路绿色**

本 task 不删除任何 `themefile`、不修改 `TestTheme`、不重命名 tests。旧文件只作为 Task 7 前的临时兼容旁路；最终删除边界不变。

- [ ] **Step 3: 验证 fixture 行为未变并提交**

Run:

```bash
bun test tests/integration/theme-service.test.ts tests/cli-dt.test.ts tests/cli-doctor.test.ts tests/profile-resolver.test.ts
pnpm typecheck
```

Expected: tests PASS；旧入口与新 main config 在 Task 4 前仍产生等价现代输出。

Commit: `test(dt): migrate fixtures to main-only workspaces`

### Task 3: 分离 Build 宽松资源收集与 Doctor 严格校验

**Files:**
- Create: `src/core/doctor/resource-validator.ts`
- Create: `tests/doctor-resource-validator.test.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `tests/resource-merge.test.ts`

- [ ] **Step 1: 将 strict tests 迁入 Doctor validator**

保留 `collectDependencyDictionary()` 的 empty/missing/duplicate tolerant tests，并把 helper input type 从 `ParsedThemefile` 改为 `Pick<DesignTokenBuildConfig, 'resources'>`。把 unknown kind、invalid custom extension、palette/dimension schema 和 duplicate namespace strict cases 改为：

```ts
const result = await validateDeclaredResources(config, workspaceDir);
expect(result.ok).toBe(false);
expect(result.message).toContain('Unsupported resource kind');
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test tests/doctor-resource-validator.test.ts tests/resource-merge.test.ts`

Expected: FAIL，新模块不存在。

- [ ] **Step 3: 实现 Doctor validator**

```ts
export type DeclaredResourceValidationResult =
	| { ok: true; dictionary: DependencyDictionary }
	| { ok: false; message: string };

export async function validateDeclaredResources(
	config: Pick<DesignTokenBuildConfig, 'resources'>,
	workspaceDir: string,
): Promise<DeclaredResourceValidationResult>;
```

先校验 kind/custom extension，再调用 `collectDependencyDictionary()`，再对 loaded palette/dimension 执行 schema validation。本 task 保留 `theme-pipeline.ts` 现有 `buildDependencyDictionary()` 实现作为冻结的临时兼容 API，避免从 pipeline 反向 import Doctor 模块造成循环依赖；尚未迁移的 CLI 与 benchmark 可继续 typecheck。Task 7 在所有 consumer 完成切换后删除旧实现。Build 主链路在 Task 4 改为只使用 tolerant collector。

- [ ] **Step 4: 验证与提交**

Run:

```bash
bun test tests/doctor-resource-validator.test.ts tests/resource-merge.test.ts
pnpm typecheck
```

Expected: PASS。

Commit: `refactor(doctor): isolate strict resource validation`

### Task 4: Cut Over Build Pipeline 并删除 Resource Fallback

**Files:**
- Modify: `src/core/pipeline/theme-service.ts`
- Modify: `src/core/pipeline/profile-resolver.ts`
- Modify: `src/types/index.ts`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: 先把现代正向 tests 改为 main-only**

所有 `generateTheme()` 正向输入从 `theme.themefile` 改为 `theme.mainYaml`。ref/extends/inherit/colorSpace/Sketch/Night tests 必须继续断言 artifact 内容，不只断言文件存在。

新增 service-level `legacy input is rejected without touching existing artifacts` representative cases：预置输出 marker，传 themefile/非 main YAML/不存在路径，断言精确 exit code、路径、`main.yaml`/`wave dt init` 提示和 marker bytes 不变。完整入口矩阵由 workspace loader 单元测试与 Task 5 的三个 CLI 入口表驱动测试覆盖。

- [ ] **Step 2: 运行 focused tests 确认当前行为失败**

Run:

```bash
bun test tests/integration/theme-service.test.ts
```

Expected: legacy rejection cases FAIL。

- [ ] **Step 3: 将 service 接到 workspace loader**

`ThemeGenerationInput` 改为：

```ts
export interface ThemeGenerationInput {
	workspacePath?: string;
	/** Temporary compatibility until Task 7. */
	themeName?: string;
	/** Temporary compatibility until Task 7. */
	themePath?: string;
	cliOutput?: string;
	cliPlatform?: string;
	generateOptions: GenerateOptions;
}
```

`generateTheme()` 用 `workspacePath ?? themePath` 调 loader，并直接使用 loader 返回的 `workspace.config.theme`、`workspace.workspaceDir` 和 `workspace.tokenContent`；旧 `themeName` 不再决定项目名，仅作为暂存的 type compatibility field。load failure 原样返回结构化 exit code，禁止 message substring 映射。Task 7 在 CLI 与 benchmark 均改传 `workspacePath` 后删除两个兼容字段。

- [ ] **Step 4: 删除 fallback**

`generatePass()` 无条件处理 token document。删除 `MAIN_FALLBACK_WARNING`、warning state/callback、`hasMainDocument`、palette/dimension pair gate、`generateThemeTokens()`、fallback-only imports/tests/receipt assertions。

- [ ] **Step 5: 更新 profile 与参数模型**

Build service 与 profile resolver 的新路径改用 `DesignTokenBuildConfig` 的 `theme/parameter/parameterGroups`。named profile 继续使用现行 inheritance parser，不调用 main 闭合 schema；main validated config 作为 base config。

为尚未迁移的 Doctor/benchmark consumer 提供显式过渡层：`ProfileParseOptions` 同时接受新 `defaultConfig/baseConfig` 与旧 `defaultParsed/baseParsed`，内部先归一到一个 config；`ProfileDocument` 暂时同时暴露新 `config: DesignTokenBuildConfig` 和旧 `parsed: ParsedThemefile` view。新 service 只读 `config`，旧 consumer 可继续读 `parsed`。Task 5/6 分别迁移 consumer，Task 7 删除旧 options/view/interface。

- [ ] **Step 6: 保持兼容层隔离，禁止新主链回流**

本 task 不删除 `loadThemefile()`、parser、validator barrel、legacy tests、fixture 或上述临时 type adapter；它们仍被未迁移的 CLI/benchmark/test consumer 使用。用 import scan 证明 `theme-service.ts` 已不再依赖 legacy loader/parser/fallback，且 Build 只使用 `loadDesignTokenWorkspace()` 与 `collectDependencyDictionary()`。

- [ ] **Step 7: 验证与提交**

Run:

```bash
bun test tests/integration/theme-service.test.ts tests/profile-resolver.test.ts tests/resource-merge.test.ts
pnpm typecheck
pnpm check:style
```

Expected: PASS；Build service 中不存在 legacy loader/parser/fallback symbol，兼容实现仍暂存供后续 consumer 迁移。

Commit: `refactor(dt): cut build over to main workspace`

### Task 5: Main-only CLI、Doctor、WCAG 与 Init

**Files:**
- Rename: `src/cli/commands/create.ts` to `src/cli/commands/build.ts`
- Rename: `src/cli/commands/init.ts` to `src/cli/commands/dt-init.ts`
- Modify: `src/cli/commands/dt.ts`
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/cli/registry.ts`
- Modify: `tests/cli-dt.test.ts`
- Modify: `tests/cli-doctor.test.ts`
- Modify: `tests/cli-dt-doctor-migration.test.ts`
- Modify: `tests/cli-binary-resource.test.ts`
- Modify: `tests/resource-cache.test.ts`
- Modify: `tests/smooth-gradient-output.test.ts`

- [ ] **Step 1: 写完整 CLI 拒绝矩阵**

`tests/cli-dt.test.ts` table-driven cases 覆盖 themefile、cwd no-main、目录、resource、profile、night、任意非 main YAML、position + `--file`。`tests/cli-doctor.test.ts` 与 WCAG tests 对同一禁止文件表逐项执行，至少分别覆盖 text 与 JSON renderer；另外对 `wave doctor --status --file <invalid>` 和 `--verbose --file <invalid>` 断言同样先返回 workspace 输入错误，并另测 status/verbose 无输入仍保持 toolchain-only。每项预置最终 artifact marker，断言：

```ts
expect(result.exitCode).toBe(expectedExitCode);
expect(`${result.stdout}\n${result.stderr}`).toContain(rejectedPath);
expect(message).toContain('main.yaml');
expect(message).toContain('wave dt init');
expect(await fs.readFile(existingOutput, 'utf8')).toBe('preserve-me');
```

另测 `dt wcag mobile -f main.yaml` 保持合法，scope 只选 profile。workspace loader 单元测试承担完整错误分类，三个 CLI 表驱动测试证明它们没有绕过共享 loader。

- [ ] **Step 2: 写 Doctor renderer tests**

覆盖：

- `wave doctor --json` 在无 main cwd 成功做 toolchain diagnosis。
- `wave dt doctor --json` 在无 main cwd 返回 `FILE_NOT_FOUND`。
- `wave doctor --json --file ./themefile` 返回 `INVALID_PARAMETER`。
- default Doctor 只严格检查 main resources；`--profile mobile` 只检查 mobile。

- [ ] **Step 3: 运行 tests 确认失败**

Run: `bun test tests/cli-dt.test.ts tests/cli-doctor.test.ts tests/cli-dt-doctor-migration.test.ts`

Expected: FAIL，当前 CLI 仍接受 legacy paths/commands。

- [ ] **Step 4: 改 build command grammar**

`createDesignTokenBuildCommand(name = 'build')` 使用 `.argument('[file]', 'main.yaml path')`。position 与 `options.file` 同时存在时设置 `INVALID_PARAMETER` 并返回。只构造 `workspacePath`，不再推断 theme name或探测 themefile。

- [ ] **Step 5: 改 Doctor/WCAG 接线**

所有 design-token renderer 在渲染前调用 workspace loader。顶层 Doctor 只有 `--file`/`--contrast` 进入 workspace；普通 toolchain JSON/status/verbose 不要求 main。WCAG scope 保持 profile 语义。

- [ ] **Step 6: 移除顶层 create/init，保留其它命令**

registry 删除 create/init entry 和未读取 `legacy` metadata，保留 show/doctor。`wave theme` 失败提示改向 `wave dt`。`dt init` 只预检/写 `main.yaml`，不创建 themefile。将 binary resource、resource cache 与 smoothGradient 子进程 tests 改走 `dt build -f main.yaml` 并保留 artifact 语义断言。

dt/design-token 等价测试固定比较：默认 build 成功、无 main 失败、显式拒绝 themefile、doctor JSON、WCAG named profile，以及各自 `--help`；逐项比较 exit code、规范化后的 stdout/stderr 和 receipt 字段。

- [ ] **Step 7: 验证与提交**

Run:

```bash
bun test tests/cli-dt.test.ts tests/cli-doctor.test.ts tests/cli-dt-doctor-migration.test.ts tests/cli-binary-resource.test.ts tests/resource-cache.test.ts tests/smooth-gradient-output.test.ts
pnpm typecheck
```

Expected: PASS。

Commit: `feat(cli)!: enforce main-only design-token entry`

### Task 6: 删除 Legacy Quality Harness Mode，保留行为 Case

**Files:**
- Modify: `benchmarks/shared/types.ts`
- Modify: `benchmarks/design-token/types.ts`
- Modify: `benchmarks/design-token/cases.ts`
- Modify: `benchmarks/design-token/workspace.ts`
- Modify: `benchmarks/design-token/runner.ts`
- Modify: `benchmarks/design-token/equivalence.ts`
- Modify: `tests/quality-harness.test.ts`
- Modify: `benchmarks/README.md`

- [ ] **Step 1: 先改 registry tests**

断言所有 case `entryKind === 'main-config'`、不存在 legacy suite。standard/ref/extends/inherit 四 case 保留相同 id，改 `caseVersion: 2`、default suite，并继续断言代表性 artifact hash/path/bytes。

- [ ] **Step 2: 运行失败测试**

Run: `bun test tests/quality-harness.test.ts`

Expected: FAIL，registry/runner 仍包含 legacy mode。

- [ ] **Step 3: 删除 entry 分支**

`DesignTokenEntryKind` 收敛为 `'main-config'` 或直接删除字段。Prepared workspace 删除 `themefilePath` 和 rewrite function。runner/equivalence 永远使用 `mainYamlPath` 和 `loadDesignTokenWorkspace()`；runner 从临时 `buildDependencyDictionary()` delegate 切到 `collectDependencyDictionary()`，并从 `ProfileDocument.config` 读取新模型，保证 Task 7 可删除旧 delegate/view。

- [ ] **Step 4: 运行 harness tests 与本地 baseline**

Run:

```bash
bun test tests/quality-harness.test.ts
pnpm bench:baseline
pnpm bench:smoke
```

Expected: tests PASS；default-mode baseline 与 default registry 同集合；ignored report 不 stage。

Commit: `refactor(bench): remove legacy design-token mode`

### Task 7: 删除隔离兼容层、同步 Docs 与 Changeset，完成 M1 Gate

**Files:**
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/core/pipeline/theme-service.ts`
- Modify: `src/core/pipeline/profile-resolver.ts`
- Modify: `src/core/doctor/theme-context.ts`
- Modify: `src/core/doctor/registry.ts`
- Modify: `src/core/parser/index.ts`
- Modify: `src/core/validator/index.ts`
- Modify: `src/core/resolver/index.ts`
- Modify: `src/types/index.ts`
- Delete: `src/core/parser/themefile.ts`
- Delete: `src/core/validator/config.ts`
- Modify: `tests/utils/fixture-loader.ts`
- Modify: `tests/utils/fixture-loader.test.ts`
- Rename: `tests/themefile-group-pipeline.test.ts` to `tests/parameter-group-pipeline.test.ts`
- Delete: `tests/themefile-group-parser.test.ts`
- Delete: `tests/themefile-resource-parser.test.ts`
- Delete: `tests/theme-command-current-behavior.test.ts`
- Delete: `tests/theme-command-current-fallback.test.ts`
- Delete: legacy `themefile` files and pure legacy fixture directories listed in the migration table
- Modify: `tests/doctor-theme-context.test.ts`
- Modify: `tests/profile-resolver.test.ts`
- Modify: `docs/SPEC.md`
- Modify: `docs/research/handoff.md`
- Modify: `manual/pages/design-token.md`
- Modify: `manual/pages/design-token-main-yaml.md`
- Modify: `manual/pages/design-token-quality-theming.md`
- Modify: `manual/pages/command-index.md`
- Modify: `manual/manual.config.yaml`
- Modify: `manual/AGENTS.md`
- Modify: `tests/README.md`
- Modify: `tests/manual-app.test.ts`
- Create: `.changeset/remove-themefile-cutover.md`

- [ ] **Step 1: 删除已无 consumer 的兼容实现与旧测试工件**

先把 `tests/profile-resolver.test.ts` 迁到 `defaultConfig/baseConfig` 与 `document.config`，保持 inheritance、resource、parameterGroup 和 night 断言，并迁移或删除本 task 列出的其它 test consumer。然后在 `src tests benchmarks` 全范围执行 import scan，确认 production CLI、Build、Doctor、WCAG、benchmark 和保留 tests 均不再引用 `loadThemefile()` / `buildDependencyDictionary()` / `ParsedThemefile` / `validateThemefile()`。最后删除 legacy parser、validator、public re-export、临时 delegate、`ThemeGenerationInput.themeName/themePath`、profile legacy options/view 与旧 interface。

`doctor/registry.ts` 删除未接入生产 CLI 的 legacy registry/wrapper，只保留 contrast API；`doctor/theme-context.ts` 删除未消费的 themefile path/config 字段。`TestTheme` 删除 `themefile`，temp helper 只写含闭合 `$config` 的 main；parameterGroup test 重命名并使用 `DesignTokenBuildConfig`。删除纯 legacy parser/create tests、持久 themefile 和 legacy-only fixture 目录。

Run:

```bash
bun test tests/utils/fixture-loader.test.ts tests/parameter-group-pipeline.test.ts tests/doctor-theme-context.test.ts tests/profile-resolver.test.ts
pnpm typecheck
pnpm check:style
```

Commit: `refactor(dt)!: remove isolated themefile compatibility`

- [ ] **Step 2: 更新 SPEC 与 manual tests**

SPEC 写入 main-only Mental Model、闭合 `$config`、完整拒绝矩阵、Doctor scope。manual 的 parameterGroup 示例必须是有效 YAML，不再出现文本 GROUP/RESOURCE。command index 删除顶层 create/init，保留 show。

- [ ] **Step 3: 追加历史 handoff closeout**

不改写历史段落；文件末尾追加 0.22.0 cutover、设计规格链接和 `docs/SPEC.md` 现行真源指向。

- [ ] **Step 4: 添加 minor changeset**

```md
---
"wave": minor
---

Remove the deprecated `themefile` entry, direct RESOURCE generation, and top-level `create`/`init` commands. Use `main.yaml` and `wave dt init` for design-token workspaces.
```

不运行 `pnpm changeset version`，不改 `package.json`。

- [ ] **Step 5: M1 直接验证**

Run:

```bash
bun test
pnpm typecheck
pnpm check:style
pnpm manual:build
pnpm bench:smoke
pnpm changeset status
rg -n "themefile" src tests/fixtures benchmarks manual docs/SPEC.md
```

Expected: gates PASS；`rg` 只命中 `docs/SPEC.md` 的拒绝/移除合同，不命中 production symbol、fixture、benchmark 或 manual 支持路径；package version 仍 `0.21.0`。`src/core/resolver/index.ts` 的内部中性变量 `themefileDir` 在本 step 改名为 `workspaceDir`，不改变 resolver 行为。

- [ ] **Step 6: 提交与 M1 critic-gate**

Commit docs: `docs(dt): document main-only workspace contract`

Commit changeset: `chore(release): add main-only cutover changeset`

Critic baseline: approved spec + Task 1-7 commits。只有 `STATUS: PASS` 后进入 M2。

## M2 Platform Validation

### Task 8: Reject Unknown/Empty Platforms Before Formatting

**Files:**
- Modify: `src/core/generator/token-generator.ts`
- Modify: `src/core/generator/index.ts`
- Modify: `src/core/pipeline/theme-service.ts`
- Modify: `tests/token-generator.test.ts`
- Modify: `tests/integration/theme-service.test.ts`
- Modify: `docs/SPEC.md`

- [ ] **Step 1: 将错误成功测试改成失败合同**

新增/替换三组测试：

```ts
test('rejects an unknown platform before writing known outputs', async () => {
	const result = await generateTokens({ ...base, platform: ['json', 'unknown'] });
	expect(result).toMatchObject({
		success: false,
		files: [],
		error: 'Unknown platform "unknown". Supported platforms: json, jsonc, css, sketch',
	});
});

test('rejects an empty platform list', async () => {
	const result = await generateTokens({ ...base, platform: [] });
	expect(result.error).toBe('At least one output platform is required');
});

test('normalizes and deduplicates platforms', async () => {
	const result = await generateTokens({ ...base, platform: [' json ', 'json'] });
	expect(result.files).toEqual(['demo.json']);
});
```

预置已有 JSON marker，unknown case 断言 bytes 不变且 CSS/其它产物不存在。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/token-generator.test.ts`

Expected: FAIL，当前 unknown 被跳过或重复写入。

- [ ] **Step 3: 实现单 pass output planner**

```ts
export interface PlannedTokenOutput {
	platform: string;
	filePath: string;
	format: WaveFormatFn;
	extra?: Record<string, unknown>;
}

export type TokenOutputPlanResult =
	| { ok: true; outputs: PlannedTokenOutput[] }
	| { ok: false; error: string };

export function planTokenOutputs(options: {
	themeName: string;
	outputDir: string;
	platform?: string[];
}): TokenOutputPlanResult;
```

trim、stable dedupe、任一 unknown fail、空集合 fail，再按 PLATFORMS filename 真源生成内部 absolute `filePath`。`generateTokens()` 必须在调用 formatter 或 mkdir 前获得成功 plan。对外 `GeneratorResult.files` 保持现有 basename 合同，不把 planner 的 absolute path 泄漏给 service、receipt 或既有 consumer。

- [ ] **Step 4: 加 service integration test**

用 main-only temp workspace、`cliPlatform: 'json,unknown'` 和预置 artifact，断言 `ok:false`、`GENERAL_ERROR`、bytes 不变、无其它产物。

- [ ] **Step 5: 验证、文档、提交与 M2 gate**

Run:

```bash
bun test tests/token-generator.test.ts tests/integration/theme-service.test.ts
pnpm typecheck
pnpm check:style
```

Commit: `fix(generator): reject invalid output platforms`

Critic baseline: approved spec 的 Unknown platform section + Task 8 diff。`STATUS: PASS` 后进入 M3。

## M3 Global Output Planning

### Task 9: Reject Final Output Path Collisions Before First Write

**Files:**
- Create: `src/core/pipeline/output-plan.ts`
- Create: `src/core/pipeline/pass-preparer.ts`
- Create: `tests/output-plan.test.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/core/pipeline/theme-service.ts`
- Modify: `src/types/index.ts`
- Modify: `benchmarks/design-token/runner.ts`
- Modify: `tests/parameter-group-pipeline.test.ts`
- Modify: `tests/integration/theme-service.test.ts`
- Modify: `tests/quality-harness.test.ts`
- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token-main-yaml.md`

- [ ] **Step 1: 写纯 output plan tests**

```ts
export interface BuildPassOutputInput {
	id: string;
	themeName: string;
	outputDir: string;
	platforms: string[];
}
```

测试 partial overlap（`[json,css]` vs `[json]`）、dot segment normalization、disjoint json/css、Sketch `2sketch.json` 命名。碰撞文案固定：

```text
Output path collision: "<absolute-path>" is produced by passes "<id1>" and "<id2>"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/output-plan.test.ts`

Expected: FAIL，新模块不存在。

- [ ] **Step 3: 实现全局 planner**

`planBuildOutputs(inputs)` 对每个 pass 调 `planTokenOutputs()`，用 `path.resolve()` 得到的 lexical absolute `filePath` Map 查重。返回每个 pass 的 planned outputs，禁止重新手写 filename 规则。

本节点的合同明确是 lexical final path collision：`a/../b` 等 dot segment 会归一；不同 symlink alias、Unicode normalization 或大小写不敏感卷上的 case alias 不做物理同一文件判定。后者需要 filesystem-aware canonicalization 与平台合同，超出已批准规格，不能把当前 planner 宣称为覆盖此类 alias。为该边界加一条单元测试/注释，避免后续误解。

- [ ] **Step 4: 删除旧 warning key**

`buildGroupPasses()` 不再用 `outputDir|platforms.join(',')` warning。`ResolvedGroupParameters` 增加 `groupName?: string`，供 planner 生成稳定 pass id。

- [ ] **Step 5: Service 改为 collect -> plan -> generate**

把当前 `generatePass()` 的无写入部分提取为 `src/core/pipeline/pass-preparer.ts` 的 exported `prepareBuildPass()`，由 production service 与 benchmark runner 共用；它完成 `processThemeDocument()`、参数合并、reference resolve 与 transform，但不调用 formatter、mkdir 或 `Bun.write`。消费 prepared result 的 write 阶段留在各自 orchestrator。无 profile 分支先 prepare 全部 group passes；profile 分支 prepare 所有 selected day scopes，并读取/merge/prepare night。只有 `processThemeDocument()` 成功的 night 才定义为“有效”并进入 plan；保持现有规则：night parse、overlay 或 token processing 失败时 warning + skip，不阻断 day build。

将 default/profile/night 全部 prepared scope 合并后一次调用 planner，成功后才进入任一 write 阶段。这样 collision preflight 使用真实可写 pass 集合，同时仍发生在首次 formatter 与文件写入前。

必须新增 integration tests：

- 同一 parameterGroup output 的 platform 集合部分重叠，预置 JSON 保持不变，CSS 不产生。
- default night `demo-night.json` 与名为 `night` 的 profile day 在 shared CLI out 下碰撞。
- invalid night skip 继续成功，不因保守规划误报。

- [ ] **Step 6: Benchmark runner 复用 planner**

runner 调用 shared `prepareBuildPass()`：先排除 token processing 失败并按现有规则 skip 的 night，再在直接 generation loop 前对其余全部 scopes/passes plan，确保 Quality Harness 不绕过生产 collision contract或误把 invalid night 计入碰撞。

- [ ] **Step 7: 验证、文档、提交与 M3 gate**

Run:

```bash
bun test tests/output-plan.test.ts tests/parameter-group-pipeline.test.ts tests/integration/theme-service.test.ts tests/quality-harness.test.ts
pnpm typecheck
pnpm check:style
pnpm check:ci
```

Commit: `fix(pipeline): reject output path collisions`

Critic baseline: approved spec 的 GROUP collision section + Task 9 diff。必须 `STATUS: PASS`。

## Final Release Readiness

### Task 10: Full Verification、真实 Smoke 与总 Gate

**Files:**
- No source changes unless a gate finding requires a scoped correction.

- [ ] **Step 1: 运行全量 gate**

```bash
pnpm check:ci
pnpm bench:smoke
pnpm changeset status
```

Expected: PASS；version 仍 `0.21.0`；changeset 为 minor。

- [ ] **Step 2: main-only CSS/Sketch smoke**

使用 `mktemp -d` 复制 `tests/fixtures/themes/orca-realistic`，运行：

```bash
pnpm dev -- dt build -f <tmp>/main.yaml --platform css,sketch --out <tmp>/out
```

Expected: CSS/Sketch files 存在，无 `[object Object]`。

- [ ] **Step 3: 真实 Orca 只读 smoke**

对 `/Users/teatao/Projects/my-color/orca` 的 `main.yaml`、`profiles/**/*.yaml`、所有 night YAML，以及 default workspace `$config.resource` 声明指向的本地文件/目录内 regular files 生成排序后的 SHA-256 清单；输出写入 `mktemp -d`：

```bash
pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --platform css,sketch --out <tmp>/orca-out
```

Expected: CSS/Sketch 成功；输入 hash 清单前后一致；不写 Orca 目录；清理任务临时目录。

- [ ] **Step 4: legacy rejection smoke**

临时目录中放 `themefile` 和预置 output marker，运行 `wave dt build -f <tmp>/themefile --out <tmp>/out`。

Expected: `INVALID_PARAMETER`；诊断包含被拒路径、`main.yaml`、`wave dt init`；marker hash 不变。

- [ ] **Step 5: 总 critic-gate 与工作区收尾**

Critic baseline: approved spec + complete Task 1-9 commit range。修正轮次不超过 10；每轮修正后重跑最接近的 focused tests，最终重跑 `pnpm check:ci`。

确认：

```bash
git status --short
git log --oneline <design-commit>..HEAD
```

Expected: 仅保留用户原有 `.gitignore` 修改；无 benchmark/tmp/build 残留；原子提交清晰。
