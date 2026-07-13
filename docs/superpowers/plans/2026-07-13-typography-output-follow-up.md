# Typography Output Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct computed Sketch line heights, carry typography color into CSS and Sketch, and reuse global CSS font-family variables.

**Architecture:** Preserve direct composite color reference metadata through resolution and transformation without exposing it in flat JSON. Let the CSS formatter resolve references against emitted tokens and deduplicate families by canonical value; let the Sketch formatter consume a transformer-normalized HEX color. Extend the downstream Sketch sync token contract with optional `textColor`.

**Tech Stack:** TypeScript strict ESM, Bun tests, pnpm, Sketch JavaScript API

---

### Task 1: Sketch computed line height

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/format-sketch.test.ts`

- [ ] Add a failing test expecting `14 * 1.33333` to become `19`, while an absolute `18.6px` remains `18.6`.
- [ ] Replace decimal rounding with `Math.ceil` only in the multiplier branch.
- [ ] Run `bun test tests/format-sketch.test.ts` and expect all tests to pass.
- [ ] Commit as `fix(dt): ceil computed sketch line heights`.

### Task 2: Preserve typography color metadata

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/core/resolver/reference-token-external.ts`
- Modify: `src/core/resolver/reference-token-internal.ts`
- Modify: `src/core/transformer/theme-transformer.ts`
- Test: `tests/resource-resolver.test.ts`
- Test: `tests/transform-to-wave-tokens.test.ts`

- [ ] Add failing tests showing a direct `$value.color` reference survives as internal reference metadata and produces a normalized target color.
- [ ] Add optional internal fields for the raw direct color reference and normalized typography color.
- [ ] Preserve direct string and DTCG color refs through both resolver passes; preserve prior metadata on later passes.
- [ ] Normalize the materialized typography color for formatter metadata while leaving `WaveToken.value.color` unchanged.
- [ ] Run the focused resolver and transformer tests and expect all tests to pass.

### Task 3: CSS color and font family reuse

**Files:**
- Modify: `src/core/generator/formats/css.ts`
- Test: `tests/format-css.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] Add failing tests for `--*-color: var(--color-*)`, matching global family reuse, deterministic duplicate selection, and unmatched family fallback.
- [ ] Canonically format `fontFamily` tokens and index emitted values by stable order.
- [ ] Pass the matched global family expression into typography formatting; omit only the redundant local family declaration.
- [ ] Resolve direct typography color refs only against emitted color tokens and emit a separate color variable.
- [ ] Run focused CSS and integration tests and expect all tests to pass.
- [ ] Commit Tasks 2-3 as `feat(dt): preserve typography color and family references`.

### Task 4: Sketch typography color

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/format-sketch.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] Add failing tests expecting `textStyle.textColor` as HEX8 without reference metadata.
- [ ] Emit normalized typography color as `textColor`; reject an invalid missing normalized value with the token path.
- [ ] Run focused Sketch and integration tests and expect all tests to pass.

### Task 5: Downstream Sketch sync

**Files:**
- Modify: `/Users/teatao/Projects/app_sketch-sync-token/plugins/sync-token/src/types/token.ts`
- Modify: `/Users/teatao/Projects/app_sketch-sync-token/plugins/sync-token/src/lib/normalize-token-file.ts`
- Modify: `/Users/teatao/Projects/app_sketch-sync-token/plugins/sync-token/src/lib/sync-text-styles.ts`
- Test: `/Users/teatao/Projects/app_sketch-sync-token/plugins/sync-token/src/lib/normalize-token-file.test.ts`
- Test: `/Users/teatao/Projects/app_sketch-sync-token/plugins/sync-token/src/lib/sync-text-styles.test.ts`

- [ ] Add failing tests for optional HEX6/HEX8 `textColor`, invalid color rejection, and applying color on add/update.
- [ ] Extend `TextStyleToken` and parser with normalized optional `textColor`.
- [ ] Apply `textColor` only when present so existing colorless files stay compatible.
- [ ] Run the plugin's focused tests and typecheck, then commit as `feat(sync-token): apply text style colors`.

### Task 6: Documentation and release gates

**Files:**
- Modify: `manual/pages/design-token.md`
- Modify: `docs/SPEC.md`
- Test: `tests/integration/theme-service.test.ts`

- [ ] Document computed line-height ceiling, CSS color reference output, Sketch resolved color output, and family reuse fallback.
- [ ] Build the manual and run `bun test`, `pnpm typecheck`, formatter checks, and `git diff --check`.
- [ ] Build `/Users/teatao/Projects/my-color/orca/main.yaml`; verify no repeated typography family declarations, CSS color vars reference theme colors, Sketch colors are HEX8, and source hash is unchanged.
- [ ] Run critic-gate review to PASS, fix any blocking findings, and commit docs as `docs(dt): clarify typography output behavior`.
