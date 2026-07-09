# Wave DT Research Handoff

Date: 2026-07-09
Status: implementation planned

## Read First

Start from these files:

- `docs/superpowers/plans/2026-07-09-wave-dt-profile-model.md`
- `docs/research/wave-dt-profile-model.md`
- `docs/research/wave-token-helper-private.md`

The implementation worktree is:

```text
/Users/teatao/.worktree/cli_wave/refactor-dt
```

Do not treat older research notes as implemented behavior. The approved plan is the execution source for this iteration.

Implementation plan:

- `docs/superpowers/plans/2026-07-09-wave-dt-profile-model.md`

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

## Legacy Themefile Boundary

The approved plan keeps one compatibility guard for existing `themefile + main.yaml` projects:

- if `main.yaml` has `$config`, local `$config` is the source of truth;
- if `main.yaml` has no `$config`, the loaded legacy `themefile` config may still provide `THEME`, resources, parameters, and groups while token content comes from `main.yaml`.

This is transitional compatibility, not a renewed product direction. Current usage has largely moved away from legacy `themefile`; the historical debt should be intentionally retired after this wave.

Follow-up deprecation direction:

- keep compatibility only where it prevents existing tests or examples from breaking during the profile refactor;
- do not add new user-facing capability that depends on legacy `themefile`;
- after the profile model lands, add a separate deprecation/removal plan for legacy `themefile` entry behavior;
- prefer doctor or migration guidance for remaining users rather than expanding compatibility code.

## Execution Discipline

Use Subagent-Driven execution.

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

Follow-up direction:

- Consider making `wave dt doctor` default to `./main.yaml` when present, matching `wave dt build`.
- Consider surfacing dimension migration guidance when resource resolution fails because of legacy dimension resource paths such as `/resources/dimensions/wave.yaml`.
- Keep this as a follow-up behavior fix; no code change was made when recording this feedback.

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

Follow-up direction:

- Normalize nested border `$value.color` in the transformer, analogous to shadow/gradient nested color handling.
- Add regression coverage for both `color: "{theme.color.neutral.main}"` and `$ref: "#/theme/color/neutral/main/$value"` under a `$type: border` token with `$extensions.outline`.
- Verify both CSS and Sketch output after the fix.
- Keep this as a follow-up behavior fix; no code change was made when recording this feedback.

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

Follow-up:

- Either embed bundled YAML resources into the compiled runtime, or copy resources into `dist` and resolve relative to the executable/package location.
- Add cache-free dist smoke tests for `dt show palette tailwindcss`, `dt show dimension wave`, and a fixture `dt build`.

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

Follow-up:

- Make `wave dt doctor` inspect `./main.yaml` by default when present, matching `dt build`.
- Add diagnostics for `$config.resource.dimension` and `{wave.dimension.*}` references.
- If resource resolution fails, still surface migration guidance from parseable `main.yaml` content.
- Avoid unconditional `Resources: All built-in resources available` wording when a theme file is being checked.

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

Failures / gaps:

- `theme.shadow` with referenced `offsetY` / `blur` dimension values emits CSS `[object Object]` for those length fields, while Sketch keeps the unresolved `{ value, unit }` objects.
- Non-outline `$type: border` tokens under `theme.border.line.*` emit CSS `[object Object]`; only outline border tokens get special CSS formatting.
- `theme.border.line.ref-width` also emits `[object Object]` because nested border width is not normalized for CSS.
- `theme.radius.*` with `sketch.property.cornerRadius` is rejected by schema: `cornerRadius must be under a dimension or state root`. This conflicts with the public-root direction where `theme.radius` is the intended radius output root.

Follow-up:

- Normalize nested length fields for shadow CSS/Sketch, not only top-level dimension tokens.
- Decide whether non-outline border tokens should output CSS border values or remain unsupported; current `[object Object]` output should not ship silently.
- Update `sketch.property.cornerRadius` schema to allow `theme.radius` if radius is now the public root.

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

Follow-up:

- Normalize border `$value.color` through the same robust color normalization path used by color tokens and gradient/shadow nested colors.
- Add regression tests for direct hex, local token reference, external resource-backed token reference, `$ref` to token object, and `$ref` to `$value`.
- Verify CSS and Sketch output together because they currently fail differently.
