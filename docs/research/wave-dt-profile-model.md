# Wave DT Profile Model Notes

Date: 2026-07-08
Status: iteration draft
Audience: Wave maintainers and implementation agents

## Purpose

This note records the current product-design consensus for a future Wave design-token model. It is not an implementation plan and does not describe current released behavior.

The discussion used these references:

- SCALES Design Tokens Starter Set as a reference for separating source layers from a consumption layer.
- The real orca token files under `/Users/teatao/Projects/my-color/orca`.
- The current Wave `main.yaml`, `main@night.yaml`, and `variants/` behavior.
- Current Wave pipeline, schema, transformer, CSS formatter, and Sketch formatter code.

## Product Position

`wave dt` is a design-token authoring and export tool for maintaining a public design token API and exporting it to multiple platforms.

Wave should prefer its own authoring model. DTCG token shape remains the data foundation. Token Studio, Style Dictionary, Sketch, CSS, and JSON are inputs or outputs, not the source of Wave's taxonomy.

SCALES is useful as a product reference, not as a structure to copy. Its raw token file separates `brand/*`, `mode/*`, and `alias/*`, and uses `$themes.selectedTokenSets` to compose sets for Token Studio or Figma. Wave should keep the same discipline that consumption happens through a public alias layer, but should not adopt Token Studio token-set composition as Wave's user model.

## Layer Model

Wave should keep `theme` as the public API layer.

The intended boundary is:

- `$config.resource`: source declarations used for reference resolution.
- `theme`: public consumption API.
- `profile`: another public API entry inside the same project.
- `night`: a color-mode overlay for one profile.
- component tokens: future scope.

This borrows the SCALES discipline that products consume only the public alias layer. In Wave, `theme` plays that role.

## Project And Profile

A project represents one physical design system or brand workspace. Separate brands such as `brand-a` and `brand-b` are separate projects, not profiles of one project.

Within one project, a profile represents one concrete consumption target. Examples:

- `main.yaml`: default profile, such as web.
- `profiles/mobile.yaml`: mobile profile.

Profiles may have different public APIs. A mobile profile can add mobile-only tokens that do not exist in the default profile.

`main.yaml` is the default profile and also provides the project baseline.

Extra responsibilities of `main.yaml`:

- `$config.theme` defines the project name.
- `$config.resource` defines project-level source resources inherited by profiles.
- `$config.parameter` and `$config.parameterGroup` define default build parameters inherited by profiles.

## Profile Files

Profiles should be independent files.

Recommended file layout:

```text
main.yaml
main@night.yaml
profiles/mobile.yaml
profiles/mobile@night.yaml
```

Rules:

- `main.yaml` is the default profile.
- `profiles/<name>.yaml` is a named profile.
- Nested profile directories are not supported.
- Profile name is inferred from the filename.
- Profile name normalization: trim, replace ASCII spaces with `_`, and lowercase.
- Profile filename stems may use ASCII letters, numbers, `_`, `-`, or spaces before normalization. Other characters, including dots inside the stem, should be treated as invalid by schema or doctor instead of being silently rewritten.
- Normalized profile name collisions are errors.

Examples:

```text
profiles/Mobile Web.yaml -> mobile_web
profiles/mobile-web.yaml -> mobile-web
profiles/mobile_web.yaml -> mobile_web
profiles/mobile.web.yaml -> invalid
```

`$config.profile`, if introduced later, must not control output naming. It may only serve display or documentation needs.

## Build Selection

Build selection is explicit.

Recommended CLI direction:

```bash
wave dt build
wave dt build --profile mobile
wave dt build --profiles all
wave dt build --night
wave dt build --profile mobile --night
wave dt build --profiles all --night
```

Rules:

- `wave dt build` builds only the default profile.
- `--profile <name>` builds only that named profile.
- `--profiles all` builds the default profile and all named profiles.
- `--night` asks the build to include valid Night Mode overlays.
- Missing or invalid Night Mode output is skipped without failing the day build.
- The user-facing skip message is `Night Mode unavailable/invalid and skipped`.
- No profile or night output is produced by automatic discovery unless the CLI request asks for it.
- Old `variant` CLI flags and `variants/` auto-discovery are removed in this iteration. Wave does not preserve old variant output path compatibility.

New user-facing design uses `profile`.

## Config Inheritance

Profiles inherit resolved default config, then apply profile-local config.

The merge model is:

- `resource`: inherit resolved default resources, then append profile resources.
- `parameter`: field-level merge.
- `parameterGroup`: group-level and field-level merge.
- `theme`: no inheritance. Each profile owns its own public API.
- CLI overrides apply after default config and profile config are merged. The command line remains the final build-time override for fields such as platform and output.

Path handling:

- Config inherited from `main.yaml` is first resolved in the `main.yaml` context and inherited as resolved truth.
- Config written in a profile file is resolved relative to that profile file.
- This applies to resource paths, `parameter.outputDir`, and `parameterGroup.*.outputDir`.

Resource namespaces:

- Each effective resource namespace after loading must be unique.
- A resource namespace may match the filename; this is normal and preferred.
- If a profile appends a resource whose loaded namespace already exists in inherited resources, the build should fail.

`$config.theme`:

- Only `main.yaml::$config.theme` defines the project name.
- If a profile file contains `$config.theme`, it should not affect output naming.
- Schema or doctor should report it as ignored or invalid. The build should not silently use it as a profile basename.

## Night Model

Night is profile-local. It is not another profile.

Night files inherit the corresponding profile's resolved config. They should not define their own `$config`.

Night is a color-mode overlay. Current confirmed writable scope:

- `theme.color.*`
- `theme.state.*`

Night should not override layout, radius, shadow structure, typography, spacing, or platform config in the current model.

Merge rules:

- Start from the corresponding day profile token tree.
- Apply the night file as a deep field-level override only under `theme.color.*` and `theme.state.*`.
- Missing day keys inherit from the day profile.
- New public token paths in night are invalid, even under `theme.color` or `theme.state`, because day and night outputs must remain switchable.
- Any night content outside the writable scope is invalid. Missing or invalid Night Mode never fails the day build, including when `--night` is explicit. The requested night output is skipped and the build emits `Night Mode unavailable/invalid and skipped`.

The final day and night outputs for a profile should be switchable. A night overlay may be partial, but after merge it must produce the same public API surface as the day profile.

Future automatic night generation can use the same CLI surface. A handwritten `@night` file should take precedence over automatic derivation.

## Public Theme Taxonomy Direction

The current orca files use `theme.dimension` for several different public concepts. This should be redesigned.

The proposed public `theme` roots are:

```text
theme.color
theme.state
theme.shadow
theme.gradient
theme.border
theme.radius
theme.font
theme.size
theme.space
theme.layout
```

Confirmed points:

- `theme` is the public API root.
- `theme.dimension` is no longer a public output root. During the migration phase, build warns once when public `theme.dimension` is present, and doctor provides detailed migration guidance. After the migration phase, the build warning can be removed.
- `dimension` should not be the public bucket for unrelated concepts.
- `theme.color` is for semantic colors that can be consumed directly. Source-like calibration values do not belong here.
- `theme.state` is for global UI state intensity values such as hover, press, focus, drag, and disabled.
- `theme.state.*` should use number values in the `0..1` range.
- `theme.state.*` is a public state parameter, not a finished state color and not a component state token.
- `theme.state.*` does not bind itself to color alpha or layer opacity. The intended usage should be explained with `$description`, and exporters may map it differently by platform.
- Current `theme.dimension.interaction` is better modeled as `theme.state.*`.
- SCALES places state under alias color tokens, for example hover and press colors with Token Studio alpha modification. Wave should not copy that shape because Wave needs one global state intensity to feed Sketch opacity, CSS alpha, and later component rules.
- `theme.shadow` is a public shadow or elevation API, not a color token and not a dimension token.
- Current numeric shadow names such as `shadow.1` through `shadow.5` should move toward elevation semantics.
- Confirmed v1 shadow direction: `theme.shadow.elevation.low`, `theme.shadow.elevation.medium`, `theme.shadow.elevation.high`, and `theme.shadow.elevation.highest`.
- Confirmed v1 gradient mask direction: `theme.gradient.mask.soft` and `theme.gradient.mask.strong`. Public names should describe visual behavior, not implementation curves or first-use scenarios such as media or playbar.
- Confirmed v1 border width direction: `theme.border.width.thin`, `theme.border.width.medium`, and `theme.border.width.thick`.
- `theme.border` can contain normal border tokens and outline-like border tokens.
- Outline should not introduce `$type: outline` or top-level `theme.outline` in v1. Use `theme.border.outline.*` with `$type: border` and `$extensions.outline`.
- `outline.offset` belongs in `$extensions.outline.offset`, not as a separate public token.
- `outline.offset` should be number-first. A number means a platform-neutral design unit, and exporters decide how to render it. References to px dimension tokens can be accepted and normalized to number.
- `outline.offset` should be non-negative in v1. Negative outline offsets are CSS-valid, but Sketch simulation and multi-platform meaning are not yet designed.
- Do not use `$extensions.wave` for outline. Do not introduce per-platform shapes such as `outline.sketch`. The path `theme.border.outline.*` plus generic `$extensions.outline` is enough authoring signal; platform exporters should choose their default rendering strategy.
- Confirmed v1 radius names: `theme.radius.zero`, `theme.radius.xs`, `theme.radius.sm`, `theme.radius.md`, `theme.radius.lg`, `theme.radius.xl`, `theme.radius.xxl`, and `theme.radius.max`.
- Confirmed v1 font direction: `theme.font` is primarily typography composite public API. Font primitives such as family, size, weight, line height, and letter spacing should live in source resources unless there is a direct public API need.
- `theme.font` accepts DTCG `$type: typography` tokens. Wave constrains only the top-level `theme.font` root; names below it, such as `theme.font.heading.h1`, are recommended demo taxonomy rather than schema restrictions.
- `theme.size`, `theme.space`, and `theme.layout` remain reserved public keys, but their internal taxonomy is not designed yet because current Sketch output does not consume them well.
- Calibration values such as black point, white point, and current point are not public `theme.color` API. They may be documented under a top-level `$helper` section while Wave does not parse top-level `$key` helper roots.

Geometry and scalar rules:

- Pixel-like public values are number-first.
- A number means the design unit that exporters can render as pixels where needed.
- References to `dimension` tokens with `unit: px` are allowed and should normalize to number.
- This applies to radius, border width, outline offset, shadow geometry, and future size, space, and layout values.
- This does not apply to color, state, or font composites.

Still open:

- Exact taxonomy and naming for size, space, and layout.
- Whether Wave should introduce any CSS-only state behavior token.
- How Sketch-specific state opacity mapping should consume `theme.state.*` without making Sketch paths define public taxonomy.

## Outline Authoring Contract

The authoring contract should stay generic:

```yaml
theme:
  border:
    outline:
      focus:
        $type: border
        $value:
          color: "{theme.color.outline.ring}"
          width: "{theme.border.width.medium}"
          style: solid
        $extensions:
          outline:
            offset: 2
```

Rules:

- `theme.border.outline.*` expresses the semantic path.
- `$type: border` keeps the token DTCG-compatible.
- `$extensions.outline.offset` carries the only v1 outline-specific parameter.
- The extension is Wave authoring metadata, but it should not use a `wave` namespace.
- CSS output emits an outline value variable plus an offset companion variable. It does not split color, width, or style fields in v1.
- Sketch output simulates outline with two shadow layers in final Sketch JSON order:
  1. ring layer: `x=0`, `y=0`, `blur=0`, `spread=width + offset`, `color=<outline color>`;
  2. gap layer: `x=0`, `y=0`, `blur=0`, `spread=offset`, `color=#ffffff`.
- Normal shadow tokens still use the existing `.reverse()` behavior. Outline output does not reuse that branch; it returns final Sketch order directly.

Implementation should normalize the extension once, then let each formatter decide how to consume it.

## Scale Direction

`scale` should be origin/source, not public `theme` API.

SCALES uses:

```text
scaling/factors -> breakpoint dimension -> alias dimension
```

Wave should use the same discipline:

- source scale defines raw steps.
- `theme.size`, `theme.space`, `theme.radius`, and `theme.state` map those steps into public API.

The current built-in `wave.dimension` resource can remain compatible, but the product concept should move toward source scale rather than public `theme.dimension`.

Example direction:

```yaml
theme:
  radius:
    md:
      $value: "{wave.dimension.px.4}"
  shadow:
    elevation:
      low:
        $type: shadow
        $value:
          - color: "{theme.color.shadow}"
            offsetX: 0
            offsetY: 1
            blur: 2
            spread: 0
      medium:
        $type: shadow
        $value:
          - color: "{theme.color.shadow}"
            offsetX: 0
            offsetY: 4
            blur: 12
            spread: -4
      high:
        $type: shadow
        $value:
          - color: "{theme.color.shadow}"
            offsetX: 0
            offsetY: 8
            blur: 24
            spread: -6
      highest:
        $type: shadow
        $value:
          - color: "{theme.color.shadow}"
            offsetX: 0
            offsetY: 16
            blur: 32
            spread: -8
  gradient:
    mask:
      soft:
        $type: gradient
        $value:
          - color:
              $ref: "#/theme/color/shadow/$value"
              alpha: 0
            position: 0
          - color:
              $ref: "#/theme/color/shadow/$value"
              alpha: 1
            position: 1
        $extensions:
          smoothGradient:
            cubicBezier: "{wave.dimension.cubicBezier.easeInQuad}"
            step: 9
      strong:
        $type: gradient
        $value:
          - color:
              $ref: "#/theme/color/shadow/$value"
              alpha: 0
            position: 0
          - color:
              $ref: "#/theme/color/shadow/$value"
              alpha: 1
            position: 1
        $extensions:
          smoothGradient:
            cubicBezier: "{wave.dimension.cubicBezier.easeOutQuad}"
            step: 9
  border:
    width:
      thin:
        $type: dimension
        $value: "{wave.dimension.px.0}"
      medium:
        $type: dimension
        $value: "{wave.dimension.px.1}"
      thick:
        $type: dimension
        $value: "{wave.dimension.px.2}"
    outline:
      focus:
        $type: border
        $value:
          color: "{theme.color.outline.focus}"
          width: "{theme.border.width.medium}"
          style: solid
        $extensions:
          outline:
            offset: 2
  state:
    hover:
      $type: number
      $description: Hover state intensity. Exporters may use it as opacity or color alpha depending on platform.
      $value: "{wave.dimension.alpha.100}"
    disabled:
      $type: number
      $description: Disabled state intensity. Exporters may use it as opacity or color alpha depending on platform.
      $value: "{wave.dimension.alpha.400}"
```

`theme.size`, `theme.space`, and `theme.layout` are intentionally absent from this example. They remain reserved keys until Wave has a clearer Sketch and cross-platform output story for them.

`theme.font` is implemented as DTCG typography composite output in this iteration. Keep concrete examples under `theme.font` focused on public typography tokens, not source font primitives.

## Current Code Impact

Current code exploration shows these gaps between this draft and the current implementation:

- `theme-service.ts` automatically detects `main@night.yaml` and files under `variants/`. The draft requires explicit selection: default only, `--profile`, `--profiles all`, and optional `--night`.
- `theme-pipeline.ts` parses `$config` only from the entry `main.yaml` shape and requires `$config.resource`. A profile resolver will need to merge effective config before parsing profile tokens.
- `token-generator.ts` filters CSS output to root keys `color` and `style`. That excludes `theme.shadow`, `theme.gradient`, `theme.border`, `theme.radius`, and `theme.state` even though the CSS formatter can format shadow and gradient values.
- `css.ts` already has formatter branches for `shadow` and `gradient`, so the CSS dimension-layer output problem is partly a selection and taxonomy problem. Border and outline still need formatter design.
- `formats/utils.ts` currently strips `px` from shadow lengths, including non-zero values. Before expanding CSS shadow output, decide whether numeric shadow values are acceptable CSS, whether the formatter should append `px`, or whether the output is meant for a non-browser CSS-like consumer.
- `schema/theme.ts` knows `smoothShadow`, `smoothGradient`, `inheritColor`, and `sketch`, but not `outline`. Implementing outline requires adding `outline` to known extensions and validating `outline.offset`.
- `schema/theme.ts` does not list `typography` as a known type today. The implementation should add DTCG typography support for `theme.font` tokens.
- `theme-transformer.ts` consumes known extensions and emits normalized `WaveToken` metadata. Implementing outline should add normalized outline metadata, for example `_outline: { offset?: number }`, instead of leaking raw `$extensions`.
- `sketch-extension.ts` and `sketch.ts` only normalize Sketch path/property hints. They should not become the semantic home for outline behavior.
- `schema/theme.ts` currently restricts `sketch.property` to a `dimension` root. Moving `theme.dimension.interaction` to `theme.state` requires either relaxing this rule or replacing state output with path-driven Sketch formatter behavior.
- `types/index.ts` does not include outline metadata on `WaveToken` today.
- Top-level `$helper` is skipped by schema validation and token transform today, and current curly-brace references cannot use `$helper` as a namespace. Treat `$helper` as documentation-only until a parser/resolver contract is designed.

This means the taxonomy can be adopted incrementally, but CSS and Sketch exporters need targeted changes before the new roots become fully consumable.

## Orca Migration Sketch

This is a mapping guide for the current orca example, not a mechanical migration script:

```text
theme.color.black.point       -> $helper.color.black.point
theme.color.white.point       -> $helper.color.white.point
theme.color.current.point     -> $helper.color.current.point
theme.dimension.interaction.* -> theme.state.*
theme.dimension.shadow.1      -> theme.shadow.elevation.low
theme.dimension.shadow.2      -> theme.shadow.elevation.medium
theme.dimension.shadow.3      -> theme.shadow.elevation.high
theme.dimension.shadow.4/5    -> theme.shadow.elevation.highest or later refined names
theme.dimension.gradient-mask-smooth       -> theme.gradient.mask.soft
theme.dimension.gradient-mask-smooth-media -> theme.gradient.mask.strong
theme.dimension.radius.*      -> theme.radius.*
```

The only questionable mapping is `shadow.4/5`. If both are needed in real use, v1 should either add one more elevation name or keep one as a component-level token later. Do not force five raw levels into four public names without checking usage.

## Non-Goals For Now

Do not introduce a Token Studio style token set composition system now.

Wave should not add:

- `tokenSets`
- `$themes.selectedTokenSets`
- `enabled` / `source` token-set states

The current model should use:

- project-level `$config.resource`
- default profile `main.yaml`
- named profile files
- explicit build selection

## Open Questions

These questions remain unresolved:

- Whether `main.yaml` should eventually be renamed to `default.yaml`. Current recommendation is to keep `main.yaml`.
- Whether automatic night generation should be a separate command or only an implementation behind `--night`.
- Whether `theme.size`, `theme.space`, and `theme.layout` need first-class Sketch output before they leave reserved status.
