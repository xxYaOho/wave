# Wave DT Research Handoff

Date: 2026-07-09
Status: released in Wave 0.16.0

## Read First

Start from these files:

- `docs/superpowers/plans/2026-07-09-wave-dt-profile-model.md`
- `docs/research/wave-dt-profile-model.md`
- `docs/research/wave-token-helper-private.md`

The implementation worktree used for this iteration has been merged and removed.
Use `main` and the 0.16.0 release tag as the current source of truth.

Implementation plans:

- `docs/superpowers/plans/2026-07-09-wave-dt-profile-model.md`
- `docs/superpowers/plans/2026-07-09-wave-dt-manual-test-fixes.md`

Release closeout:

- Version: `0.16.0`
- Tag: `v0.16.0`
- Merge commit: `75c59959ba8bb18652a4e78287fbb20e972d813f`

## Current Decision Summary

- Keep `main.yaml`; do not rename it to `default.yaml`.
- Remove new user-facing `variant` behavior: no `--variant`, no `--variants`, no `variants/` auto-discovery, and no old variant output path compatibility.
- Add explicit profile selection:
  - default build: `main.yaml` only;
  - `--profile <name>`: one named profile;
  - `--profiles all`: `main.yaml` plus named profiles.
- Profiles live at `profiles/<name>.yaml`; nested profile directories are invalid.
- Night Mode files are `main@night.yaml` and `profiles/<name>@night.yaml`; they are overlays, not profiles.
- Missing or invalid Night Mode never fails the day build, including explicit `--night`; emit `Night Mode unavailable/invalid and skipped` and skip night output.
- `theme.dimension` stops emitting in CSS and Sketch. Build emits one migration warning; doctor owns detailed migration guidance.
- CSS emits public roots `color`, `state`, `shadow`, `gradient`, `border`, `radius`, and `font`.
- CSS length-like output adds browser-required units.
- CSS typography emits field variables and one shorthand variable.
- CSS outline emits outline value plus offset companion; no split color/width/style fields.
- Sketch outline uses two shadow layers in final Sketch JSON order: ring first, gap second. Gap color is fixed to `#ffffff`.
- Sketch typography outputs text shared style payload only. Wave does not control whether color or alignment follows shared style.
- Sketch text shared style output does not control whether color or alignment follows shared style.
- `$helper` remains documentation-only in this iteration.

## Planned Follow-up: Reference-Gated Resource Loading

Decision recorded: 2026-07-28. This behavior is approved but not implemented.

- `$config.resource` becomes optional for `main.yaml` and named profiles.
- Build validates the effective token graph. Invalid, missing, or duplicate
  resource declarations do not fail build unless a token reference depends on
  them.
- Every supported curly-brace and `$ref` value must resolve uniquely wherever the
  existing resolver walks the effective token document. `$extends` remains
  document-internal and does not target resource groups. Missing or ambiguous
  referenced namespaces fail build with the reference location.
- Build attempts declared resources and suppresses declaration-only failures. It
  does not use a static lazy-load pass because custom namespaces are known only
  after reading their files.
- Doctor remains strict for declarations in the inspected default or explicitly
  selected profile. A later Doctor iteration adds an all-profile workspace scan,
  malformed `$config.resource` shape diagnostics, unused-declaration findings,
  and more complete resource health reporting.
- The legacy no-`main.yaml` fallback still requires the resource inputs from
  which it generates output.
- The legacy `themefile` path is scheduled for removal in a separate breaking
  iteration. Do not extend or add compatibility behavior to it in this resource
  loading iteration.

Canonical design details are in
`docs/research/wave-dt-profile-model.md` under `Config Inheritance`.

## Legacy Themefile Boundary

The approved plan keeps one compatibility guard for existing `themefile + main.yaml` projects:

- if `main.yaml` has `$config`, local `$config` is the source of truth;
- if `main.yaml` has no `$config`, the loaded legacy `themefile` config may still provide `THEME`, resources, parameters, and groups while token content comes from `main.yaml`.

This is transitional compatibility, not a renewed product direction. Current usage has largely moved away from legacy `themefile`; the historical debt should be intentionally retired after this wave.

Approved follow-up removal direction:

- Remove `themefile` support in a separate breaking iteration; do not leave it as
  a permanent compatibility path.
- Scope that iteration across every public command and internal parser still
  using `themefile`, including `wave create`, `wave dt build`, Doctor, init
  templates, fixtures, manual pages, and the no-`main.yaml` resource-direct
  fallback.
- Define the migration and error contract before implementation. `main.yaml`
  remains the only design-token project entry after the cutover.
- Until that iteration starts, preserve existing behavior only to avoid mixing
  two breaking changes. Do not add new user-facing capability that depends on
  `themefile`.

## Execution Discipline

Historical execution discipline for this iteration:

- Work in `/Users/teatao/.worktree/cli_wave/refactor-dt`.
- Execute the approved plan task by task.
- After each implementation node, run `critic-gate` read-only review.
- Iterate each node until `critic-gate` returns approval.
- Keep commits atomic and aligned to plan tasks.

## Manual Test Feedback

Recorded at: 2026-07-09T19:23:03+0800

User tested the worktree binary from `/Users/teatao/Projects/my-color/orca`:

```bash
export wavetest="/Users/teatao/.worktree/cli_wave/refactor-dt/dist/wave"
$wavetest dt build
$wavetest doctor
$wavetest dt --doctor
$wavetest dt doctor
```

Observed behavior:

- `$wavetest dt build` failed at `resource resolve` with `Resource not found: /resources/dimensions/wave.yaml`.
- The project `main.yaml` still references legacy dimension resource/config, including `$config.resource.dimension` and many `{wave.dimension.*}` references.
- `$wavetest doctor` and `$wavetest dt doctor` reported `No themefile specified`, checked only built-in resources, and ended with `All checks passed`.
- `$wavetest dt --doctor` is invalid because `--doctor` is not a `dt` option.

Problem:

- The current doctor default does not inspect `./main.yaml`, while `dt build` does. This means the user can hit a dimension/resource migration failure in build but receive no migration guidance from doctor.
- The migration guidance exists when doctor is pointed at a file, but the default command shape is not helpful for the current project workflow.

Implemented in this iteration:

- Packaged `dist/wave` copies built-in resources into `dist/resources` and resolves built-ins from the packaged runtime when needed.
- `wave dt doctor` inspects `./main.yaml` by default when present, matching the current `dt build` workflow.
- Dimension migration guidance can still be surfaced when resource resolution fails and `main.yaml` is parseable.

## Manual Test Feedback: Outline Border Color

Recorded at: 2026-07-09T21:46:00+0800

User tested this token shape in `/Users/teatao/Projects/my-color/orca/main.yaml`:

```yaml
theme:
  border:
    outline:
      $type: border
      $value:
        color:
          $ref: "#/theme/color/neutral/main/$value"
        width: 1
        style: solid
      $extensions:
        outline:
          offset: 2
```

The same problem was observed when `color` used DTCG curly reference syntax:

```yaml
color: "{theme.color.neutral.main}"
```

Observed CSS output:

```css
--outline: 1px solid currentColor;
--outline-offset: 2px;
```

Expected behavior:

- The border color should resolve to the referenced color value, for example the resolved value of `theme.color.neutral.main`.
- Changing curly reference syntax to `$ref` should not be required for this case, and does not fix the current behavior.

Root cause hypothesis from code inspection:

- `src/core/transformer/theme-transformer.ts` normalizes scalar color tokens when `typeValue === "color"`.
- Nested `color` fields are normalized only by `processArrayItem`, and only when the parent type is `shadow` or `gradient`.
- Border token `$value` is a composite object, but `typeValue === "border"` does not trigger nested `color` normalization.
- `src/core/generator/formats/css.ts` formats border color as `currentColor` whenever `obj.color` is not a string or number.
- Therefore a resolved DTCG color object/reference can remain inside border `$value.color`, and CSS falls back to `currentColor`.

Evidence:

- Source build command used for reproduction:

  ```bash
  rm -rf /tmp/wave-outline-debug
  bun run /Users/teatao/.worktree/cli_wave/refactor-dt/src/index.ts dt build \
    -f /Users/teatao/Projects/my-color/orca/main.yaml \
    -o /tmp/wave-outline-debug \
    --platform css
  rg -n "border-outline|outline" /tmp/wave-outline-debug/orca.css
  ```

- The output contains `--outline: 1px solid currentColor;`.
- The same CSS file contains already-resolved outline color tokens such as `--outline-ring: #1a72f0;`, so the color resource itself is available.

Implemented in this iteration:

- Nested border `$value.color` is normalized in the transformer, alongside shadow and gradient nested colors.
- Regression coverage includes direct hex, local token reference, external resource reference, JSON pointer to token object, JSON pointer to `$value`, and aliased `$value`.
- CSS and Sketch output are verified together in the root matrix integration test.

## Manual Test Audit: Theme Root Matrix

Recorded at: 2026-07-09T21:50:58+0800

Scope:

- User asked to test every top-level key under `theme`.
- Local matrix covered `theme.color`, `theme.state`, `theme.shadow`, `theme.gradient`, `theme.border`, `theme.radius`, `theme.font`, and `theme.dimension`.
- Two read-only debugger agents also audited packaged resource loading and doctor/build behavior.
- No implementation changes were made.

### Packaged binary resource loading

Confirmed by read-only debugger:

- Source entry can load built-in resources.
- Packaged `dist/wave` cannot load uncached built-in YAML resources because runtime lookup still uses `import.meta.dir`.
- Under Bun `--compile`, this resolves built-in resource paths to `/resources/...`.
- Cache can mask palette/Leonardo resources, but `dimension wave` is not cached and fails.

Evidence:

- `bun run src/index.ts dt show dimension wave` succeeds.
- `./dist/wave dt show dimension wave` fails.
- `HOME=/var/empty ./dist/wave dt show palette tailwindcss` fails.
- `dist/wave dt build` can fail with `Resource not found: /resources/dimensions/wave.yaml`.

Fix locus:

- `src/core/resolver/builtin.ts`
- `src/core/resolver/index.ts`
- `src/core/resolver/resource-loader.ts`
- `scripts/build-cli.ts`

Implemented in this iteration:

- Built-in resources are copied into `dist/resources` during `pnpm build`.
- Runtime built-in lookup checks packaged resources when source resources are unavailable.
- Cache-free dist smoke tests cover `dt show palette tailwindcss`, `dt show dimension wave`, and fixture `dt build`.

### Doctor/build guidance mismatch

Confirmed by read-only debugger:

- `dt build` defaults to `./main.yaml`.
- `dt doctor` does not default to `./main.yaml`; without `-f`, it reports `No themefile specified`.
- `dt doctor -f ./main.yaml` still does not warn for legacy dimension dependency when the project has no public `theme.dimension` root.
- Current dimension migration detector only checks public `theme.dimension`, not `$config.resource.dimension` or `{wave.dimension.*}` references.
- Resource resolution errors can block migration guidance entirely.

Observed user problem:

- Build can fail or warn on dimension-related migration/resource issues, while doctor still prints `All checks passed`.

Fix locus:

- `src/cli/commands/doctor.ts`
- `src/core/doctor/dimension-migration.ts`
- CLI help text for `dt doctor -f`.

Implemented in this iteration:

- `wave dt doctor` inspects `./main.yaml` by default when present.
- Doctor guidance covers public `theme.dimension`; raw guidance also covers `$config.resource.dimension` and `{wave.dimension.*}` when resource resolution fails.
- Valid `wave.dimension` references used as source values remain supported when they do not create public `theme.dimension` output.

### Theme root output matrix

Temporary fixture:

```text
/tmp/wave-root-matrix/main.yaml
```

Command:

```bash
bun run /Users/teatao/.worktree/cli_wave/refactor-dt/src/index.ts dt build \
  -f /tmp/wave-root-matrix/main.yaml \
  -o /tmp/wave-root-matrix/out \
  --platform css,sketch
```

Results:

- `theme.color`: direct hex, external resource reference, and JSON pointer to local value output correctly in CSS and Sketch.
- `theme.state`: direct number and `{wave.dimension.alpha.*}` reference output correctly in CSS; Sketch opacity property works.
- `theme.gradient`: direct colors and referenced colors output correctly in CSS and Sketch.
- `theme.radius`: direct number, `{ value, unit }`, and dimension resource references output correctly in CSS and Sketch value output.
- `theme.font`: direct typography and referenced dimension fields output correctly; direct numeric `fontSize: 14` stays unitless in CSS.
- `theme.dimension`: build emits the expected migration warning and does not output public dimension CSS.

Previously observed failures / gaps, now covered by regression tests:

- `theme.shadow` referenced length fields are normalized before CSS and Sketch output.
- Non-outline `$type: border` tokens output CSS border shorthand instead of `[object Object]`.
- Nested border width value objects are normalized before formatting; unnormalized formatter inputs fail loudly.
- `theme.radius.*` can use `sketch.property.cornerRadius`; `theme.radius.*` still cannot use `sketch.property.opacity`.

Implemented in this iteration:

- Transformer normalizes nested color and length fields for shadow and border composites.
- CSS formats normal border tokens as shorthand and emits outline offset companion for outline tokens.
- Sketch outline keeps the two-layer shadow simulation with ring first and fixed white gap second.
- Schema allows `cornerRadius` under `theme.radius` while keeping `opacity` limited to `theme.state` / `theme.dimension`.

### Border outline reference matrix

Temporary fixture:

```text
/tmp/wave-border-ref-matrix/main.yaml
```

Observed CSS results:

```css
--border-outline-direct-hex: 1px solid #2563eb;
--border-outline-token-curly-base: 1px solid #2563eb;
--border-outline-token-curly-alias: 1px solid #2563eb;
--border-outline-token-curly-external: 1px solid currentColor;
--border-outline-pointer-token: 1px solid currentColor;
--border-outline-pointer-value: 1px solid #2563eb;
--border-outline-pointer-alias-value: 1px solid #2563eb;
```

Observed Sketch first-layer colors:

```text
direct-hex -> #2563ebff
token-curly-base -> #2563ebff
token-curly-alias -> #2563ebff
token-curly-external -> #000000ff
pointer-token -> #000000ff
pointer-value -> #2563ebff
pointer-alias-value -> #2563ebff
```

Interpretation:

- Direct hex and local color-token references can work.
- External resource-backed color references can remain as non-string color objects inside border `$value.color`, causing CSS `currentColor` and Sketch `#000000`.
- JSON pointer to a token object also fails; pointer to `$value` can work when that value is already scalar after resolution.
- This is implementation behavior, not user-facing syntax guidance; users should not need to know which reference shape happens to normalize.

Implemented in this iteration:

- Border `$value.color` now uses the transformer normalization path.
- Regression tests cover direct hex, local references, external references, `$ref` to token object, `$ref` to `$value`, and alias `$value`.
- CSS and Sketch are asserted in the same integration matrix.

## Manual Test Fix Status

Recorded at: 2026-07-09T23:37:23+0800

The manual-test regressions recorded above have been fixed and released in 0.16.0.

Verified:

- packaged `dist/wave` loads built-in palette and dimension resources without cache;
- `dt doctor` defaults to `./main.yaml` when present;
- doctor reports legacy dimension migration guidance when a public `theme.dimension` root or failed raw dimension migration signal is present;
- valid `wave.dimension` source references remain supported and do not fail doctor by themselves;
- CSS and Sketch no longer output `[object Object]` for shadow or border cases in the root matrix;
- border outline color references resolve consistently for CSS and Sketch;
- `theme.radius.*` can use `sketch.property.cornerRadius`;
- real `/Users/teatao/Projects/my-color/orca` packaged-binary smoke builds CSS and Sketch output without `[object Object]`, `1px solid currentColor`, or Sketch outline black fallback.
