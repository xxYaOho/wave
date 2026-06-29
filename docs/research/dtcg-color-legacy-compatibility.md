# DTCG Color Legacy Compatibility

Date: 2026-06-29
Status: research note
Audience: Wave maintainers and implementation agents

## Background

Wave now supports DTCG Color Module style color objects in the design-token build pipeline. The preferred shape is:

```yaml
$value:
  colorSpace: oklch
  components: [0.518, 0.251, 262.6]
  alpha: 1
  hex: "#0052f5"
```

The implementation still keeps several historical color shapes working because existing token sources were created before the DTCG color contract was settled. These shapes should be treated as compatibility inputs, not as new public syntax.

## Current Compatibility Scope

The current transformer accepts these legacy shapes in color contexts:

- Hex strings such as `"#000000"` and `"#00000080"`.
- Legacy color objects such as `{ color: "#000000" }` and `{ color: "#000000", alpha: 0.5 }`.
- Referenced token wrappers such as `{ $value: { colorSpace, components, hex }, _swatchName }`.
- Historical color-space wrappers such as `{ oklch: { colorSpace, components, hex }, alpha?, _swatchName? }`.

The last two forms exist because some external resources are referenced without `/$value`, so the resolver may preserve a full token object. They also cover older custom resource files that grouped a color object under a color-space key.

## Responsibility Boundary

Compatibility belongs to the transformer layer.

- `src/core/transformer/color-value.ts` normalizes supported color shapes into final output strings.
- `src/core/transformer/theme-transformer.ts` decides when a token value is in a color context and should enter color normalization.
- Parser, resource loader, and resolver do not decide output color semantics.
- CSS, JSON, JSONC, Sketch, and doctor consumers should receive normalized values or fail fast when an unnormalized object leaks through.

This boundary is important. Moving compatibility into parser, resolver, or generators would make removal harder and could turn historical syntax into a permanent contract.

## Current Coupling Points

The compatibility code is concentrated but not fully single-sourced.

`color-value.ts` owns the actual normalization rules:

- DTCG object validation.
- Hex fallback handling.
- Legacy color object handling.
- Token `$value` wrapper unwrapping.
- Color-space wrapper unwrapping.

`theme-transformer.ts` owns the context gate:

- Scalar color tokens.
- `shadow.color`.
- `gradient.color`.

This means compatibility removal currently needs edits in both modules. The coupling is acceptable for now because it is limited to transformer-owned code, but it is still a cleanup target.

## Removal Strategy

Remove compatibility gradually. Do not delete all branches at once.

1. Add diagnostics first.
   Introduce warnings or debug traces for legacy shapes, especially token `$value` wrappers and color-space wrappers. Keep standard DTCG objects quiet.

2. Move the context predicate into `color-value.ts`.
   Replace duplicated shape checks in `theme-transformer.ts` with a single helper such as `canNormalizeColorValue(value)`. After that, transformer decides only whether the current position is a color context.

3. Measure fixture and real-source usage.
   Keep `tests/fixtures/themes/orca-realistic` and the real orca smoke as the main evidence sources. Update fixtures only when the corresponding real source has moved.

4. Remove one legacy shape at a time.
   Prefer this order:
   - Historical color-space wrapper.
   - Token `$value` wrapper without `/$value` reference.
   - Legacy `{ color, alpha }` object.
   - Hex string only if a future major contract replaces it.

5. Turn removals into explicit failures.
   When a legacy shape is removed, add a failure test with a clear error message. Silent `[object Object]` output must never return.

6. Update docs after behavior changes.
   Keep user-facing docs focused on the preferred DTCG shape and supported legacy syntax. Keep implementation-only removal notes in `docs/research` or maintainer docs, not in `manual/`.

## Verification To Keep

Run these checks when changing color compatibility:

```bash
bun test tests/color-value.test.ts tests/theme-transformer.test.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/integration/theme-service.test.ts
pnpm typecheck
bun test
```

If `/Users/teatao/Projects/my-color/orca/main.yaml` exists, also run:

```bash
pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --platform css --out .tmp/orca-css-preview --no-night --no-variants
rg -n -- "--primary-main: #0052f5;" /Users/teatao/Projects/my-color/orca/.tmp/orca-css-preview/orca.css
rg -n -- "\\[object Object\\]" /Users/teatao/Projects/my-color/orca/.tmp/orca-css-preview/orca.css

pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --platform sketch --out .tmp/orca-sketch-preview --no-night --no-variants
rg -n -- "#0052f5ff" /Users/teatao/Projects/my-color/orca/.tmp/orca-sketch-preview
rg -n -- "\\[object Object\\]" /Users/teatao/Projects/my-color/orca/.tmp/orca-sketch-preview
```

The `[object Object]` searches should return no matches. A non-zero `rg` exit code is expected for those negative checks.
