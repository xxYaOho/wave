# Reference-Gated Resource Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow self-contained profiles to build without `$config.resource`, and
let token reference resolution decide whether a broken resource declaration
affects build success while Doctor remains strict for its current inspection
target.

**Architecture:** Split dependency handling into a tolerant collection path and a strict validation wrapper. Profile builds consume the tolerant dictionary and fail only when `processThemeDocument()` reports an unresolved or ambiguous reference; Doctor and the legacy no-`main.yaml` fallback consume the strict wrapper. Duplicate namespaces are removed from the tolerant dictionary so a reference can never resolve by declaration order.

**Tech Stack:** TypeScript strict mode, ESM, Bun test runner, js-yaml, pnpm, Changesets.

---

## Contract And File Map

Build contract:

- `$config.resource` may be absent or empty in `main.yaml` and named profiles.
- Build attempts every declared resource and records declaration problems internally.
- Invalid, missing, or duplicate declarations do not emit build warnings and do not fail an otherwise self-contained token graph.
- Every supported curly-brace and `$ref` value must resolve uniquely wherever
  the existing resolver walks the effective token document. `$extends` remains
  document-internal and does not target resource groups.
- A duplicate namespace is absent from the tolerant dictionary; a reference to it therefore fails with its token location.
- The receipt lists only declarations that loaded successfully and entered the dictionary.
- The legacy no-`main.yaml` fallback still requires one valid palette and one valid dimension because those resources are its output inputs.
- This iteration does not extend legacy behavior. A separate breaking iteration,
  recorded in `docs/research/handoff.md`, removes `themefile` across `create`,
  `dt build`, Doctor, init, fixtures, manual pages, and the resource-direct
  fallback.

Doctor contract for this iteration:

- Doctor accepts an absent `$config.resource`.
- Doctor strictly validates every declaration in its current target: the default
  `main.yaml`, plus profiles reached by existing explicit Doctor flows.
- Missing, unreadable, malformed resource files, unknown-kind, invalid custom-extension,
  kind-schema-invalid, or namespace-duplicated declarations fail Doctor even
  when unused.
- A complete all-profile workspace scan and unused-declaration detection remain
  documented Doctor follow-ups and are not implemented here. Malformed config
  values that normalize to no declaration, such as `custom: [42]`, belong to
  that later config-shape audit.

Files:

- Modify `src/core/pipeline/theme-pipeline.ts`: optional config parsing, tolerant dependency collection, strict wrapper, and typed load diagnostics.
- Modify `src/core/pipeline/theme-service.ts`: tolerant profile builds, strict legacy fallback, and receipt recording.
- Modify `src/cli/commands/doctor.ts`: call the strict dependency wrapper explicitly.
- Modify `tests/resource-merge.test.ts`: unit coverage for empty, failed, invalid, and duplicate declarations.
- Modify `tests/integration/theme-service.test.ts`: end-to-end build and legacy behavior.
- Modify `tests/cli-dt-doctor-migration.test.ts`: strict Doctor behavior with optional resources.
- Modify `tests/utils/receipt.test.ts`: unconditional receipt deduplication coverage.
- Modify `docs/SPEC.md`, `manual/pages/design-token-main-yaml.md`, and `manual/pages/design-token.md`: released behavior snapshot and user guidance.
- Create `.changeset/reference-gated-resources.md`: minor release note.

## Milestones And Review Gates

1. **Dependency model:** Tasks 1-2. Run focused tests and `pnpm typecheck`, then dispatch `critic-gate` against the approved design in `docs/research/wave-dt-profile-model.md`.
2. **Command behavior:** Tasks 3-4. Run focused integration and Doctor tests, then dispatch `critic-gate` for build/Doctor/legacy contract fidelity.
3. **Release readiness:** Task 5. Run the full repository gates and a final `critic-gate` over the complete diff.

Do not enter the next milestone until the current gate returns `STATUS: PASS`. Stop after ten correction rounds and report unresolved findings.

### Task 1: Make `$config.resource` Optional

**Files:**

- Modify: `src/core/pipeline/theme-pipeline.ts:125-205`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Add a failing self-contained profile test**

Add this case under the main/profile generation integration tests. Use a temp directory so the test cannot read user resource cache state.

```ts
test('builds a self-contained main.yaml without $config.resource', async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-no-resource-'));
	try {
		await fs.writeFile(
			path.join(dir, 'main.yaml'),
			`$config:
  theme: no-resource
  parameter:
    outputDir: ./out
    platform: json
theme:
  color:
    $type: color
    base:
      $value: "#2563eb"
    alias:
      $value: "{theme.color.base}"
`,
		);

		const result = await generateTheme({
			themeName: 'no-resource',
			themePath: path.join(dir, 'main.yaml'),
			generateOptions: { night: false },
		});

		expect(result.ok).toBe(true);
		expect(await Bun.file(path.join(dir, 'out', 'no-resource.json')).exists()).toBe(true);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});
```

- [ ] **Step 2: Run the focused test and verify the current parser rejects it**

Run:

```bash
bun test tests/integration/theme-service.test.ts --test-name-pattern 'self-contained main.yaml'
```

Expected: FAIL with `Missing required $config.resource declarations`.

- [ ] **Step 3: Remove the main.yaml resource-presence gate**

Keep parsing valid declarations, but return an empty resource array when the field is absent:

```ts
const resources: ResourceDeclaration[] = [];
const resourceConfig = configObj.resource;
if (
	resourceConfig &&
	typeof resourceConfig === 'object' &&
	!Array.isArray(resourceConfig)
) {
	for (const [kind, refs] of Object.entries(
		resourceConfig as Record<string, unknown>,
	)) {
		for (const ref of toStringList(refs)) {
			resources.push({ kind, ref });
		}
	}
}
```

Delete the `resources.length === 0` parse error. Do not change legacy `parseThemefile()`; legacy direct-resource generation still requires `RESOURCE` declarations.

- [ ] **Step 4: Run the test to expose the next dependency-layer failure**

Run the same command.

Expected at this intermediate point: FAIL with `No resources declared in themefile`. This confirms Task 1 changed only config parsing.

- [ ] **Step 5: Keep the parser change unstaged until Task 2 restores green**

Do not commit this intermediate red state. Task 2 completes the dependency layer
and commits the parser and collector as one working contract.

### Task 2: Add Tolerant Dependency Collection

**Files:**

- Modify: `src/core/pipeline/theme-pipeline.ts:45-360`
- Test: `tests/resource-merge.test.ts`

- [ ] **Step 1: Replace old resource-pair tests with the new collection matrix**

Add unit tests for these outcomes:

```ts
test('collects an empty dictionary without issues', async () => {
	const result = await collectDependencyDictionary(
		{ THEME: 'test', PARAMETER: {}, groups: [], resources: [] },
		rootDir,
	);
	expect(result.dict).toEqual({});
	expect(result.loaded).toEqual([]);
	expect(result.issues).toEqual([]);
});

test('records a missing declaration without failing collection', async () => {
	const result = await collectDependencyDictionary(
		{
			THEME: 'test',
			PARAMETER: {},
			groups: [],
			resources: [{ kind: 'custom', ref: './missing.yaml' }],
		},
		rootDir,
	);
	expect(result.dict).toEqual({});
	expect(result.loaded).toEqual([]);
	expect(result.issues[0]?.message).toContain('Resource not found');
});

test('removes duplicate namespaces from the tolerant dictionary', async () => {
	// Write two valid custom resources with the namespace "shared".
	const result = await collectDependencyDictionary(parsed, tempDir);
	expect(result.dict.shared).toBeUndefined();
	expect(result.loaded.some((entry) => entry.namespace === 'shared')).toBe(false);
	expect(result.issues[0]?.message).toContain('Duplicate namespace "shared"');
});

test('strict validation rejects a declaration issue', async () => {
	const result = await buildDependencyDictionary(parsedWithMissingResource, rootDir);
	expect('error' in result).toBe(true);
});
```

Add strict cases for an unknown kind, `custom: ./tokens.txt`, an invalid palette
schema, and a third declaration of an already ambiguous namespace. Retain a
successful palette-and-dimension case, but stop asserting that both kinds are
mandatory for every dictionary. Retain the resource loader's existing
read-error branch; do not add a permission-bit fixture whose behavior changes
under privileged CI.

- [ ] **Step 2: Run the unit tests and verify the tolerant API is missing**

```bash
bun test tests/resource-merge.test.ts
```

Expected: FAIL because `collectDependencyDictionary` is not exported and old duplicate/pair behavior remains.

- [ ] **Step 3: Introduce explicit collection types**

Add these interfaces beside `DependencyDict`:

```ts
export interface LoadedDependency {
	kind: string;
	ref: string;
	namespace: string;
	data: Record<string, unknown>;
	content: string;
	path: string;
	source: 'builtin' | 'cache' | 'user';
}

export interface DependencyLoadIssue {
	kind: string;
	ref: string;
	message: string;
	namespace?: string;
}

export interface DependencyDictionary {
	dict: DependencyDict;
	loaded: LoadedDependency[];
	issues: DependencyLoadIssue[];
}
```

Remove the mandatory `palette`, `dimension`, and related path/content fields from `DependencyDictionary`. Those fields represent legacy generation inputs, not the reference dictionary.

- [ ] **Step 4: Implement tolerant collection**

Add `collectDependencyDictionary(parsed, themeDir)`. It must never fail solely because a declaration is bad:

```ts
export async function collectDependencyDictionary(
	parsed: ParsedThemefile,
	themeDir: string,
): Promise<DependencyDictionary> {
	const dict: DependencyDict = {};
	let loaded: LoadedDependency[] = [];
	const issues: DependencyLoadIssue[] = [];
	const ambiguous = new Set<string>();

	for (const declaration of parsed.resources) {
		const resource = await loadResource(
			declaration.kind,
			declaration.ref,
			themeDir,
		);
		if ('line' in resource) {
			issues.push({ ...declaration, message: resource.message });
			continue;
		}

		if (ambiguous.has(resource.namespace)) {
			issues.push({
				...declaration,
				namespace: resource.namespace,
				message: `Duplicate namespace "${resource.namespace}"`,
			});
			continue;
		}
		if (dict[resource.namespace]) {
			delete dict[resource.namespace];
			loaded = loaded.filter(
				(entry) => entry.namespace !== resource.namespace,
			);
			ambiguous.add(resource.namespace);
			issues.push({
				...declaration,
				namespace: resource.namespace,
				message: `Duplicate namespace "${resource.namespace}"`,
			});
			continue;
		}

		const entry = { ...declaration, ...resource };
		dict[resource.namespace] = {
			data: resource.data,
			path: resource.path,
			kind: declaration.kind,
			source: resource.source,
		};
		loaded.push(entry);
	}

	return { dict, loaded, issues };
}
```

When a third declaration repeats an already ambiguous namespace, record another strict-mode issue with its kind/ref instead of silently losing Doctor evidence.

- [ ] **Step 5: Keep a strict wrapper for Doctor**

Refactor `buildDependencyDictionary()` into a strict wrapper:

```ts
export async function buildDependencyDictionary(
	parsed: ParsedThemefile,
	themeDir: string,
): Promise<DependencyDictionary | { error: Error }> {
	for (const declaration of parsed.resources) {
		const declarationError = validateResourceDeclaration(declaration);
		if (declarationError) {
			return { error: new Error(declarationError) };
		}
	}

	const result = await collectDependencyDictionary(parsed, themeDir);
	if (result.issues.length > 0) {
		return { error: new Error(result.issues[0]!.message) };
	}

	for (const entry of result.loaded) {
		const schemaError = await validateLoadedResourceKind(entry);
		if (schemaError) return { error: new Error(schemaError) };
	}

	return result;
}
```

Implement `validateLoadedResourceKind()` with the existing palette and dimension
schema functions. Return their existing `Palette schema error:` or
`Dimension schema error:` message; `custom` needs no additional kind schema after
generic loading. Empty resources and a single resource kind are valid in strict
mode; strict means “all declarations are valid,” not “palette and dimension are
mandatory.”

Validate declarations before or alongside collection with the existing custom
extension helper and an explicit kind allowlist:

```ts
const RESOURCE_KINDS = new Set(['palette', 'dimension', 'custom']);

function validateResourceDeclaration(
	declaration: ResourceDeclaration,
): string | undefined {
	if (!RESOURCE_KINDS.has(declaration.kind)) {
		return `Unsupported resource kind: ${declaration.kind}`;
	}
	if (declaration.kind === 'custom') {
		return validateCustomResourceExtension(declaration.ref)?.message;
	}
	return undefined;
}
```

The tolerant collector deliberately does not apply this strict declaration or
kind-specific schema gate. If generic loading succeeds and the resolved token
graph is valid, build may use the namespace; Doctor must still reject the
declaration.

- [ ] **Step 6: Run unit tests and typecheck**

```bash
bun test tests/resource-merge.test.ts
pnpm typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Run Milestone 1 critic gate and commit**

Provide the critic with:

- Baseline: `docs/research/wave-dt-profile-model.md`, `Resource namespaces`.
- Diff scope: Task 1-2 files.
- Required checks: optional config, no declaration-order resolution for duplicates, strict wrapper preserved.

After `STATUS: PASS`:

```bash
git add src/core/pipeline/theme-pipeline.ts tests/resource-merge.test.ts tests/integration/theme-service.test.ts
git commit -m "refactor(dt): separate resource collection from validation"
```

### Task 3: Make Build Reference-Gated And Preserve Legacy Fallback

**Files:**

- Modify: `src/core/pipeline/theme-service.ts:80-540`
- Modify: `src/utils/receipt.ts:145-185`
- Test: `tests/integration/theme-service.test.ts`
- Test: `tests/utils/receipt.test.ts`

- [ ] **Step 1: Add the build behavior matrix**

Create temp-workspace integration cases for:

```ts
const cases = [
	{ name: 'missing unused resource', referenced: false, succeeds: true },
	{ name: 'malformed unused resource', referenced: false, succeeds: true },
	{ name: 'duplicate unused namespace', referenced: false, succeeds: true },
	{ name: 'missing referenced resource', referenced: true, succeeds: false },
	{ name: 'duplicate referenced namespace', referenced: true, succeeds: false },
	{
		name: 'kind-invalid but generically loadable referenced resource',
		referenced: true,
		succeeds: true,
	},
] as const;
```

For successful cases, assert `ctx.warnings` is empty. Declarations that fail
generic loading or are removed for duplicate ambiguity must not appear in
`ctx.resources`. A kind-invalid declaration that passes generic loading and
enters `dict` must appear because it participated in resolution; Doctor rejects
the same declaration under its stricter contract. For referenced failures,
assert:

```ts
expect(result.ok).toBe(false);
if (result.ok) return;
expect(result.exitCode).toBe(ExitCode.INVALID_PARAMETER);
expect(result.message).toContain('Unresolved theme references found');
expect(result.message).toContain('at theme.color.external');
```

Also retain the existing successful external-reference fixture as proof that
valid resources still resolve. Cover both curly-brace and `$ref` external values,
plus a reference nested inside an existing `$extensions` shape. Keep `$extends`
coverage internal to the token document; do not introduce external resource
inheritance.

- [ ] **Step 2: Add a legacy regression**

Create a legacy `themefile` with only a palette and no `main.yaml`:

```ts
await fs.writeFile(
	path.join(dir, 'themefile'),
	'THEME legacy\nRESOURCE palette ./palette.yaml\nPARAMETER output ./out\n',
);
```

Expected: `generateTheme()` resolves to `{ ok: false }`, exit code
`ExitCode.FILE_NOT_FOUND`, and message
`Missing required palette or dimension resource`. It must not reject its Promise
or print a runtime stack. Keep the existing valid palette-plus-dimension fallback
test passing.

- [ ] **Step 3: Run focused tests and verify current eager failure behavior**

```bash
bun test tests/integration/theme-service.test.ts --test-name-pattern 'resource|legacy'
```

Expected: the unused-invalid cases fail before reference resolution.

- [ ] **Step 4: Use tolerant collection for main/profile builds**

Move profile discovery before dependency collection. The command must first know
which config is effective; do not collect or record legacy `themefile` resources
before `parseProfileDocument()` has applied local `main.yaml::$config`
precedence.

For the no-discovered-profile branch, determine whether the explicit entry itself
is a `main.yaml` token document:

```ts
const hasMainDocument =
	loadResult.mainYamlPath !== undefined ||
	profiles.some((entry) => entry.isDefault);
```

Use these branches:

1. Explicit YAML with no discovered project profile: collect its parsed
   declarations tolerantly and generate from its content override.
2. Discovered `main.yaml`, including `themefile + adjacent main.yaml`: parse the
   effective base/selected profile first, then collect only
   `document.parsed.resources` tolerantly.
3. No `main.yaml`: use strict legacy loading and resource-direct generation.

Use the tolerant `dict` even when `issues` is non-empty, and apply the same rule
to every effective named-profile document.

Use a small helper to add only successful dictionary entries to the receipt:

```ts
function recordLoadedResources(
	ctx: BuildContext | undefined,
	loaded: LoadedDependency[],
): void {
	for (const entry of loaded) {
		ctx?.addResource(entry.kind, entry.ref, entry.source);
	}
}
```

Make receipt deduplication unconditional in `BuildContext.addResource()`:

```ts
addResource(kind: string, ref: string, source: ResourceSource): void {
	if (
		this.resources.some(
			(entry) =>
				entry.kind === kind && entry.ref === ref && entry.source === source,
		)
	) return;
	this.resources.push({ kind, ref, source });
}
```

Add a focused test that calls `addResource()` twice with the same triple and
asserts one receipt entry. Add an integration assertion for `--profiles all` so
inherited resources appear once with the correct source.

Do not add warnings from `DependencyLoadIssue` to `BuildContext`.

- [ ] **Step 5: Keep legacy direct generation strict**

When there is no `main.yaml`, call `buildDependencyDictionary()` and fail on
declaration errors. Before calling `generatePass()`, locate the first loaded
palette and dimension:

```ts
const palette = depResult.loaded.find((entry) => entry.kind === 'palette');
const dimension = depResult.loaded.find((entry) => entry.kind === 'dimension');
if (!palette || !dimension) {
	const message = 'Missing required palette or dimension resource';
	ctx?.markFailed('resource', message, { phase: 'resource resolve' });
	return {
		ok: false,
		exitCode: ExitCode.FILE_NOT_FOUND,
		message,
	};
}
```

Pass the pair into `generateThemeTokens()`. Parse and validate its content with
the existing functions before constructing the synthetic legacy tree. Wrap the
helper body in `try/catch` and convert unexpected parser/schema exceptions into
`GeneratorResult { success: false, files: [], error }` so `generatePass()` keeps
returning a structured `ThemeGenerationFailure`.

- [ ] **Step 6: Run integration, receipt, and type checks**

```bash
bun test tests/integration/theme-service.test.ts tests/utils/receipt.test.ts
pnpm typecheck
```

Expected: all pass; referenced failures return exit code `5`, while invalid unused declarations build without warnings.

- [ ] **Step 7: Commit build integration**

```bash
git add src/core/pipeline/theme-service.ts src/utils/receipt.ts tests/integration/theme-service.test.ts tests/utils/receipt.test.ts
git commit -m "feat(dt): gate resource failures on token references"
```

### Task 4: Preserve Strict Doctor Validation

**Files:**

- Modify: `src/cli/commands/doctor.ts:180-270,310-355`
- Test: `tests/cli-dt-doctor-migration.test.ts`

- [ ] **Step 1: Add Doctor contract tests**

```ts
test('accepts a self-contained profile without resource declarations', async () => {
	const dir = await makeTheme(`
$config:
  theme: doctor-self-contained
theme:
  color:
    base: { $type: color, $value: "#2563eb" }
`);
	const result = await runWave(['dt', 'doctor'], { cwd: dir });
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain('Config File: Valid (doctor-self-contained)');
});

test('rejects an unused missing resource declaration', async () => {
	const dir = await makeTheme(`
$config:
  theme: doctor-missing-unused
  resource:
    custom: [./missing.yaml]
theme:
  color:
    base: { $type: color, $value: "#2563eb" }
`);
	const result = await runWave(['dt', 'doctor'], { cwd: dir });
	expect(result.exitCode).not.toBe(0);
	expect(result.stdout).toContain('Resource not found');
});
```

Add an unknown kind, invalid custom extension, kind-schema-invalid palette, and
duplicate-unused namespace case. Assert Doctor reports the corresponding strict
validation message. These tests target `main.yaml`; do not imply that this
iteration adds an all-profile workspace scan. Keep the resource loader's existing
read-error handling; do not add a permission-based CLI fixture in this iteration.

Retain the existing `--contrast --profile` resource path as coverage that an
explicitly selected profile continues using strict dependency validation.

- [ ] **Step 2: Run Doctor tests before adapting callers**

```bash
bun test tests/cli-dt-doctor-migration.test.ts
```

Expected: FAIL if Doctor accidentally consumes tolerant collection or still rejects empty config during load.

- [ ] **Step 3: Make strict mode explicit at Doctor call sites**

Keep `buildDependencyDictionary()` as Doctor's API. Do not call
`collectDependencyDictionary()` from `doctor.ts`. Preserve raw dimension
migration advice when strict resource validation fails. Do not add profile
auto-discovery to the non-contrast Doctor path in this iteration; the Handoff
owns that follow-up.

For an empty strict dictionary, continue into theme context with `{}` and print a successful Resources check. Do not restore the old “palette and dimension required” condition.

- [ ] **Step 4: Run Doctor and shared context tests**

```bash
bun test tests/cli-dt-doctor-migration.test.ts tests/doctor-theme-context.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 5: Run Milestone 2 critic gate and commit**

Ask the critic to verify four boundaries: build ignores unused declaration
failures, referenced failures remain fatal, Doctor remains strict for its current
target, and legacy direct generation remains strict with structured failures.

After `STATUS: PASS`:

```bash
git add src/cli/commands/doctor.ts tests/cli-dt-doctor-migration.test.ts
git commit -m "test(dt): preserve strict doctor resource checks"
```

### Task 5: Update Released Documentation And Run Full Gates

**Files:**

- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token-main-yaml.md`
- Modify: `manual/pages/design-token.md`
- Create: `.changeset/reference-gated-resources.md`

- [ ] **Step 1: Update the behavior snapshot**

In `docs/SPEC.md`, replace every claim that `$config.resource` is required with this contract:

```markdown
- `$config.resource` 是可选的外部引用依赖声明，不直接输出 token。
- build 只以完整 token 图能否解析和生成作为 resource 相关成功条件。
- 未被引用的缺失、损坏或重复 resource 声明不阻塞 build；Doctor 仍严格检查当前检查目标中的全部声明。
- legacy 无 `main.yaml` 的资源直出路径仍要求有效 palette 和 dimension。
```

Update the data-flow diagram so an empty dependency dictionary is valid. Keep resource lookup precedence unchanged.

- [ ] **Step 2: Update user guidance**

In `manual/pages/design-token-main-yaml.md`, show a self-contained minimal example first:

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./build
    platform: [json, css]
theme:
  color:
    primary:
      $type: color
      $value: "#2563eb"
```

Then show `$config.resource` as an optional external-reference example. In
`manual/pages/design-token.md`, change “resource provides dependency data” to
“optional resource declarations provide external dependency data.” State that
`wave dt doctor` strictly validates declarations in its current target. Keep the
all-profile workspace audit documented only in `docs/research/handoff.md`.

- [ ] **Step 3: Add a Changeset**

Create `.changeset/reference-gated-resources.md`:

```markdown
---
"wave": minor
---

Allow self-contained design-token profiles to build without resource declarations, and move declaration-level resource validation from build to `wave dt doctor`.
```

- [ ] **Step 4: Run documentation and placeholder checks**

```bash
rg -n 'Missing required \$config\.resource|No resources declared in themefile|用户必须.*resource|resource.*必填' src tests docs manual
rg -n 'TBD|TODO|implement later|fill in details' docs/superpowers/plans/2026-07-28-reference-gated-resource-loading.md
pnpm manual:build
```

Expected: the first search has no current-main/profile requirement; any remaining match is explicitly legacy-only. The placeholder search has no matches. Manual build passes.

- [ ] **Step 5: Run full verification**

```bash
pnpm check:ci
pnpm bench:smoke
```

Expected: typecheck, all Bun tests, CLI/manual build, Biome checks, and the smoke benchmark pass.

- [ ] **Step 6: Run the final critic gate**

Provide:

- Approved design: `docs/research/wave-dt-profile-model.md`, `Resource namespaces`.
- Implementation plan: this file.
- Full diff from the pre-implementation base.
- Verification output from `pnpm check:ci` and `pnpm bench:smoke`.

Required verdict: `STATUS: PASS`, with no fatal findings. Report any remaining major or minor findings to the user before implementation closeout.

- [ ] **Step 7: Commit release-facing artifacts**

```bash
git add docs/SPEC.md manual/pages/design-token-main-yaml.md manual/pages/design-token.md .changeset/reference-gated-resources.md
git commit -m "docs(dt): document optional resource dependencies"
```

## Plan Self-Review

- Spec coverage: optional declarations, tolerant build collection, supported
  reference-only failure, duplicate ambiguity, strict current-target Doctor
  validation, receipt behavior, and structured legacy fallback all map to
  explicit tasks.
- Type consistency: `collectDependencyDictionary()` always returns `DependencyDictionary`; `buildDependencyDictionary()` remains the strict union-return wrapper used by Doctor and legacy build.
- Scope: unused-resource detection is documented for Doctor but intentionally excluded from implementation.
- Scope: `themefile` removal is recorded as the next breaking iteration and is
  intentionally excluded so this plan changes one build contract at a time.
- No placeholders: every code-changing step includes the intended API or assertion and an exact verification command.
