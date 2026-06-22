# Group Sketch Path Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent review before implementation, then implement task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `$extensions.sketch.path` declared on a token group to apply to descendant tokens, while token-level `sketch.path` keeps priority.

**Architecture:** Keep formatters simple: Sketch format continues to consume normalized `WaveToken._sketch`. Add inheritance in `transformToWaveTokens()` traversal, parallel to `$type` inheritance, but only for `sketch.path`. Do not inherit `sketch.property`, `smoothShadow`, `smoothGradient`, `inheritColor`, or `composite`.

**Tech Stack:** TypeScript, Bun test, existing Wave DTCG transformer/schema/generator pipeline.

---

## Scope

In scope:

- Group-level `$extensions.sketch.path` inheritance.
- Nearest group path wins over ancestor path.
- Token-level `$extensions.sketch.path` wins over inherited group path.
- Token-level `sketch.property` still works with inherited group path.
- Schema allows group-level `sketch.path`.
- Schema rejects group-level `sketch.property`; only tokens may declare `sketch.property`.
- Composite group children inherit group-level `sketch.path` like other descendant tokens.
- Tests and manual docs reflect the new behavior.

Out of scope:

- Inheriting every `$extensions` field.
- Inheriting `sketch.property`.
- Changing JSON/CSS output keys.
- Reintroducing legacy `sketchMap`.

## Files

- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/core/schema/theme.ts`
- Modify: `tests/sketch-extension-transformer.test.ts`
- Modify: `tests/sketch-extension-schema.test.ts`
- Modify: `tests/sketch-extension-format.test.ts`
- Modify: `tests/fixtures/themes/orca-realistic/main.yaml`
- Modify: `tests/quality-harness.test.ts`
- Modify: `manual/pages/design-token.md`
- Modify: `docs/SPEC.md`

## Tasks

### Task 1: Transformer TDD

- [ ] Add failing tests in `tests/sketch-extension-transformer.test.ts`:
  - group-level `sketch.path` applies to child token.
  - nested group-level `sketch.path` overrides ancestor group path.
  - token-level `sketch.path` overrides inherited group path.
  - group-level `sketch.property.opacity` is not inherited.
  - token-level `sketch.property.opacity` combines with inherited `sketch.path`.
  - composite group direct children inherit group-level `sketch.path`.
- [ ] Run:
  - `bun test tests/sketch-extension-transformer.test.ts`
  - Expected before implementation: inheritance tests fail.
- [ ] Implement inheritance in `src/core/transformer/theme-transformer.ts`:
  - Add an inherited Sketch extension state to `walk()`.
  - Carry only `sketch.path` from groups.
  - Merge inherited state into token `_sketch` only when token lacks `sketch.path`.
  - Preserve token-level `sketch.property`.
  - Pass inherited `sketch.path` through the composite group branch before calling `transformToken()` for each direct child.
- [ ] Re-run:
  - `bun test tests/sketch-extension-transformer.test.ts`

### Task 2: Schema TDD

- [ ] Add schema tests in `tests/sketch-extension-schema.test.ts`:
  - group-level `$extensions.sketch.path` is valid.
  - group-level `$extensions.sketch.property.opacity` is rejected with an error at `theme.color.$extensions.sketch.property`.
  - invalid group-level `sketch.path` reports the same path validation error as token-level `sketch.path`.
- [ ] Run:
  - `bun test tests/sketch-extension-schema.test.ts`
  - Expected before implementation: invalid group path and group property tests fail because group `$extensions.sketch` is currently ignored.
- [ ] Update `src/core/schema/theme.ts`:
  - Update `validateSketchExtension()` to take a context: `group` or `token`.
  - In token context, keep the current rules: `path` and `property` are allowed, and `property` is type/path checked.
  - In group context, allow only `sketch.path`.
  - In group context, reject `sketch.property` with a clear message such as `sketch.property is only supported on token extensions`.
  - Call group-context sketch validation from the group node branch in `walkNode()` after `validateExtends()` and before recursing into children.
- [ ] Re-run:
  - `bun test tests/sketch-extension-schema.test.ts`

### Task 3: Pipeline and Fixture Coverage

- [ ] Update `tests/fixtures/themes/orca-realistic/main.yaml`:
  - Move repeated color Sketch path to a group-level `$extensions.sketch.path`.
  - Keep at least one token-level `sketch.property` under inherited path.
- [ ] Add or update assertions:
  - Add a pipeline-style test that calls `transformToWaveTokens()` and then `sketchFormat()` to confirm inherited path reaches formatter output.
  - `tests/quality-harness.test.ts` confirms `orca-realistic` still emits Sketch files with inherited path output.
- [ ] Run:
  - `bun test tests/sketch-extension-format.test.ts tests/quality-harness.test.ts`

### Task 4: Documentation

- [ ] Update `manual/pages/design-token.md`:
  - Change `$extensions` support table so `sketch.path` is `group or token`.
  - Add one concise example showing group-level `sketch.path`.
  - State priority: token path > nearest group path > ancestor group path.
  - State non-goal: `sketch.property` does not inherit.
- [ ] Update `docs/SPEC.md`:
  - Record the same behavior as the implementation truth: group or token `sketch.path`, nearest declaration priority, token override priority, and no `sketch.property` inheritance.
- [ ] Do not update README unless CLI commands changed.

### Task 5: Verification

- [ ] Run targeted tests:
  - `bun test tests/sketch-extension-transformer.test.ts tests/sketch-extension-schema.test.ts tests/sketch-extension-format.test.ts tests/quality-harness.test.ts`
- [ ] Run integration smoke:
  - `bun test tests/cli-dt.test.ts tests/integration/theme-service.test.ts`
- [ ] Run static checks:
  - `pnpm typecheck`
  - `pnpm exec biome check src/core/transformer/theme-transformer.ts src/core/schema/theme.ts tests/sketch-extension-transformer.test.ts tests/sketch-extension-schema.test.ts tests/sketch-extension-format.test.ts tests/quality-harness.test.ts manual/pages/design-token.md`
- [ ] Run harness smoke:
  - `pnpm bench:smoke`

## Review Gate

Before implementation, a subagent must review this plan and return `APPROVE`. If it returns `REQUEST_CHANGES`, update this plan and repeat review until approved.
