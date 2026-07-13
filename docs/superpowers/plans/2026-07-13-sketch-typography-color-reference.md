# Sketch Composite Color Reference Implementation Plan

**Goal:** Emit `@<filtered color key>` for direct current-theme color references used by Sketch typography, ordinary border, and outline ring slots, while keeping color tokens and unsupported consumers as HEX8.

**Architecture:** Preserve existing `_colorReference` for CSS. Use `_sketchColorReference` only for unmodified direct composite color references, and preserve alpha when an un-suffixed JSON Pointer resolves to a token object. The Sketch formatter indexes emitted color aliases by their current-pass filtered key. JSON Pointer aliases preserve token path segments; curly aliases are only generated for the resolver's safe curly grammar. It rejects alias or variable-key ambiguity, emits `@key` only for the Sketch-specific trusted metadata, and otherwise emits the slot's required HEX8 fallback.

**Tech Stack:** TypeScript strict ESM, Bun tests, Wave Sketch formatter

**Scope update:** `@` applies only to direct current-theme references in typography `textColor`, ordinary border `value.color`, and outline ring `shadow[0].color`. Color token outputs stay HEX8. Shadow, gradient, inheritColor, external references, literals, and alpha-overridden references stay HEX8.

---

### Baseline: Approved planning artifacts

- [ ] Run `pnpm check:ci` before committing the approved plan.
- [ ] Commit this approved spec and plan before code work: `git add docs/superpowers/specs/2026-07-13-sketch-typography-color-reference-design.md docs/superpowers/plans/2026-07-13-sketch-typography-color-reference.md && git commit -m "docs(dt): plan sketch typography color references"`.
- [ ] Confirm `git status --short` is empty before Task 1. All later green-node and final clean-worktree gates depend on this tracked baseline.

### Task 1: Direct-reference metadata and alpha contract

**Files:**
- Modify: `src/core/resolver/reference-utils.ts`
- Modify: `src/core/resolver/reference-token-external.ts`
- Modify: `src/core/resolver/reference-token-internal.ts`
- Modify: `src/core/transformer/color-value.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/types/index.ts`
- Modify: `tests/resource-resolver.test.ts`
- Modify: `tests/transform-to-wave-tokens.test.ts`
- Modify: `tests/format-css.test.ts`

- [ ] **Step 1: Add resolver and transformer regression coverage**

Keep the existing pure curly direct-reference assertion. Add pure JSON Pointer assertions for both `#/theme/color/text` and `#/theme/color/text/$value`. Add `color: { $ref: "#/theme/color/text", alpha: 0.5 }` and assert its materialized typography color is `#11223380`, its existing `_colorReference` remains available to CSS, and its `_sketchColorReference` is absent. Lock CSS's existing `var(--color-text)` result for that metadata.

- [ ] **Step 2: Implement source-metadata and alpha handling**

Keep `extractDirectColorReference()` unchanged. Add a dedicated pure-reference extractor that accepts a color `$ref` object only if `$ref` is its sole key, then carry `_sketchColorReference` through both resolver passes, the type definitions, and the transformer. In `normalizeColorValue()`, when a resolver-produced object holds both `$value` and `alpha`, carry alpha into color normalization instead of returning the raw `$value` result.

- [ ] **Step 3: Run focused tests and commit a green node**

Run `pnpm check:ci`.
Expected: PASS.

Run `git add src/core/resolver/reference-utils.ts src/core/resolver/reference-token-external.ts src/core/resolver/reference-token-internal.ts src/core/transformer/color-value.ts src/core/transformer/theme-transformer.ts src/types/index.ts tests/resource-resolver.test.ts tests/transform-to-wave-tokens.test.ts tests/format-css.test.ts`.
Run `git commit -m "fix(dt): preserve sketch color reference semantics"`.

### Task 2: Formatter variable index and existing integration expectation

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`
- Modify: `tests/format-sketch.test.ts`
- Modify: `tests/sketch-extension-format.test.ts`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Add formatter contract tests**

Cover safe curly references `{theme.color.text.default}` and `{theme.color.2x}`; `#/theme/color/brand/main` and `#/theme/color/brand/main/$value`; literal and external-reference HEX8 fallback; internal target excluded by `sketch.skip` and by `includeRootKeys`; and two emitted color tokens with distinct JSON output paths via `sketch.path` but the same `filterLayer` key.

Also cover nested `theme.color.a.b` and literal-key `theme.color["a.b"]`: their current-parser pointer aliases must map independently, and only the nested token may have the curly alias. This prevents `path.join('.')` from creating a false alias collision.

Update the existing hermetic Orca `font.body` expectation from `#0f172bff` to `@text-default` in this node, so the formatter commit remains green before the fixture is extended.

- [ ] **Step 2: Build unambiguous aliases from emission tokens**

```ts
function encodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function hasSafeCurlyPath(path: string[]): boolean {
  return (
    path.every((segment) => !segment.includes('.')) &&
    REFERENCE_PATTERN.test(`{${path.join('.')}}`)
  );
}
```

Import the shared `REFERENCE_PATTERN` instead of duplicating the resolver grammar. From `emissionTokens` with `value !== undefined` and `type === "color"`, map both pointer forms to `getFilteredName(token, filterLayer)`; add a curly alias only when `hasSafeCurlyPath` is true. The pointer encoder only mirrors the current parser's `~0`/`~1` support. Before every insert, reject an alias owned by another token and reject a filtered key owned by another token. Do not use `_sketch.path` in either identity.

- [ ] **Step 3: Route typography through the index**

Pass the index to `formatSketchTypography()` through `formatSketchValue()`. On a trusted `_sketchColorReference` alias match, emit `textColor: "@<filtered key>"`. When a trusted internal reference has no emitted color match, throw an error containing `tokenPathLabel(token)`. Preserve the current normalized HEX8 branch when the Sketch-specific metadata is absent, including literal, external, and alpha-override colors; do not consult `_colorReference` in the Sketch formatter.

- [ ] **Step 4: Run focused and full tests**

Run `pnpm check:ci`.
Expected: PASS.

- [ ] **Step 5: Commit a green node**

Run `git add src/core/generator/formats/sketch.ts tests/format-sketch.test.ts tests/sketch-extension-format.test.ts`.
Run `git add tests/integration/theme-service.test.ts`.
Run `git commit -m "feat(dt): preserve sketch typography color references"`.

### Milestone 1: Formatter contract gate

- [ ] Give the approved spec, Tasks 1-2 commits, and focused plus full test output to a read-only `critic-gate`.
- [ ] Resolve every FATAL finding and repeat the gate until `STATUS: PASS` before modifying the fixture or documentation.

### Task 2.5: Generalize Sketch composite color slots

**Files:**
- Modify: `src/core/resolver/reference-utils.ts`
- Modify: `src/core/resolver/reference-token-external.ts`
- Modify: `src/core/resolver/reference-token-internal.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/types/index.ts`
- Modify: `src/core/generator/formats/sketch.ts`
- Modify: `tests/resource-resolver.test.ts`
- Modify: `tests/transform-to-wave-tokens.test.ts`
- Modify: `tests/format-sketch.test.ts`
- Modify: `tests/sketch-extension-format.test.ts`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Add the un-suffixed Pointer regression at the resolver-to-transformer boundary**

Change the current alpha override test to `color: { $ref: "#/theme/color/text", alpha: 0.5 }`. Assert through real resolver and transformer output that `_typographyColor` is `#11223380`, `_colorReference` is retained for CSS, and the Sketch-only metadata is absent.

- [ ] **Step 2: Replace typography-only metadata with shared slot metadata**

Rename the internal `_sketchTypographyColorReference` to `_sketchColorReference`. Preserve it only for an unmodified direct composite `color` reference, and carry it through both resolver passes and the transformer for typography and border tokens. Do not change CSS's `_colorReference` behavior.

- [ ] **Step 3: Use one Sketch color-slot formatter**

Refactor typography to consume `_sketchColorReference`. For ordinary border output, replace only `value.color`; when no `@` applies, canonicalize the fallback to HEX8. For outline output, replace only the ring layer `shadow[0].color` and keep `shadow[1].color` as `#ffffffff`. A trusted internal reference whose target is skipped or root-excluded must throw with the consumer token path. Color token, shadow, gradient, and inheritColor branches must retain existing HEX behavior.

- [ ] **Step 4: Add focused regression coverage**

Cover curly, `#/...`, and `#/.../$value` references for border and outline; literal, external, and alpha-override HEX8 fallback; skipped and root-excluded target errors; and negative HEX-only coverage for shadow, gradient, and inheritColor. Update existing Orca antline and root-matrix outline expectations in `tests/integration/theme-service.test.ts` in this same node so `pnpm check:ci` remains green.

- [ ] **Step 5: Verify and commit a green node**

Run `pnpm check:ci`.
Expected: PASS.

Run `git add src/core/resolver/reference-utils.ts src/core/resolver/reference-token-external.ts src/core/resolver/reference-token-internal.ts src/core/transformer/theme-transformer.ts src/types/index.ts src/core/generator/formats/sketch.ts tests/resource-resolver.test.ts tests/transform-to-wave-tokens.test.ts tests/format-sketch.test.ts tests/sketch-extension-format.test.ts tests/integration/theme-service.test.ts`.
Run `git commit -m "feat(dt): reference sketch composite colors"`.

### Milestone 1.5: Composite color-slot gate

- [ ] Give the approved spec, Task 2.5 commit, and full test output to a read-only `critic-gate`.
- [ ] Resolve every FATAL finding and repeat the gate until `STATUS: PASS` before extending the fixture.

### Task 3: Hermetic Orca integration contract

**Files:**
- Modify: `tests/fixtures/themes/orca-realistic/main.yaml`
- Modify: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Extend the fixture without external-file dependency**

Reuse existing `theme.color.text.default`; add `emphasis` and `subtlest`. Add `theme.font.heading` and `theme.font.display` with `sketch.path` values matching real Orca and explicit `sketch.skip: false` to override the inherited font-group skip. Keep the existing `font.body` curly reference, whose `@text-default` expectation is already updated in Task 2. Retain Task 2.5's antline expectation and add an outline direct-reference fixture whose ring is `@key` while its gap stays `#ffffffff`.

Use the three reference forms below so integration coverage exercises resolver -> transformer -> formatter:

```yaml
h1:
  $value:
    color: "{theme.color.text.emphasis}"
body:
  $value:
    color:
      $ref: "#/theme/color/text/default"
footnote:
  $value:
    color:
      $ref: "#/theme/color/text/subtlest/$value"
```

Add hermetic fixture cases for a current-parser escaped key containing `.`, `/`, and `~`, an external resource color, a literal color, and a current-theme `{ $ref, alpha }` override. Assert that the escaped-pointer case emits its filtered `@key`, while external, literal, and alpha-override cases emit exact HEX8. No integration test may read `/Users/teatao/Projects/my-color/orca`.

- [ ] **Step 2: Add integration expectations**

```ts
expect(sketch.v2.heading['heading-h1'].textStyle.textColor).toBe(
  '@text-emphasis',
);
expect(sketch.v2.display['display-body'].textStyle.textColor).toBe(
  '@text-default',
);
expect(sketch.v2.display['display-footnote'].textStyle.textColor).toBe(
  '@text-subtlest',
);
```

- [ ] **Step 3: Run the hermetic integration test**

Run `pnpm check:ci`.
Expected: PASS without reading `/Users/teatao/Projects/my-color/orca`.

- [ ] **Step 4: Commit fixture and integration coverage**

Run `git add tests/fixtures/themes/orca-realistic/main.yaml tests/integration/theme-service.test.ts`.
Run `git commit -m "test(dt): cover sketch composite color references"`.

### Milestone 2: Integration contract gate

- [ ] Give the approved spec, Task 3 commit, and hermetic integration-test output to a read-only `critic-gate`.
- [ ] Resolve every FATAL finding and repeat the gate until `STATUS: PASS` before modifying documentation.

### Task 4: User and maintainer contract documentation

**Files:**
- Modify: `manual/pages/design-token.md`
- Modify: `docs/SPEC.md`

- [ ] **Step 1: Document the contract**

Document `#RRGGBBAA` as a literal and `@<filterLayer-key>` as a direct current-document `theme.*` color reference. State that external resources and color expressions with overrides remain literal; the key is independent of `sketch.path`; and an unavailable internal target fails the Sketch build rather than falling back. State that the output contract is owned by Wave and current Sync Token consumption is a separately scheduled repository change.

- [ ] **Step 2: Run the manual build**

Run `pnpm check:ci`.
Expected: PASS.

- [ ] **Step 3: Commit documentation separately**

Run `git add manual/pages/design-token.md docs/SPEC.md`.
Run `git commit -m "docs(dt): document sketch color references"`.

### Task 5: Full verification

**Files:**
- Verify: `/Users/teatao/Projects/my-color/orca/main.yaml`
- Verify: `/Users/teatao/Projects/my-color/orca/theme/orca2sketch.json`

- [ ] **Step 1: Run all Wave gates**

Run `pnpm check:ci && git diff --check && test -z "$(git status --porcelain)"`.
Expected: PASS.

- [ ] **Step 2: Build real Orca output**

Record `shasum -a 256 /Users/teatao/Projects/my-color/orca/main.yaml` before the build. Run `pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml`, then use a Node assertion over `/Users/teatao/Projects/my-color/orca/theme/orca2sketch.json`: exactly seven text styles must be present; `v2.heading["heading-h1"]` through `v2.heading["heading-h5"]` must be `@text-emphasis`; `v2.display["display-body"]` must be `@text-default`; `v2.display["display-footnote"]` must be `@text-subtlest`; and `v2.outline["outline-ring"].shadow[0].color` must be `@outline-ring` while `shadow[1].color` remains `#ffffffff`. Record the hash again.
Expected: all assertions pass and `main.yaml` hash is unchanged before and after. Do not invoke Sync Token here; its `@` importer is outside this repository's approved scope.

- [ ] **Step 3: Run final critic-gate**

Give the approved spec, commits, test output, and Orca artifact to a read-only critic-gate. After any change made after Task 5 verification begins, rerun Step 1 and Step 2 before re-running this gate. Finish only at `STATUS: PASS` with clean `git status`.
