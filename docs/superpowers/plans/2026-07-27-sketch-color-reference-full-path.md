# Sketch Color Reference Full Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `yes-subagents` to implement this plan task-by-task and run the specified critic gates. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sketch `@<filtered-key>` color references with breaking `@/<full-output-path>` references, allow the same leaf key under different output paths, and reject every exact or prefix output-tree collision before serialization or file writes.

**Architecture:** Keep `_sketchColorReference` as the authoritative direct-source metadata. In `sketchFormat()`, derive one filtered `writeTokens` list, preflight every full `buildOutputPath()`, then build an alias-to-encoded-output-path index from the emitted color subset. Typography, ordinary border, and outline ring continue to share `formatSketchColorSlot()`; unsupported slots continue to materialize HEX8.

**Tech Stack:** TypeScript strict ESM, Bun tests, Wave formatter/generator pipeline, Changesets

**Requirement baseline:** `.tmp/issue-sketch-color-reference-full-path.md`

---

### Task 0: Record the reviewed baseline

**Files:**
- Create: `docs/superpowers/plans/2026-07-27-sketch-color-reference-full-path.md`
- Reference only: `.tmp/issue-sketch-color-reference-full-path.md`

- [ ] **Step 1: Confirm the worktree boundary**

Run:

```bash
/opt/homebrew/bin/git status --short
```

Expected: the existing user-owned `.gitignore` change may remain; do not stage or alter it. No implementation file is modified before the plan baseline is committed.

- [ ] **Step 2: Run the pre-implementation gate**

Run:

```bash
pnpm check:ci
```

Expected: PASS. If it fails, stop and record the baseline failure before implementing this plan.

- [ ] **Step 3: Commit only the reviewed plan**

```bash
git add docs/superpowers/plans/2026-07-27-sketch-color-reference-full-path.md
git commit -m "docs(dt): plan full sketch color reference paths"
```

Expected: the issue remains intact at `.tmp/issue-sketch-color-reference-full-path.md`; `.gitignore` is not staged.

### Task 1: Implement the formatter contract and output-tree preflight

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/format-sketch.test.ts`
- Test: `tests/sketch-extension-format.test.ts`

- [ ] **Step 1: Change existing color-reference expectations to full output paths**

In `tests/format-sketch.test.ts`, keep the existing direct-reference test data and change the expected values:

```ts
expect(parsed.body.textStyle.textColor).toBe('@/text-default');
expect(parsed['numeric-reference'].textStyle.textColor).toBe('@/2x');
expect(parsed.pointer.textStyle.textColor).toBe('@/brand-main');
expect(parsed['pointer-value'].textStyle.textColor).toBe('@/brand-main');

for (const key of ['curly', 'pointer', 'pointer-value']) {
	expect(parsed[key].value.color).toBe('@/text-default');
	expect(parsed[`outline-${key}`].shadow[0].color).toBe('@/text-default');
	expect(parsed[`outline-${key}`].shadow[1].color).toBe('#ffffffff');
}
```

In `tests/sketch-extension-format.test.ts`, update `keeps nested and dotted-key JSON Pointer aliases distinct`:

```ts
expect(parsed.nested.textStyle.textColor).toBe('@/a-b');
expect(parsed.dotted.textStyle.textColor).toBe('@/a.b');
```

Keep literal, external, alpha-override, color-token, shadow, gradient, and inheritColor assertions unchanged as HEX8.

- [ ] **Step 2: Add full-path, same-leaf, and RFC 6901 formatter tests**

Add one test in `tests/format-sketch.test.ts` and call `sketchFormat(tokens, { filterLayer: 3 })`. Use these exact identities:

```ts
const v1Target = {
	name: 'theme-color-v1-foo',
	path: ['theme', 'color', 'v1', 'foo'],
	value: '#112233',
	type: 'color',
	_sketch: { path: 'v1/color' },
	_order: 0,
} satisfies WaveToken;
const v2Target = {
	name: 'theme-color-v2-foo',
	path: ['theme', 'color', 'v2', 'foo'],
	value: '#445566',
	type: 'color',
	_sketch: { path: 'v2/color' },
	_order: 1,
} satisfies WaveToken;
```

Add typography consumers at `['theme', 'font', 'style', 'body-v1']` and `['theme', 'font', 'style', 'body-v2']`. Set their `_sketchColorReference` values to `{theme.color.v1.foo}` and `{theme.color.v2.foo}` respectively. Both targets have filtered leaf `foo`, distinct source aliases, and distinct full output paths. Assert the target nodes and references:

```ts
expect(parsed.v1.color.foo).toEqual({ color: '#112233ff' });
expect(parsed.v2.color.foo).toEqual({ color: '#445566ff' });
expect(parsed['body-v1'].textStyle.textColor).toBe('@/v1/color/foo');
expect(parsed['body-v2'].textStyle.textColor).toBe('@/v2/color/foo');
```

In a separate test, use `filterLayer: 2` with target path `['theme', 'color', 'text', 'escaped.key/~color']` and `_sketch: { path: 'foundation/color' }`. Reference it through `#/theme/color/text/escaped.key~1~0color` and assert:

```ts
expect(parsed.escaped.textStyle.textColor).toBe(
	'@/foundation/color/text-escaped.key~1~0color',
);
```

These assertions prove that `.` remains literal, `~` becomes `~0`, `/` becomes `~1`, and `sketch.path` segments participate in the reference identity.

- [ ] **Step 3: Replace the obsolete filtered-key collision test**

In `tests/sketch-extension-format.test.ts`, replace `rejects filtered color key collisions regardless of sketch.path` with `allows duplicate filtered color keys under distinct output paths`. Parse the two existing color tokens and assert both nodes exist:

```ts
expect(parsed.foundation.color['text-default']).toEqual({ color: '#112233ff' });
expect(parsed.foundation.state['text-default']).toEqual({ color: '#445566ff' });
```

Do not retain any expectation for `Duplicate Sketch color variable key`.

- [ ] **Step 4: Add exact and strict-prefix collision tests for all emitted token types**

In `tests/sketch-extension-format.test.ts`, update `detects duplicate sketch output paths` to expect `Duplicate Sketch output path` rather than the removed filtered-key error.

Add table-driven strict-prefix cases using non-color dimension tokens with paths `group/foo` and `group/foo/bar`. Run each order:

```ts
for (const orderedTokens of [tokens, [...tokens].reverse()]) {
	expect(() => sketchFormat(orderedTokens, { filterLayer: 2 })).toThrow(
		'Duplicate Sketch output path',
	);
}
```

Add a mixed-type exact collision using one color and one dimension token that resolve to the same `buildOutputPath()`. Assert the same error prefix. These cases prove the invariant applies to the complete write set, not only color tokens.

- [ ] **Step 5: Lock the preflight set and alias uniqueness**

Add three collision pairs in `tests/sketch-extension-format.test.ts` where one conflicting token is respectively:

```ts
{ ...token, value: undefined }
{ ...token, _sketch: { ...token._sketch, skip: true } }
```

and root-excluded through:

```ts
sketchFormat(tokens, { filterLayer: 2, includeRootKeys: ['color'] })
```

Assert each build succeeds and contains only the actual write token.

Extend `rejects composite references to skipped or root-excluded color targets` with a target clone whose `value` is `undefined`. Call `sketchFormat([undefinedTarget, body])` and assert the error contains `theme.font.body`; repeat with `border` and assert `theme.border.focus`. This independently proves that a non-writable direct target reports the consumer path rather than falling back to HEX8.

Add a duplicate source-alias test with two color tokens that share the same `token.path`, use distinct `name` values and distinct `_sketch.path` values, and call `sketchFormat(tokens, { filterLayer: 99 })`. Their output paths remain distinct while their aliases collide. Assert:

```ts
expect(() => sketchFormat(tokens, { filterLayer: 99 })).toThrow(
	'Duplicate Sketch color reference alias',
);
```

- [ ] **Step 6: Run the focused tests and confirm they fail for the intended reasons**

Run:

```bash
bun test tests/format-sketch.test.ts tests/sketch-extension-format.test.ts
```

Expected: FAIL because references still use short keys, including the nested/dotted alias assertions; same-leaf colors are rejected; and prefix collisions are not preflighted in both orders.

- [ ] **Step 7: Build one full output path and one Pointer payload helper**

In `src/core/generator/formats/sketch.ts`, keep `buildOutputPath()` as the only path builder and add:

```ts
function buildSketchReferencePath(
	token: WaveToken,
	filterLayer: number,
): string {
	return `/${buildOutputPath(token, filterLayer)
		.map(encodeJsonPointerSegment)
		.join('/')}`;
}
```

This returns the JSON Pointer payload only. `formatSketchColorSlot()` remains responsible for adding the `@` discriminator.

- [ ] **Step 8: Replace the alias-to-key index with alias-to-path**

Rename `buildSketchColorReferenceKeys()` to `buildSketchColorReferencePaths()` and remove the `keys` map plus `Duplicate Sketch color variable key` branch. Preserve the alias ownership check and map each alias to the target path:

```ts
function buildSketchColorReferencePaths(
	writeTokens: WaveToken[],
	filterLayer: number,
): Map<string, string> {
	const aliases = new Map<string, WaveToken>();
	const colorReferencePaths = new Map<string, string>();

	for (const token of writeTokens) {
		if (token.type !== 'color') continue;
		const referencePath = buildSketchReferencePath(token, filterLayer);

		for (const alias of colorReferenceAliases(token)) {
			const aliasOwner = aliases.get(alias);
			if (aliasOwner !== undefined && aliasOwner !== token) {
				throw new Error(
					`Duplicate Sketch color reference alias "${alias}" at ${tokenPathLabel(token)}`,
				);
			}
			aliases.set(alias, token);
			colorReferencePaths.set(alias, referencePath);
		}
	}

	return colorReferencePaths;
}
```

Rename the corresponding parameters in `formatSketchColorSlot()`, `formatSketchTypography()`, and `formatSketchValue()`. The slot formatter must use:

```ts
const referencePath = colorReferencePaths.get(reference);
if (referencePath !== undefined) return `@${referencePath}`;
```

Keep the internal-target error and HEX8 fallback branches unchanged.

- [ ] **Step 9: Add a deterministic output-tree preflight**

Add these helpers beside `buildOutputPath()`:

```ts
interface SketchOutputEntry {
	token: WaveToken;
	path: string[];
}

function compareOutputPaths(left: string[], right: string[]): number {
	const sharedLength = Math.min(left.length, right.length);
	for (let i = 0; i < sharedLength; i++) {
		if (left[i] === right[i]) continue;
		return left[i]! < right[i]! ? -1 : 1;
	}
	return left.length - right.length;
}

function assertUniqueSketchOutputPaths(
	writeTokens: WaveToken[],
	filterLayer: number,
): void {
	const entries: SketchOutputEntry[] = writeTokens
		.map((token) => ({ token, path: buildOutputPath(token, filterLayer) }))
		.sort((left, right) => compareOutputPaths(left.path, right.path));

	for (let i = 1; i < entries.length; i++) {
		const previous = entries[i - 1]!;
		const current = entries[i]!;
		const previousIsPrefix = previous.path.every(
			(segment, index) => segment === current.path[index],
		);
		if (!previousIsPrefix) continue;

		throw new Error(
			`Duplicate Sketch output path "${previous.path.join('/')}" conflicts with "${current.path.join('/')}" at ${tokenPathLabel(current.token)}`,
		);
	}
}
```

Lexicographic sorting makes an exact match or strict prefix adjacent. The shared error prefix stays compatible with current duplicate-path diagnostics and does not depend on input order.

- [ ] **Step 10: Make the write set authoritative**

In `sketchFormat()`, derive and use one list:

```ts
const writeTokens = allTokens.filter(
	(token) =>
		shouldIncludeSketchToken(token, includeRootKeys) &&
		token._sketch?.skip !== true &&
		token.value !== undefined,
);

assertUniqueSketchOutputPaths(writeTokens, filterLayer);
const colorReferencePaths = buildSketchColorReferencePaths(
	writeTokens,
	filterLayer,
);

for (const token of writeTokens) {
	const outputPath = buildOutputPath(token, filterLayer);
	const value = formatSketchValue(token, allTokens, colorReferencePaths);
	setNestedValue(result, outputPath, value, token);
}
```

Retain `allTokens` for inheritColor sibling lookup. Retain `setNestedValue()` checks as defensive assertions even though preflight now owns collision detection.

- [ ] **Step 11: Format touched files and run the formatter gate**

Run:

```bash
pnpm exec biome check --write src/core/generator/formats/sketch.ts tests/format-sketch.test.ts tests/sketch-extension-format.test.ts
bun test tests/format-sketch.test.ts tests/sketch-extension-format.test.ts
```

Expected: PASS. Do not run `pnpm check:ci` at this node: the repository integration fixture still asserts the old breaking contract until Task 2. Task 0 already established the green pre-implementation baseline; Task 2 restores and verifies the full-suite contract.

- [ ] **Step 12: Commit the formatter contract**

```bash
git add src/core/generator/formats/sketch.ts tests/format-sketch.test.ts tests/sketch-extension-format.test.ts
git commit -m "feat(dt): emit full sketch color reference paths"
```

### Milestone 1: Formatter contract gate

- [ ] Give `.tmp/issue-sketch-color-reference-full-path.md`, this plan, the Task 1 commit, the green Task 0 baseline, and focused formatter-test output to a read-only `critic-gate`.
- [ ] Resolve every FATAL finding and repeat the direct tests and gate until `STATUS: PASS` before changing integration fixtures or documentation.

### Task 2: Prove generator atomicity and hermetic reference integrity

**Files:**
- Test: `tests/token-generator.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Add the multi-platform zero-write regression**

In `tests/token-generator.test.ts`, add:

```ts
test('writes no platform outputs when sketch path preflight fails', async () => {
	await withTempDir(async (outputDir) => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-radius-foo',
				path: ['theme', 'radius', 'foo'],
				value: 4,
				type: 'dimension',
				_sketch: { path: 'group' },
				_order: 0,
			},
			{
				name: 'theme-radius-bar',
				path: ['theme', 'radius', 'bar'],
				value: 8,
				type: 'dimension',
				_sketch: { path: 'group/foo' },
				_order: 1,
			},
		];

		const result = await generateTokens({
			themeName: 'atomic',
			outputDir,
			tokens,
			platform: ['json', 'css', 'sketch'],
			filterLayer: 2,
		});

		expect(result.success).toBe(false);
		expect(result.files).toEqual([]);
		expect(result.error).toContain('Duplicate Sketch output path');
		expect(await fs.readdir(outputDir)).toEqual([]);
	});
});
```

The JSON and CSS formatters run before Sketch, but `generateTokens()` must not write either pending output after Sketch formatting fails.

- [ ] **Step 2: Add reusable hermetic Pointer validation helpers**

Near the existing helpers in `tests/integration/theme-service.test.ts`, add:

```ts
function decodeJsonPointerSegment(segment: string): string {
	if (/~(?:[^01]|$)/.test(segment)) {
		throw new Error(`Invalid JSON Pointer escape in segment "${segment}"`);
	}
	return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function collectSketchReferences(
	value: unknown,
	result: string[] = [],
): string[] {
	if (typeof value === 'string') {
		if (value.startsWith('@')) result.push(value);
		return result;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectSketchReferences(item, result);
		return result;
	}
	if (typeof value === 'object' && value !== null) {
		for (const item of Object.values(value)) {
			collectSketchReferences(item, result);
		}
	}
	return result;
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
	if (!pointer.startsWith('/')) return undefined;
	return pointer
		.slice(1)
		.split('/')
		.map(decodeJsonPointerSegment)
		.reduce<unknown>((current, segment) => {
			if (typeof current !== 'object' || current === null) return undefined;
			if (!Object.hasOwn(current, segment)) return undefined;
			return (current as Record<string, unknown>)[segment];
		}, root);
}
```

- [ ] **Step 3: Update the hermetic Orca expectations**

In `orca-realistic materializes typography and preserves platform output contracts`, change only Sketch reference expectations:

```ts
expect(sketch.foundation.font.body.textStyle.textColor).toBe(
	'@/foundation/color/text-default',
);
expect(sketch.v2.heading['heading-h1'].textStyle.textColor).toBe(
	'@/foundation/color/text-emphasis',
);
expect(sketch.v2.heading['heading-escaped'].textStyle.textColor).toBe(
	'@/foundation/color/text-escaped.key~1~0color',
);
expect(sketch.v2.display['display-body'].textStyle.textColor).toBe(
	'@/foundation/color/text-default',
);
expect(sketch.v2.display['display-footnote'].textStyle.textColor).toBe(
	'@/foundation/color/text-subtlest',
);
expect(sketch.v2.display['display-alias'].textStyle.textColor).toBe(
	'@/foundation/color/direct-alias',
);
expect(sketch.foundation.border.antline.value.color).toBe(
	'@/foundation/color/primary-main',
);
expect(sketch.foundation.border.outline.shadow[0].color).toBe(
	'@/foundation/color/outline-ring',
);
```

Keep the existing HEX8 expectations for external, literal, alpha, shadow, gradient, inheritColor, and outline gap values. The `display-alias` and outline assertions remain the two-hop direct-target regression.

In `normalizes shadow lengths and outline border color references`, update all seven current short-reference expectations:

```ts
expect(sketch['border-outline-token-curly-base'].shadow[0].color).toBe(
	'@/color-base',
);
expect(sketch['border-outline-token-curly-alias'].shadow[0].color).toBe(
	'@/color-alias',
);
expect(sketch['border-outline-token-curly-external'].shadow[0].color).toBe(
	'@/color-external',
);
expect(sketch['border-outline-pointer-token'].shadow[0].color).toBe(
	'@/color-base',
);
expect(sketch['border-outline-pointer-value'].shadow[0].color).toBe(
	'@/color-base',
);
expect(sketch['border-outline-pointer-alias-value'].shadow[0].color).toBe(
	'@/color-alias',
);
expect(sketch['border-outline-ref-width'].shadow[0]).toMatchObject({
	spread: 6,
	color: '@/color-base',
});
```

The fixture data is unchanged in this task. Every current `@` consumer has an explicit expected source target above. Any future fixture change that adds an `@` consumer must add its explicit direct-target assertion in this test; the generic validator in Step 4 proves structural validity, not direct-source intent.

- [ ] **Step 4: Validate every generated reference against the artifact**

After the explicit Orca assertions, add:

```ts
const references = collectSketchReferences(sketch);
expect(references.length).toBeGreaterThan(0);
for (const reference of references) {
	expect(reference.startsWith('@/')).toBe(true);
	const target = resolveJsonPointer(sketch, reference.slice(1));
	expect(target).toEqual(
		expect.objectContaining({
			color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
		}),
	);
}
```

This validates the emitted JSON itself. It must not read `/Users/teatao/Projects/my-color/orca` or infer target paths from YAML.

- [ ] **Step 5: Run focused integration and full checks**

Run:

```bash
pnpm exec biome check --write tests/token-generator.test.ts tests/integration/theme-service.test.ts
bun test tests/token-generator.test.ts tests/integration/theme-service.test.ts
pnpm check:ci
```

Expected: PASS without reading or writing the real Orca repository.

- [ ] **Step 6: Commit the hermetic verification**

```bash
git add tests/token-generator.test.ts tests/integration/theme-service.test.ts
git commit -m "test(dt): verify sketch reference output integrity"
```

### Milestone 2: Artifact integrity gate

- [ ] Give the approved baseline, Tasks 1-2 commits, and focused plus full test output to a read-only `critic-gate`.
- [ ] Resolve every FATAL finding and repeat the affected tests and gate until `STATUS: PASS` before documenting the contract.

### Task 3: Publish the breaking Wave contract in docs and Changesets

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token-color-typography.md`
- Modify: `manual/pages/design-token-extensions-output.md`
- Modify: `docs/superpowers/specs/2026-07-13-sketch-typography-color-reference-design.md`
- Create: `.changeset/bright-waves-point.md`

- [ ] **Step 1: Update the user-facing color reference contract**

In `manual/pages/design-token-color-typography.md`, replace the `@<filterLayer-key>` paragraph with:

```md
Sketch color slot 的默认真值是 `#RRGGBBAA`。只有同一份主题中直接引用当前 `theme.color.*` token，且目标会输出到同一份 Sketch JSON 时，Wave 才会在 typography 的 `textStyle.textColor`、普通 border 的 `value.color` 或 outline ring 的第一层 `shadow[0].color` 输出 `@/<full-output-path>`。

`@` 后的内容是 RFC 6901 JSON Pointer，直接指向 `{ "color": ... }` 所在的 emitted color token node。完整路径同时包含 `sketch.path` 和经 `filterLayer` 处理的叶子 key；`~` 编码为 `~0`，`/` 编码为 `~1`。旧 `@<filterLayer-key>` 合同不再兼容。
```

Keep the documented consumer whitelist and HEX8 fallbacks unchanged.

- [ ] **Step 2: Document full-path grouping and collision invariants**

In `manual/pages/design-token-extensions-output.md`, after the `sketch.path` output example, add:

```md
Sketch 颜色引用使用目标 token 的完整输出路径，因此不同 `sketch.path` 下可以存在相同叶子名，例如 `v1/color/foo` 与 `v2/color/foo`。引用会分别写为 `@/v1/color/foo` 与 `@/v2/color/foo`。

所有实际输出的 Sketch token 必须组成无冲突的对象树。两个 token 的完整输出路径相同，或一个路径是另一个路径的严格前缀时，构建会在写文件前失败。
```

Keep the existing `sketch.path` syntax restrictions unchanged.

- [ ] **Step 3: Update the maintainer behavior snapshot**

In `docs/SPEC.md`, replace the short-key bullets with the approved contract:

```md
- Sketch composite color-slot 合同：`#RRGGBBAA` 是所有 color slot 的真值和非变量 fallback。仅当值是同文档、直接的 current-theme color reference，且目标 color token 在同一 Sketch emission list 中时，才输出 `@/<full-output-path>`；支持的 consumer 仅为 typography `textStyle.textColor`、普通 border `value.color` 和 outline ring `shadow[0].color`
- `@` 后的 payload 是 RFC 6901 JSON Pointer，直接指向 emitted color token node。路径由目标 token 的 `buildOutputPath()` 生成，包含 `sketch.path` 和 `filterLayer` 后叶子 key；不同完整路径可以使用相同叶子 key
- 所有实际可写 Sketch token 在 formatter 写入前统一检查 exact/prefix output path collision；检测与 token 顺序无关，失败时 `generateTokens()` 不写本次 pending outputs
```

Keep CSS and unsupported Sketch slot behavior unchanged.

- [ ] **Step 4: Mark the historical design as superseded**

Immediately after the title in `docs/superpowers/specs/2026-07-13-sketch-typography-color-reference-design.md`, add:

```md
> **Superseded:** 本文记录 Wave 0.17.0 的 `@<filtered-key>` 历史合同。当前合同使用 `@/<full-output-path>`；现行行为以 `docs/SPEC.md` 和用户手册为准。
```

Do not rewrite the historical design body.

- [ ] **Step 5: Add the pre-1.0 minor changeset**

Create `.changeset/bright-waves-point.md`:

```md
---
"wave": minor
---

Replace Sketch color references with full output-path JSON Pointers and allow identical leaf keys under distinct Sketch paths. This is a breaking output-contract change: existing Sync Token versions cannot import the new references until their follow-up update.
```

Do not edit `package.json` directly; Changesets remains responsible for the version derived from its current source version.

- [ ] **Step 6: Scan for stale current-contract wording**

Run:

```bash
rg -n --pcre2 '[\x22\x27\x60]@(?!/)[A-Za-z0-9]' tests/format-sketch.test.ts tests/sketch-extension-format.test.ts tests/integration/theme-service.test.ts
rg -n --pcre2 '[\x22\x27\x60]@(?!/)[A-Za-z0-9._~-]+(?=[\x22\x27\x60])' docs/SPEC.md manual/pages/design-token-color-typography.md manual/pages/design-token-extensions-output.md
rg -n '(@<filterLayer-key>|@<key>|key 只由.*filterLayer|不依赖 `?sketch\.path`?)' docs/SPEC.md manual/pages/design-token-color-typography.md manual/pages/design-token-extensions-output.md
```

Expected: all three commands return no matches. The first rejects any quoted or backticked test `@key` that does not start with `@/`, including aliases that contain raw `/`. The second rejects a complete quoted or backticked short `@key` in current docs without mistaking scoped package names such as `@clack/prompts` for Sketch references. The third rejects obsolete named contract phrases. The superseded historical design is intentionally outside this scan.

- [ ] **Step 7: Run the final direct verification**

Run:

```bash
pnpm check:ci
/opt/homebrew/bin/git diff --check
```

Expected: PASS. `check:ci` covers typecheck, Bun tests, CLI/manual builds, and style checks.

- [ ] **Step 8: Commit docs and release metadata**

```bash
git add docs/SPEC.md manual/pages/design-token-color-typography.md manual/pages/design-token-extensions-output.md docs/superpowers/specs/2026-07-13-sketch-typography-color-reference-design.md .changeset/bright-waves-point.md
git commit -m "docs(dt): document full sketch color reference paths"
```

### Milestone 3: Final contract gate

- [ ] Give the approved issue and plan, all implementation commits, `pnpm check:ci`, stale-wording scan, and `git diff --check` output to a read-only `critic-gate`.
- [ ] Resolve every FATAL finding and repeat the affected verification and gate until `STATUS: PASS`.
- [ ] Confirm `/opt/homebrew/bin/git status --short` contains no task-owned uncommitted files; preserve the pre-existing `.gitignore` change.

## Completion Criteria

- Every trusted Sketch color reference is `@` plus a JSON Pointer to a unique emitted color token node.
- Same-leaf colors under distinct full paths build and bind independently.
- Exact and strict-prefix collisions fail deterministically for color and non-color tokens before formatter serialization and before `generateTokens()` writes any platform output.
- Hermetic integration validates every generated reference against the generated JSON; no test or gate depends on the live Orca repository.
- Current docs and a `minor` changeset declare the breaking cutover; the historical 0.17.0 design remains intact and marked superseded.
