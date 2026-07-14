# Typography REM Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `yes-subagents` for milestone review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow typography tokens to use `rem`, with one `theme.font`-level `baseFontSize` driving CSS root sizing and exact, non-integer Sketch conversion.

**Architecture:** `baseFontSize` is an optional positive, unitless px override at `theme.font.$extensions.typography`; omitted rem typography uses 16. It is not a typography default or emitted token. The transformer attaches the effective base as internal metadata to rem typography tokens, CSS emits it as `:root` font-size, and Sketch converts rem lengths with it. JSON and JSONC retain resolved values only and never expose the metadata.

**Tech Stack:** TypeScript strict ESM, Bun tests, pnpm, DTCG-style YAML, Sketch JSON output.

**Approved Contract:**

- `theme.font.$extensions.typography.baseFontSize` is the only accepted baseline location. It is a finite number greater than zero, interpreted as CSS px. Raw `{token.reference}` strings and `$ref` objects are allowed only until resolution; the resolved value must be that number, never a string or dimension object.
- `baseFontSize` is allowed only on `theme.font`, whose effective type must be `typography`. Child groups cannot override it, because an output has one CSS `:root` font-size.
- `rem` is accepted for `fontSize`, absolute `lineHeight`, and `letterSpacing`; its effective base defaults to 16 and can be overridden with `baseFontSize`. Existing px, pt, and unitless behavior remains valid without it.
- CSS emits `font-size: <effectiveBase>px;` in `:root` only when a selected typography token uses rem. Typography values remain rem in CSS; explicit base alone does not alter a px/pt-only output.
- Sketch maps rem fontSize and letterSpacing to `remValue * baseFontSize`, normalized to at most three decimal places only to remove floating-point artifacts. It does not round those values to integers or force even numbers. Sketch final lineHeight always uses `Math.ceil`: unitless values multiply the converted font size, while absolute px/pt/rem values use their numeric or converted value before ceiling.
- Named profiles may choose their own base. Night overlays remain unable to change it and inherit the day profile value.

---

### Milestone 1: Schema And Transformer Contract

**Files:**
- Modify: `src/types/index.ts:225-234,336-374`
- Modify: `src/core/typography-value.ts:14-88,110-148`
- Modify: `src/core/schema/theme.ts:352-476,667-750`
- Modify: `src/core/transformer/theme-transformer.ts:24-28,475-510,730-830`
- Test: `tests/theme-schema.test.ts`
- Test: `tests/transform-to-wave-tokens.test.ts`

- [ ] **Step 1: Add failing schema cases for the extension and units.**

  Add tests that accept rem typography with and without `baseFontSize`, reject `baseFontSize` at `theme.font.body`, reject zero/negative/string/unit-object bases, and retain the existing invalid-unit assertion for unsupported units. Add both a token-local rem case and a `defaults.fontSize: 0.875rem` case whose leaf has an empty `$value`; without an override each uses 16, and with a root base each uses that override. Add raw-schema cases proving both `{theme.number.base}` and `{ $ref: '#/theme/number/base/$value' }` are accepted at `theme.font.$extensions.typography.baseFontSize`; add resolved cases proving those references must become a positive finite number at that same path.

  ```ts
  const result = validateThemeSchema(
    {
      theme: {
        font: {
          $type: 'typography',
          $extensions: {
            typography: {
              baseFontSize: 14,
              defaults: { fontFamily: 'Inter', fontWeight: 400, letterSpacing: 0 },
            },
          },
          body: {
            $value: { fontSize: { value: 0.875, unit: 'rem' }, lineHeight: 1.5 },
          },
        },
      },
    },
    'resolved',
  );
  expect(result.valid).toBe(true);
  ```

- [ ] **Step 2: Run the focused schema test and confirm the new acceptance case fails.**

  Run: `bun test tests/theme-schema.test.ts`

  Expected: the new rem/base test fails because `rem` and `baseFontSize` are unknown.

- [ ] **Step 3: Define the internal baseline metadata and parsing helpers.**

  Add `_typographyBaseFontSize?: number` to `WaveToken`. Expand `ParsedTypographyDimension.unit` and its string/object parser to include `rem`; keep `parseTypographyLineHeight()` unitless multiplier semantics. Add a helper that reads a resolved `typography.baseFontSize` only as a finite positive number, and a helper that detects a parsed rem field.

  ```ts
  export interface ParsedTypographyDimension {
    value: number;
    unit?: 'px' | 'pt' | 'rem';
  }

  export function parseTypographyBaseFontSize(
    extensions: Record<string, unknown> | undefined,
  ): number | undefined;
  ```

- [ ] **Step 4: Validate the single source and its rem dependency.**

  Extend `validateTypographyGroupExtension()` to permit `baseFontSize` in addition to required `defaults`; accept it only when `groupPath === 'theme.font'`. In raw validation, defer only the existing brace-reference and `$ref` shapes; in resolved validation, require a finite positive number and report invalid values at `theme.font.$extensions.typography.baseFontSize`. Carry the optional resolved override through `walkNode()`; rem fields without it use the fixed default 16.

  ```ts
  const effectiveBaseFontSize = typographyBaseFontSize ?? 16;
  ```

- [ ] **Step 5: Preserve the baseline through every transformer invocation.**

  Extend `InheritedExtensions` with optional `typographyBaseFontSize`; read an override only from the `theme.font` group, propagate it to descendant typography tokens, and set `_typographyBaseFontSize` only on emitted typography tokens whose materialized value contains rem, using `16` when no override is declared. Do not add it to materialized typography values, JSON, or JSONC.

  ```ts
  if (typeValue === 'typography' && hasTypographyRemDimension(materialized)) {
    derived._typographyBaseFontSize = inheritedExtensions.typographyBaseFontSize ?? 16;
  }
  ```

- [ ] **Step 6: Add transformer regression assertions and rerun focused tests.**

  Assert that a raw extension reference resolves to numeric `14` before transformation, child typography tokens inherit `14`, non-typography tokens do not receive the field, and a re-run through `transformToWaveTokens()` retains the same metadata. Run:

  ```bash
  bun test tests/theme-schema.test.ts tests/transform-to-wave-tokens.test.ts
  ```

  Expected: PASS; existing px/pt and incomplete-default tests remain unchanged.

- [ ] **Step 7: Commit Milestone 1.**

  ```bash
  git add src/types/index.ts src/core/typography-value.ts src/core/schema/theme.ts src/core/transformer/theme-transformer.ts tests/theme-schema.test.ts tests/transform-to-wave-tokens.test.ts
  git commit -m "feat(dt): add typography rem baseline contract"
  ```

**Milestone gate:** `critic-gate` verifies that only `theme.font` can define an override, no baseline leaks into flat output, rem uses 16 by default, and px/pt-only output does not gain root font-size.

### Milestone 2: CSS And Sketch Output

**Files:**
- Modify: `src/core/generator/formats/css.ts:161-225,345-431`
- Modify: `src/core/generator/formats/sketch.ts:270-325`
- Test: `tests/format-css.test.ts`
- Test: `tests/format-sketch.test.ts`
- Test: `tests/token-generator.test.ts`

- [ ] **Step 1: Add failing formatter tests for baseline output and decimal conversion.**

  Add a CSS test using a typography token with `_typographyBaseFontSize: 14`, expecting `font-size: 14px;` before variables and `--font-body-size: 0.875rem;`. Add a CSS test with two selected typography tokens carrying `14` and `16`, expecting a deterministic error, plus a color-only selection that does not emit root `font-size`. Add Sketch tests for `.875rem` font size -> `12.25`, `1.25rem` absolute line height -> `18`, `.1rem` letter spacing -> `1.4`, and rem font size with multiplier line height -> ceiling `19`.

  ```ts
  expect(parsed['theme-font-body'].textStyle).toMatchObject({
    fontSize: 12.25,
    lineHeight: 18.375,
    kerning: 1.4,
  });
  ```

- [ ] **Step 2: Run focused formatter tests and confirm failures.**

  Run: `bun test tests/format-css.test.ts tests/format-sketch.test.ts`

  Expected: CSS lacks root `font-size`; Sketch currently emits `.875`, `1.5`, and `.1` rather than converted values.

- [ ] **Step 3: Emit one CSS root font size without changing token values.**

  Inspect selected typography tokens for one shared `_typographyBaseFontSize`. When present, insert `font-size: <value>px;` immediately after `:root {`; if formatter input is internally inconsistent, throw a deterministic error rather than selecting one. Keep `formatTypographyDimension()` unit-preserving, so rem continues to output as rem.

  ```ts
  const baseFontSize = findTypographyBaseFontSize(sortedTokens);
  const lines: string[] = [':root {'];
  if (baseFontSize !== undefined) lines.push(`  font-size: ${baseFontSize}px;`);
  ```

- [ ] **Step 4: Convert Sketch rem lengths while keeping lineHeight integral.**

  Add a local helper that accepts a parsed typography dimension and optional token baseline. It returns the raw value for px/pt/unitless dimensions and `roundTo(value * base, 3)` only for rem. Use it for `fontSize`, absolute `lineHeight`, and `letterSpacing`. Apply `Math.ceil` to every final Sketch lineHeight: unitless values use the converted font size, and absolute px/pt/rem values ceiling after taking their numeric or converted value.

  ```ts
  const sketchFontSize = toSketchTypographyLength(fontSize, token);
  textStyle.fontSize = sketchFontSize;
  textStyle.lineHeight = Math.ceil(
    lineHeight.unit
      ? toSketchTypographyLength(lineHeight, token)
      : sketchFontSize * lineHeight.value,
  );
  ```

- [ ] **Step 5: Exercise regeneration and default-base behavior.**

  Add `generateTokens()` coverage with an OKLCH source and `css,sketch` platforms, proving the sketch color-space retransform keeps `_typographyBaseFontSize`. Add default-base coverage proving rem receives metadata `16`, plus a defensive direct formatter test that malformed rem token input without metadata throws a token-path error. Run:

  ```bash
  bun test tests/format-css.test.ts tests/format-sketch.test.ts tests/token-generator.test.ts
  ```

  Expected: PASS; existing px/pt font and multiplier line-height snapshots do not change.

- [ ] **Step 6: Commit Milestone 2.**

  ```bash
  git add src/core/generator/formats/css.ts src/core/generator/formats/sketch.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/token-generator.test.ts
  git commit -m "feat(dt): emit rem typography with shared baseline"
  ```

**Milestone gate:** `critic-gate` verifies CSS and Sketch consume the same source value, no integer/even snapping was introduced, and px/pt snapshots are intact.

### Milestone 3: End-To-End Coverage And Documentation

**Files:**
- Modify: `tests/integration/theme-service.test.ts`
- Modify: `manual/pages/design-token.md`
- Modify: `docs/SPEC.md:1071-1102`

- [ ] **Step 1: Add an isolated end-to-end theme fixture in the integration test.**

  Write a temporary `main.yaml` with `theme.font.$extensions.typography.baseFontSize: 14`, a `.875rem` body size, a rem absolute line height, a `.1rem` letter spacing, and `css,sketch,json,jsonc` output. Assert CSS includes root `14px` and all rem fields, Sketch contains decimal converted values including kerning `1.4`, and flat JSON contains the rem values but no `baseFontSize` metadata.

  ```yaml
  theme:
    font:
      $type: typography
      $extensions:
        typography:
          baseFontSize: 14
          defaults: { fontFamily: Inter, fontWeight: 400, letterSpacing: 0 }
      body:
        $value:
          fontSize: { value: 0.875, unit: rem }
          lineHeight: { value: 1.5, unit: rem }
          letterSpacing: { value: 0.1, unit: rem }
  ```

- [ ] **Step 2: Add profile and night regression coverage.**

  Use the profile integration harness to build a named profile with a different root `baseFontSize`; define a complete standalone `theme.font` hierarchy in that profile rather than assuming it overlays main token content, then assert its CSS/Sketch use that profile value. Add a night build assertion that the night artifact retains the day/profile baseline because night overlays cannot write `theme.font`.

- [ ] **Step 3: Run the integration test before documentation changes.**

  Run: `bun test tests/integration/theme-service.test.ts`

  Expected: PASS for main, named profile, and night artifacts; rem-without-override artifacts use root `16px` and Sketch conversion by 16.

- [ ] **Step 4: Update user-facing and maintainer contracts.**

  In `manual/pages/design-token.md`, document the authoring snippet, that the base is CSS px, and that rem is preserved in CSS but multiplied for Sketch. Document that Sketch fontSize/kerning retain decimal precision while every final lineHeight is ceiled to an integer. In `docs/SPEC.md`, replace the `px|pt` typography-only statement; record the restricted root location, rem field coverage, line-height branches, named-profile behavior, and unchanged px/pt font-size behavior.

  ```yaml
  $extensions:
    typography:
      baseFontSize: 14
      defaults:
        fontFamily: "{wave.dimension.fontFamily}"
  ```

- [ ] **Step 5: Run full project gates and inspect output.**

  Run:

  ```bash
  pnpm typecheck
  bun test
  git diff --check
  ```

  Expected: all commands pass. Additionally build a temporary copy of the Orca theme rather than modifying `/Users/teatao/Projects/my-color/orca/main.yaml`: insert `baseFontSize: 14` under `theme.font.$extensions.typography`, retain the existing `theme.font.size.baseline` only as an unrelated legacy token, then inspect CSS for `font-size: 14px`, Sketch decimal font sizes, and integral line heights. The source Orca document remains unchanged.

- [ ] **Step 6: Commit Milestone 3.**

  ```bash
  git add tests/integration/theme-service.test.ts manual/pages/design-token.md docs/SPEC.md
  git commit -m "docs(dt): document typography rem baseline"
  ```

**Milestone gate:** `critic-gate` verifies the documented public contract matches emitted CSS/Sketch artifacts, profile isolation holds, and no real user theme was edited.

---

## Final Acceptance Criteria

- A valid `theme.font` baseline of `14` yields CSS `:root { font-size: 14px; }` and Sketch `.875rem -> 12.25`.
- rem fontSize and letterSpacing never receive integer rounding or even-number snapping; Sketch final lineHeight always uses `Math.ceil`.
- px/pt typography font-size output remains unchanged; absolute px/pt Sketch lineHeight follows the same integer lineHeight contract.
- An invalid base or nested override fails with an actionable schema error; rem typography without an override uses 16px.
- JSON/JSONC do not expose `baseFontSize`; CSS and Sketch use the same resolved source value, including profile builds.
