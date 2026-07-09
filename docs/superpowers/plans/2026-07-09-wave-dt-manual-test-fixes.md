# Wave DT Manual Test Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed and released in Wave 0.16.0.

**Goal:** Fix the regressions found by real `orca` and root-matrix testing after the profile-model refactor.

**Architecture:** Keep the existing parser/resolver/transformer/generator boundaries. Fix packaged resource lookup at the resource boundary, make doctor inspect the same default `main.yaml` that build uses, normalize composite token values in the transformer, and make CSS/Sketch formatters reject or format normalized values instead of silently emitting fallback placeholders.

**Tech Stack:** TypeScript strict ESM, Bun runtime, pnpm scripts, Commander CLI, js-yaml, existing Bun test suite.

---

## Source Facts

- Worktree: `/Users/teatao/.worktree/cli_wave/refactor-dt`
- Audit source: `docs/research/handoff.md`
- User smoke project: `/Users/teatao/Projects/my-color/orca`
- Temporary fixtures used during audit:
  - `/tmp/wave-root-matrix/main.yaml`
  - `/tmp/wave-border-ref-matrix/main.yaml`
  - `/tmp/wave-outline-matrix/main.yaml`

## File Map

- Modify `scripts/build-cli.ts`: package or copy built-in resource YAML files so compiled `dist/wave` can load them.
- Modify `src/core/resolver/builtin.ts`: resolve built-ins from source during development and from packaged resources in compiled/dist runtime.
- Modify `src/core/resolver/index.ts`: share the same built-in resource directory logic with `builtin.ts`; avoid a second `import.meta.dir` path model.
- Modify `src/core/resolver/resource-loader.ts`: continue using `getResourcesDir()` so build and show share the fixed resource lookup.
- Modify `tests/cli-binary.test.ts` or create `tests/cli-binary-resource.test.ts`: cache-free dist smoke coverage for built-in palette and dimension resources.
- Modify `src/cli/commands/doctor.ts`: default `dt doctor` to `./main.yaml` when present, run migration checks even when detailed resource resolution fails, and avoid unconditional built-in-resource pass wording.
- Modify `src/core/doctor/dimension-migration.ts`: detect public `theme.dimension`, `$config.resource.dimension`, and `{wave.dimension.*}` references.
- Modify `tests/cli-dt.test.ts` or create `tests/cli-dt-doctor-migration.test.ts`: CLI coverage for doctor default file discovery and legacy dimension guidance.
- Modify `src/core/transformer/theme-transformer.ts`: normalize nested values for `shadow`, `gradient`, and `border`; normalize nested border color and length fields.
- Modify `src/core/generator/formats/css.ts`: format normal border tokens as CSS border values or explicitly guard unsupported values; outline remains value plus offset companion.
- Modify `src/core/generator/formats/sketch.ts`: ensure outline uses normalized border color and width; allow normalized length values for shadow output.
- Modify `src/core/schema/theme.ts`: allow `sketch.property.cornerRadius` under `theme.radius`.
- Modify focused tests:
  - `tests/format-css.test.ts`
  - `tests/format-sketch.test.ts`
  - `tests/transform-to-wave-tokens.test.ts`
  - `tests/theme-schema.test.ts`
  - `tests/integration/theme-service.test.ts`
- Modify docs for user-visible doctor and radius behavior:
  - `docs/research/handoff.md`
  - `manual/pages/design-token.md`
  - `docs/design-token.md`

## Non-Goals

- Do not reintroduce variants or `variants/` auto-discovery.
- Do not rename `main.yaml`.
- Do not make `theme.dimension` a public output root again.
- Do not add author-configurable Sketch outline gap color.
- Do not redesign the full resource manager or cache lifecycle.

## Commit and Gate Policy

- Commit after each task with a focused Conventional Commit message.
- After each implementation task, run `critic-gate` read-only review.
- Iterate until `critic-gate` returns `STATUS: PASS`.
- Use source entry for functional tests unless the task explicitly concerns `dist/wave`.
- Keep `/Users/teatao/Projects/cli_wave` untouched.

---

### Task 1: Fix Packaged Built-In Resource Loading

**Files:**
- Modify: `scripts/build-cli.ts`
- Modify: `src/core/resolver/builtin.ts`
- Modify: `src/core/resolver/index.ts`
- Test: `tests/cli-binary-resource.test.ts`

- [ ] **Step 1: Write failing binary resource tests**

Create `tests/cli-binary-resource.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { $ } from 'bun';

const repoRoot = path.resolve(import.meta.dir, '..');
const distWave = path.join(repoRoot, 'dist', 'wave');

let tempHome = '';
let tempOut = '';

async function runDist(args: string[], cwd = repoRoot) {
	const proc = Bun.spawn([distWave, ...args], {
		cwd,
		env: {
			...process.env,
			HOME: tempHome,
			WAVE_HOME: path.join(tempHome, '.wave-home'),
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

beforeAll(async () => {
	tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-bin-home-'));
	tempOut = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-bin-out-'));
	await $`pnpm build`;
});

afterAll(async () => {
	if (tempHome) await fs.rm(tempHome, { recursive: true, force: true });
	if (tempOut) await fs.rm(tempOut, { recursive: true, force: true });
});

describe('compiled wave built-in resources', () => {
	test('loads uncached built-in palette and dimension resources', async () => {
		const palette = await runDist(['dt', 'show', 'palette', 'tailwindcss']);
		expect(palette.exitCode).toBe(0);
		expect(palette.stdout).toContain('tailwindcss');

		const dimension = await runDist(['dt', 'show', 'dimension', 'wave']);
		expect(dimension.exitCode).toBe(0);
		expect(dimension.stdout).toContain('dimension');
	});

	test('builds a fixture with uncached built-in resources', async () => {
		const result = await runDist([
			'dt',
			'build',
			'-f',
			'tests/fixtures/themes/standard/themefile',
			'--out',
			tempOut,
		]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Theme generation complete');
		expect(await Bun.file(path.join(tempOut, 'test-standard.css')).exists()).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/cli-binary-resource.test.ts
```

Expected before fix:

- `dt show dimension wave` fails with `Resource not found`.
- cache-free `dt show palette tailwindcss` fails when `HOME` has no resource cache.

- [ ] **Step 3: Add packaged resource copy step**

Modify `scripts/build-cli.ts` so it copies `src/resources` into `dist/resources` after compiling:

```ts
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(distDir, 'wave');
const sourceResourcesDir = path.join(rootDir, 'src', 'resources');
const packagedResourcesDir = path.join(distDir, 'resources');
```

Add after `bun build` and before codesign:

```ts
await fs.rm(packagedResourcesDir, { recursive: true, force: true });
await fs.cp(sourceResourcesDir, packagedResourcesDir, { recursive: true });
```

- [ ] **Step 4: Centralize resource directory resolution**

Modify `src/core/resolver/builtin.ts` to export a single resolver:

```ts
const SOURCE_RESOURCES_DIR = path.join(import.meta.dir, '..', '..', 'resources');

function candidateResourceDirs(): string[] {
	const candidates = [SOURCE_RESOURCES_DIR];
	const execDir = path.dirname(process.execPath);
	candidates.push(path.join(execDir, 'resources'));
	return [...new Set(candidates)];
}

export function getResourcesDir(): string {
	for (const candidate of candidateResourceDirs()) {
		try {
			if (Bun.file(path.join(candidate, 'palettes', 'tailwindcss.yaml')).size > 0) {
				return candidate;
			}
			if (Bun.file(path.join(candidate, 'dimensions', 'wave.yaml')).size > 0) {
				return candidate;
			}
		} catch {
			continue;
		}
	}
	return SOURCE_RESOURCES_DIR;
}
```

Then update `getBuiltinPalettePath` and `getBuiltinDimensionPath` to call `getResourcesDir()`.

- [ ] **Step 5: Remove duplicated resource dir logic**

Modify `src/core/resolver/index.ts`:

```ts
export {
	getBuiltinDimensionPath,
	getBuiltinPalettePath,
	getResourcesDir,
	loadBuiltinDimension,
	loadBuiltinPalette,
} from './builtin.ts';
```

Delete the local `const RESOURCES_DIR = ...` and the local `getResourcesDir()` implementation.

- [ ] **Step 6: Run binary tests**

Run:

```bash
bun test tests/cli-binary-resource.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Run focused resource tests**

Run:

```bash
bun test tests/resource-resolver.test.ts tests/resource-cache.test.ts tests/resource-merge.test.ts tests/cli-dt.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-cli.ts src/core/resolver/builtin.ts src/core/resolver/index.ts tests/cli-binary-resource.test.ts
git commit -m "fix(dt): package builtin resources"
```

- [ ] **Step 9: critic-gate**

Spawn `critic-gate` with this scope:

```text
Review commit "fix(dt): package builtin resources". Check cache-free dist behavior, source behavior, resource path portability, and tests. Read-only. Return STATUS: PASS or FAIL.
```

---

### Task 2: Fix Doctor Default and Dimension Migration Diagnostics

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/core/doctor/dimension-migration.ts`
- Modify: `src/cli/commands/dt.ts` only if help text needs command-level wording
- Test: `tests/cli-dt-doctor-migration.test.ts`

- [ ] **Step 1: Write failing doctor tests**

Create `tests/cli-dt-doctor-migration.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

async function runWave(
	args: string[],
	options: { cwd?: string; env?: Record<string, string> } = {},
) {
	const repoRoot = path.resolve(import.meta.dir, '..');
	const cliEntry = path.join(repoRoot, 'src', 'index.ts');
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd: options.cwd ?? repoRoot,
		env: { ...process.env, ...options.env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

async function makeTheme(source: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-theme-'));
	await fs.writeFile(path.join(dir, 'main.yaml'), source);
	return dir;
}

const tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe('dt doctor migration guidance', () => {
	test('defaults to ./main.yaml when present', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: doctor-default
  resource:
    palette: [tailwindcss]
theme:
  color:
    primary:
      $type: color
      $value: "{tailwindcss.color.blue.600}"
`);
		tempDirs.push(dir);

		const { exitCode, stdout } = await runWave(['dt', 'doctor'], { cwd: dir });

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Config File: Valid (doctor-default)');
		expect(stdout).not.toContain('No themefile specified');
	});

	test('reports legacy dimension resource and references without public theme.dimension', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: doctor-dimension-legacy
  resource:
    palette: [tailwindcss]
    dimension: [wave]
theme:
  color:
    overlay:
      $type: color
      $value:
        colorSpace: srgb
        components: [0, 0, 0]
        alpha: "{wave.dimension.alpha.200}"
`);
		tempDirs.push(dir);

		const { exitCode, stdout } = await runWave(['dt', 'doctor'], { cwd: dir });

		expect(exitCode).toBe(1);
		expect(stdout).toContain('theme.dimension is no longer a public output root');
		expect(stdout).toContain('$config.resource.dimension');
		expect(stdout).toContain('{wave.dimension.*}');
	});

	test('prints migration guidance even when resource resolution fails', async () => {
		const dir = await makeTheme(`
$schema: "https://www.designtokens.org/tr/2025.10/format/"
$config:
  theme: doctor-resource-failure
  resource:
    palette: [tailwindcss]
    dimension:
      - /resources/dimensions/wave.yaml
theme:
  color:
    overlay:
      $type: color
      $value:
        colorSpace: srgb
        components: [0, 0, 0]
        alpha: "{wave.dimension.alpha.200}"
`);
		tempDirs.push(dir);

		const { exitCode, stdout } = await runWave(['dt', 'doctor'], { cwd: dir });

		expect(exitCode).toBe(1);
		expect(stdout).toContain('Resource not found');
		expect(stdout).toContain('theme.dimension is no longer a public output root');
		expect(stdout).toContain('$config.resource.dimension');
		expect(stdout).toContain('{wave.dimension.*}');
	});
});
```

If `runWave` does not support `{ cwd }`, extend the helper instead of shelling out ad hoc.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test tests/cli-dt-doctor-migration.test.ts
```

Expected before fix:

- default doctor prints `No themefile specified`;
- legacy dimension test exits 0 and lacks guidance;
- resource-failure test prints the resource error but lacks migration guidance.

- [ ] **Step 3: Extend dimension migration detector**

Modify `src/core/doctor/dimension-migration.ts` to export a richer finding type:

```ts
export type DimensionMigrationFinding = {
	path: string;
	reason: 'public-root' | 'resource' | 'reference';
};
```

Add recursive scanners:

```ts
function walk(value: unknown, path: string[], findings: DimensionMigrationFinding[]): void {
	if (typeof value === 'string' && value.includes('wave.dimension.')) {
		findings.push({ path: path.join('.'), reason: 'reference' });
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => walk(item, [...path, String(index)], findings));
		return;
	}
	if (typeof value !== 'object' || value === null) return;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		walk(child, [...path, key], findings);
	}
}
```

Add:

```ts
export function findDimensionMigrationFindings(tree: unknown): DimensionMigrationFinding[] {
	const findings: DimensionMigrationFinding[] = [];
	for (const path of findPublicDimensionRoots(tree)) {
		findings.push({ path, reason: 'public-root' });
	}
	const root = typeof tree === 'object' && tree !== null ? (tree as Record<string, unknown>) : {};
	const resource = ((root.$config as Record<string, unknown> | undefined)?.resource ?? {}) as Record<string, unknown>;
	if ('dimension' in resource) {
		findings.push({ path: '$config.resource.dimension', reason: 'resource' });
	}
	walk(tree, [], findings);
	return findings;
}
```

Keep `findPublicDimensionRoots` for existing tests, but have new doctor code use `findDimensionMigrationFindings`.

- [ ] **Step 4: Update migration advice rendering**

Modify `renderDimensionMigrationAdvice` to accept either strings or findings:

```ts
export function renderDimensionMigrationAdvice(
	pathsOrFindings: string[] | DimensionMigrationFinding[],
): string {
	const findings = pathsOrFindings.map((item) =>
		typeof item === 'string'
			? { path: item, reason: 'public-root' as const }
			: item,
	);
	return [
		'theme.dimension is no longer a public output root.',
		'Move public tokens to the new roots:',
		'- theme.dimension.interaction.* -> theme.state.*',
		'- theme.dimension.shadow.* -> theme.shadow.elevation.*',
		'- theme.dimension.gradient-mask-smooth -> theme.gradient.mask.soft',
		'- theme.dimension.gradient-mask-smooth-media -> theme.gradient.mask.strong',
		'- theme.dimension.radius.* -> theme.radius.*',
		'Also remove legacy dimension resource dependencies when they only feed public output:',
		'- $config.resource.dimension',
		'- {wave.dimension.*} references',
		'Detected paths:',
		...findings.map((finding) => `- ${finding.path}`),
	].join('\n');
}
```

- [ ] **Step 5: Make doctor default to `./main.yaml`**

In `src/cli/commands/doctor.ts`, before the existing `if (options.file)` branch, derive:

```ts
const defaultMainPath = path.resolve(process.cwd(), 'main.yaml');
const effectiveFile =
	options.file ??
	((await Bun.file(defaultMainPath).exists()) ? defaultMainPath : undefined);
```

Then use `effectiveFile` instead of `options.file` for theme loading. Preserve legacy behavior when no `main.yaml` exists by printing `No themefile specified`.

- [ ] **Step 6: Surface migration guidance even when resource resolution fails**

Before resource dictionary resolution, compute the inspectable token path and parse raw YAML:

```ts
const adjacentMainPath = path.join(loadResult.themeDir, 'main.yaml');
const inspectPath =
	loadResult.mainYamlPath ??
	((await Bun.file(adjacentMainPath).exists()) ? adjacentMainPath : undefined);

async function inspectRawDimensionMigration(filePath: string | undefined) {
	if (!filePath) return [];
	const content = await Bun.file(filePath).text();
	return findDimensionMigrationFindings(yaml.load(content));
}
```

When `buildDependencyDictionary` returns an error, still call the raw inspector and render guidance:

```ts
const findings = await inspectRawDimensionMigration(inspectPath);
if (findings.length > 0) {
	console.log(renderDimensionMigrationAdvice(findings));
}
```

Import `js-yaml` in `src/cli/commands/doctor.ts` if no existing helper is available.

- [ ] **Step 7: Fix misleading resources wording**

Only print `✓ Resources: All built-in resources available` when no theme resource failure was found. If a theme file was checked and dictionary build failed, print the specific failure and do not print the unconditional pass line.

- [ ] **Step 8: Run doctor tests**

Run:

```bash
bun test tests/cli-dt-doctor-migration.test.ts tests/cli-dt.test.ts tests/doctor-theme-context.test.ts
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/cli/commands/doctor.ts src/core/doctor/dimension-migration.ts tests/cli-dt-doctor-migration.test.ts
git commit -m "fix(dt): diagnose dimension migration by default"
```

- [ ] **Step 10: critic-gate**

Spawn `critic-gate`:

```text
Review commit "fix(dt): diagnose dimension migration by default". Check default doctor behavior, migration guidance completeness, exit codes, and whether build behavior was accidentally changed. Read-only. Return STATUS: PASS or FAIL.
```

---

### Task 3: Normalize Composite Token Values

**Files:**
- Modify: `src/core/transformer/theme-transformer.ts`
- Test: `tests/transform-to-wave-tokens.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Add failing transformer tests for border color and length normalization**

Append to `tests/transform-to-wave-tokens.test.ts`:

```ts
test('normalizes border color and width references', () => {
	const result = transformToWaveTokens({
		theme: {
			color: {
				base: { $type: 'color', $value: '#2563eb' },
			},
			border: {
				outline: {
					$type: 'border',
					$value: {
						color: '#2563eb',
						width: { value: 2, unit: 'px' },
						style: 'solid',
					},
					$extensions: { outline: { offset: 2 } },
				},
			},
		},
	});

	const border = result.tokens.find((token) => token.name === 'theme-border-outline');
	expect(border?.value).toEqual({
		color: '#2563eb',
		width: '2px',
		style: 'solid',
	});
	expect(border?._outline).toEqual({ offset: 2 });
});
```

Add a second test for shadow length fields:

```ts
test('normalizes shadow length references inside layer objects', () => {
	const result = transformToWaveTokens({
		theme: {
			shadow: {
				card: {
					$type: 'shadow',
					$value: {
						color: '#00000033',
						offsetX: 0,
						offsetY: { value: 4, unit: 'px' },
						blur: { value: 8, unit: 'px' },
						spread: 0,
					},
				},
			},
		},
	});

	const shadow = result.tokens.find((token) => token.name === 'theme-shadow-card');
	expect(shadow?.value).toEqual({
		color: '#00000033',
		offsetX: 0,
		offsetY: '4px',
		blur: '8px',
		spread: 0,
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test tests/transform-to-wave-tokens.test.ts
```

Expected before fix: nested border width or shadow lengths remain objects.

- [ ] **Step 3: Generalize nested object normalization**

Modify `processArrayItem` into a generic composite item normalizer. Keep the function name if simpler, but remove the shadow/gradient-only color guard:

```ts
function shouldNormalizeNestedColor(parentType: string | undefined, key: string, val: unknown): boolean {
	return (
		key === 'color' &&
		(parentType === 'shadow' || parentType === 'gradient' || parentType === 'border') &&
		(typeof val === 'string' ||
			isDtcgColorSpaceValue(val) ||
			isDtcgColorObjectCandidate(val) ||
			isLegacyColorSpaceWrapperObject(val) ||
			isDtcgTokenValueObject(val) ||
			isLegacyColorObject(val) ||
			isStandaloneHexObject(val))
	);
}
```

Then in the object loop:

```ts
if (shouldNormalizeNestedColor(parentType, key, val)) {
	result[key] = normalizeColorValue(
		val,
		targetFormat,
		itemPath ? `${itemPath}.${key}` : undefined,
	).value;
} else if (typeof val === 'object' && val !== null && 'value' in val) {
	const obj = val as { value: number; unit?: string };
	result[key] = obj.unit ? `${obj.value}${obj.unit}` : obj.value;
} else {
	result[key] = val;
}
```

- [ ] **Step 4: Apply object normalization to border and shadow direct objects**

In `transformToken`, after `processedValue = processValue(...)`, add:

```ts
if (
	(typeValue === 'shadow' || typeValue === 'border') &&
	typeof processedValue === 'object' &&
	processedValue !== null &&
	!Array.isArray(processedValue)
) {
	processedValue = processArrayItem(
		processedValue,
		targetColorSpace,
		tokenPath,
		typeValue,
	) as DtcgValue;
}
```

Keep existing array handling for shadow/gradient.

- [ ] **Step 5: Run transformer tests**

Run:

```bash
bun test tests/transform-to-wave-tokens.test.ts tests/smooth-shadow-transformer.test.ts tests/theme-transformer.test.ts
```

Expected: all pass.

- [ ] **Step 6: Add full integration matrix fixture test**

In `tests/integration/theme-service.test.ts`, add a focused test that builds an inline temp theme with:

- `theme.shadow.ref-length`
- `theme.border.outline.ref-width`
- direct hex border outline color
- local color token curly reference
- local color alias curly reference
- external resource-backed color curly reference
- `$ref` to a color token object
- `$ref` to a color token `$value`
- `$ref` to an alias color token `$value`

Assert generated CSS does not contain `[object Object]`, does not use unintended `currentColor`, and contains the expected CSS border values. Parse the generated Sketch JSON and assert every outline case has the expected first-layer color instead of `#000000ff`.

The assertions must cover the recorded matrix:

```ts
expect(css).toContain('--border-outline-direct-hex: 1px solid #2563eb;');
expect(css).toContain('--border-outline-token-curly-base: 1px solid #2563eb;');
expect(css).toContain('--border-outline-token-curly-alias: 1px solid #2563eb;');
expect(css).toContain('--border-outline-token-curly-external: 1px solid #1d293d;');
expect(css).toContain('--border-outline-pointer-token: 1px solid #2563eb;');
expect(css).toContain('--border-outline-pointer-value: 1px solid #2563eb;');
expect(css).toContain('--border-outline-pointer-alias-value: 1px solid #2563eb;');
expect(css).not.toContain('[object Object]');
expect(css).not.toContain('1px solid currentColor');
```

For Sketch:

```ts
expect(sketch['border-outline-direct-hex'].shadow[0].color).toBe('#2563ebff');
expect(sketch['border-outline-token-curly-base'].shadow[0].color).toBe('#2563ebff');
expect(sketch['border-outline-token-curly-alias'].shadow[0].color).toBe('#2563ebff');
expect(sketch['border-outline-token-curly-external'].shadow[0].color).toBe('#1d293dff');
expect(sketch['border-outline-pointer-token'].shadow[0].color).toBe('#2563ebff');
expect(sketch['border-outline-pointer-value'].shadow[0].color).toBe('#2563ebff');
expect(sketch['border-outline-pointer-alias-value'].shadow[0].color).toBe('#2563ebff');
```

- [ ] **Step 7: Run integration tests**

Run:

```bash
bun test tests/integration/theme-service.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/transformer/theme-transformer.ts tests/transform-to-wave-tokens.test.ts tests/integration/theme-service.test.ts
git commit -m "fix(dt): normalize composite token values"
```

- [ ] **Step 9: critic-gate**

Spawn `critic-gate`:

```text
Review commit "fix(dt): normalize composite token values". Check that normalization is scoped to intended composite token types, does not break color-space conversion, and closes shadow/border matrix failures. Read-only. Return STATUS: PASS or FAIL.
```

---

### Task 4: Fix CSS/Sketch Border, Shadow, and Radius Schema Output

**Files:**
- Modify: `src/core/generator/formats/css.ts`
- Modify: `src/core/generator/formats/sketch.ts`
- Modify: `src/core/schema/theme.ts`
- Test: `tests/format-css.test.ts`
- Test: `tests/format-sketch.test.ts`
- Test: `tests/theme-schema.test.ts`
- Test: `tests/sketch-extension-schema.test.ts`

- [ ] **Step 1: Write failing CSS formatter tests for normal border tokens**

Add to `tests/format-css.test.ts`:

```ts
test('formats normal border tokens as CSS border values', () => {
	const tokens: WaveToken[] = [
		{
			name: 'theme-border-line-default',
			path: ['theme', 'border', 'line', 'default'],
			type: 'border',
			value: { color: '#2563eb', width: '2px', style: 'solid' },
			_order: 0,
		},
	];

	const out = cssVariablesFormat(tokens, {
		includeRootKeys: ['border'],
		filterLayer: 1,
	});

	expect(out).toContain('--border-line-default: 2px solid #2563eb;');
	expect(out).not.toContain('[object Object]');
});
```

- [ ] **Step 2: Write schema tests for radius cornerRadius**

Add to `tests/theme-schema.test.ts` or `tests/sketch-extension-schema.test.ts`:

```ts
test('accepts cornerRadius sketch property under theme.radius', () => {
	const result = themeSchema.safeParse({
		theme: {
			radius: {
				card: {
					$type: 'dimension',
					$value: 8,
					$extensions: {
						sketch: {
							property: {
								cornerRadius: true,
							},
						},
					},
				},
			},
		},
	});

	expect(result.success).toBe(true);
});
```

- [ ] **Step 3: Run tests to verify failures**

Run:

```bash
bun test tests/format-css.test.ts tests/theme-schema.test.ts tests/sketch-extension-schema.test.ts
```

Expected before fix:

- normal border CSS emits `[object Object]`;
- radius cornerRadius schema is rejected.

- [ ] **Step 4: Format all border tokens in CSS**

In `src/core/generator/formats/css.ts`, add:

```ts
function isBorderToken(token: WaveToken): boolean {
	return token.type === 'border';
}
```

Then in the token loop, after typography:

```ts
if (isBorderToken(token)) {
	lines.push(`  --${key}: ${formatBorderValue(token.value)};`);
	if (isOutlineBorder(token)) {
		lines.push(`  --${key}-offset: ${formatCssLength(token._outline!.offset)};`);
	}
	continue;
}
```

Remove the old outline-only branch.

- [ ] **Step 5: Make border formatter fail loud on unnormalized objects**

Modify `formatBorderValue`:

```ts
const rawColor = obj.color;
if (rawColor !== undefined && typeof rawColor !== 'string' && typeof rawColor !== 'number') {
	throw new Error('CSS border output requires normalized color');
}
const rawWidth = obj.width;
if (
	rawWidth !== undefined &&
	typeof rawWidth !== 'string' &&
	typeof rawWidth !== 'number'
) {
	throw new Error('CSS border output requires normalized width');
}
const width = formatCssLength(rawWidth);
const color = rawColor === undefined ? 'currentColor' : String(rawColor);
```

This prevents silent `[object Object]` or accidental `currentColor` for bad references.

- [ ] **Step 6: Update radius schema allowance**

In `src/core/schema/theme.ts`, update the root check for `cornerRadius` so it accepts both `dimension` and `radius` roots. The final error message should say:

```text
cornerRadius must be under a radius or dimension root
```

Do not broaden `opacity`; it remains state/dimension as currently accepted.

- [ ] **Step 7: Run formatter and schema tests**

Run:

```bash
bun test tests/format-css.test.ts tests/format-sketch.test.ts tests/theme-schema.test.ts tests/sketch-extension-schema.test.ts
```

Expected: pass.

- [ ] **Step 8: Run root matrix manually**

Run:

```bash
bun run src/index.ts dt build \
  -f /tmp/wave-root-matrix/main.yaml \
  -o /tmp/wave-root-matrix/out-fixed \
  --platform css,sketch
rg -n -- "\\[object Object\\]|currentColor|#000000ff" /tmp/wave-root-matrix/out-fixed
```

Expected:

- No `[object Object]` in CSS.
- No unintended `currentColor` for referenced border colors.
- No unintended `#000000ff` for referenced Sketch outline colors.

- [ ] **Step 9: Commit**

```bash
git add src/core/generator/formats/css.ts src/core/generator/formats/sketch.ts src/core/schema/theme.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/theme-schema.test.ts tests/sketch-extension-schema.test.ts
git commit -m "fix(dt): format border and radius outputs"
```

- [ ] **Step 10: critic-gate**

Spawn `critic-gate`:

```text
Review commit "fix(dt): format border and radius outputs". Check CSS border output, Sketch outline output, schema scope for radius cornerRadius, and no silent object fallback. Read-only. Return STATUS: PASS or FAIL.
```

---

### Task 5: Documentation, Final Matrix, and Release-Quality Verification

**Files:**
- Modify: `docs/research/handoff.md`
- Modify: `manual/pages/design-token.md`
- Modify: `docs/design-token.md`

- [ ] **Step 1: Update handoff with fixed status**

Append a new section to `docs/research/handoff.md`:

```md
## Manual Test Fix Status

Recorded at: paste the output of `date +%Y-%m-%dT%H:%M:%S%z`

The manual-test regressions recorded above have been fixed and released in 0.16.0.

Verified:

- packaged `dist/wave` loads built-in palette and dimension resources without cache;
- `dt doctor` defaults to `./main.yaml` when present;
- doctor reports legacy dimension resource/reference migration guidance;
- CSS/Sketch no longer output `[object Object]` for shadow or border cases in the root matrix;
- border outline color references resolve consistently for CSS and Sketch;
- `theme.radius.*` can use `sketch.property.cornerRadius`.
```

- [ ] **Step 2: Update user docs**

The doctor default and radius Sketch property behavior are user-visible. Update:

- `manual/pages/design-token.md`
- `docs/design-token.md`

Required doc facts:

- `wave dt doctor` checks `./main.yaml` by default when present.
- `theme.radius` is the preferred public root for radius tokens.
- `sketch.property.cornerRadius` can be used under `theme.radius`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun test \
  tests/cli-binary-resource.test.ts \
  tests/cli-dt-doctor-migration.test.ts \
  tests/transform-to-wave-tokens.test.ts \
  tests/format-css.test.ts \
  tests/format-sketch.test.ts \
  tests/theme-schema.test.ts \
  tests/sketch-extension-schema.test.ts \
  tests/integration/theme-service.test.ts
```

Expected: all pass.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm typecheck
bun test
pnpm build
git diff --check
```

Expected:

- typecheck passes;
- full test suite passes;
- build produces `dist/wave`;
- diff check passes.

- [ ] **Step 5: Run real smoke against `orca`**

Run:

```bash
rm -rf /tmp/wave-orca-final
wave_bin=/Users/teatao/.worktree/cli_wave/refactor-dt/dist/wave
set +e
"$wave_bin" dt build -f /Users/teatao/Projects/my-color/orca/main.yaml -o /tmp/wave-orca-final --platform css,sketch > /tmp/wave-orca-build.log 2>&1
build_status=$?
(cd /Users/teatao/Projects/my-color/orca && "$wave_bin" dt doctor) > /tmp/wave-orca-doctor-default.log 2>&1
doctor_default_status=$?
"$wave_bin" dt doctor -f /Users/teatao/Projects/my-color/orca/main.yaml > /tmp/wave-orca-doctor-file.log 2>&1
doctor_file_status=$?
set -e
test "$build_status" -eq 0
test "$doctor_default_status" -eq 1
test "$doctor_file_status" -eq 1
test -f /tmp/wave-orca-final/orca.css
test -f /tmp/wave-orca-final/orca2sketch.json
rg -n "Config File: Valid \\(orca\\)" /tmp/wave-orca-doctor-default.log
rg -n "theme.dimension is no longer a public output root" /tmp/wave-orca-doctor-default.log
if rg -n -- "\\[object Object\\]|1px solid currentColor" /tmp/wave-orca-final; then
  exit 1
fi
python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path('/tmp/wave-orca-final/orca2sketch.json').read_text())
for key, value in data.items():
    if 'outline' not in key or not isinstance(value, dict):
        continue
    shadow = value.get('shadow')
    if isinstance(shadow, list) and shadow and shadow[0].get('color') == '#000000ff':
        raise SystemExit(f'unexpected outline black fallback: {key}')
PY
```

Expected:

- build succeeds with packaged binary;
- doctor from the project directory inspects `./main.yaml` instead of printing `No themefile specified`;
- doctor gives migration guidance when legacy dimension dependencies remain;
- no accidental object output;
- no unintended border outline `currentColor` or Sketch black fallback for configured outline references.

- [ ] **Step 6: Commit docs/status**

```bash
git add docs/research/handoff.md manual/pages/design-token.md docs/design-token.md
git commit -m "docs(dt): record manual test fixes"
```

If docs did not need user-facing changes, commit only `docs/research/handoff.md`.

- [ ] **Step 7: final critic-gate**

Spawn `critic-gate`:

```text
Final read-only review for the manual-test fix series. Check all commits since 5b45993, plan fidelity, tests, docs, real orca smoke, and whether any known manual-test regression remains. Return STATUS: PASS or FAIL.
```

- [ ] **Step 8: Final status**

Run:

```bash
git status --short
git log --oneline -10
```

Expected:

- worktree clean;
- latest commits match the plan.

---

## Self-Review

- Spec coverage: covers dist resource loading, doctor/build mismatch, dimension migration guidance, shadow length normalization, border color/width normalization, normal border CSS output, outline CSS/Sketch output, radius cornerRadius schema, docs/status, and final `orca` smoke.
- Placeholder scan: no `TBD` or open-ended implementation placeholders remain; each task has files, tests, commands, expected outcomes, and commit/gate steps.
- Type consistency: all tasks use existing command names (`dt build`, `dt doctor`, `dt show`), current roots (`color`, `state`, `shadow`, `gradient`, `border`, `radius`, `font`), and existing formatter/test naming patterns.
