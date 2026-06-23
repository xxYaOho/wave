# Sketch Sync Token Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust Sketch JSON output leaves so the sync-token Sketch plugin can import colors and layer styles reliably.

**Architecture:** Keep `sketch.path` as the only grouping mechanism. Change only the Sketch formatter leaf contract: colors, shadows, gradients, opacity, and radius each emit explicit plugin-facing objects.

**Tech Stack:** TypeScript, Bun test, existing Wave token transformer and `sketchFormat()`.

---

### Task 1: Lock Formatter Contract With Tests

**Files:**
- Modify: `tests/sketch-extension-format.test.ts`
- Modify: `tests/format-sketch.test.ts`
- Modify: `tests/quality-harness.test.ts`

- [ ] Add failing expectations that color leaves are `{ color: "#RRGGBBAA" }`, not strings.
- [ ] Add failing expectations that shadow leaves are `{ shadow: [...] }`.
- [ ] Add failing expectations that gradient leaves are `{ gradient: [...] }`.
- [ ] Add failing expectations that radius leaves are `{ corners: { radii: number } }`.
- [ ] Keep opacity expectations as `{ opacity: number }`.
- [ ] Run `bun test tests/sketch-extension-format.test.ts tests/format-sketch.test.ts tests/quality-harness.test.ts` and confirm the failures describe the old leaf contract.

### Task 2: Implement Leaf Contract

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`

- [ ] Update color output to always return `{ color: hex8 }` for normal color tokens.
- [ ] Update `hexToSketchColor()` to normalize `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA` to lowercase `#RRGGBBAA`.
- [ ] Keep `sketch.property.opacity` output as `{ opacity: number }`.
- [ ] Change `sketch.property.cornerRadius` output to `{ corners: { radii: number } }`.
- [ ] Change shadow token output to `{ shadow: layers }`.
- [ ] Change gradient token output to `{ gradient: stops }`.

### Task 3: Update Impacted Docs And Real Fixture Assertions

**Files:**
- Modify: `manual/pages/design-token.md`
- Modify: `docs/SPEC.md`
- Modify as needed: `tests/cli-dt.test.ts`
- Modify as needed: `tests/integration/theme-service.test.ts`
- Modify as needed: `tests/inherit-color-sketch-format.test.ts`

- [ ] Replace old `cornerRadius` examples with `corners.radii`.
- [ ] Replace old string color Sketch examples with `{ color }`.
- [ ] Update tests that intentionally inspect Sketch JSON leaves.

### Task 4: Verify

**Commands:**
- `bun test tests/sketch-extension-format.test.ts tests/format-sketch.test.ts tests/quality-harness.test.ts tests/cli-dt.test.ts tests/integration/theme-service.test.ts tests/inherit-color-sketch-format.test.ts`
- `pnpm typecheck`
- `pnpm exec biome check src/core/generator/formats/sketch.ts tests/sketch-extension-format.test.ts tests/format-sketch.test.ts tests/quality-harness.test.ts tests/cli-dt.test.ts tests/integration/theme-service.test.ts tests/inherit-color-sketch-format.test.ts manual/pages/design-token.md docs/SPEC.md`
- Run the orca fixture generation or equivalent command and inspect `*2sketch.json` for the plugin-facing contract.

### Self-Review

- Scope is limited to Sketch JSON output leaves and matching documentation/tests.
- `sketch.path` grouping remains data-driven and unchanged.
- `currentColor` / `inheritColor` filtering is not redesigned in this plan.
