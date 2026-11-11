---
title: Extensions and output
description: Reference for `$extensions` fields and the json, jsonc, css, sketch, and md-yml output formats.
category: Design Token
commands:
  - wave token doctor
  - wave token migrate extensions
appliesTo:
  - Local CLI
---

## Output formats

| platform | Output file | Description |
| --- | --- | --- |
| `json` | `{theme}.json` | Flat JSON |
| `jsonc` | `{theme}.jsonc` | JSONC with comments |
| `css` | `{theme}.css` | CSS variables |
| `sketch` | `{theme}2sketch.json` | Sketch asset manifest (payload v2) |
| `md-yml` | `{theme}2md.yml` | YAML token fragment for Markdown frontmatter |

CSS output covers the `color`, `state`, `shadow`, `gradient`, `border`, `radius`, and `font` roots. `theme.dimension` is no longer a public output root; the build suggests migration, and full recommendations come from `wave token doctor`.

Typography tokens emit field variables in CSS (`-family`, `-size`, `-weight`, `-line-height`, `-letter-spacing`, optionally `-color`) rather than an aggregate shorthand variable, and emit text asset records in Sketch. Border tokens with `$extensions.platform.sketch.outline` emit the outline value and offset companions in CSS, and generate a two-layer shadow that simulates the outline in Sketch.

### Platform output of standard types

JSON and JSONC output flat key/value; dimension and dimension fields inside composites keep their unit strings. md-yml uses the same final values but groups them by namespace. CSS emits directly consumable values. Sketch output is an asset manifest; only syncable assets produce records:

| `$type` | JSON / JSONC | CSS | Sketch |
| --- | --- | --- | --- |
| `color` | Target color space string, or a clean DTCG color object | CSS Color 4 value | `kind: color` record with HEX8 color |
| `dimension` | `"8px"` | `8px` | `kind: layer` record when in a radius group or generating a sketch property dimension; otherwise no record |
| `fontFamily` | string or string array | font stack | no record |
| `fontWeight` | number | number | no record (text records only accept 100–900 in hundreds) |
| `duration` | `"200ms"` | `200ms` | no record |
| `cubicBezier` | number array | `cubic-bezier(...)` | no record |
| `number` | number | number | `kind: layer` record when in a radius group or generating a sketch property dimension; otherwise no record |
| `strokeStyle` | string or `{ dashArray, lineCap }` | main variable plus dash/line-cap companions | no record |
| `border` | `{ color, width, style }` | border shorthand plus required companions | only borders with `platform.sketch.outline` generate a `kind: layer` record |
| `transition` | `{ duration, delay, timingFunction }` | transition value | no record |
| `shadow` | Single-layer object or layer array | box-shadow value | `kind: layer` record (`shadows` field) |
| `gradient` | stop array | linear-gradient value | `kind: layer` record (`gradient` field) |
| `typography` | Five standard fields plus optional Wave `color` | field variables | `kind: text` record |

When a platform cannot express an input, Wave stops the build and reports the token path, type, and reason. Typical failures include: a color that CSS or Sketch cannot convert with no `hex` fallback, an empty font family or negative or all-zero dash pattern in CSS, and relative units Sketch native numeric properties cannot represent. For unknown custom `$type`s, CSS accepts scalars only; objects or arrays fail explicitly, and `[object Object]` output is forbidden.

When the current directory has a `main.yaml`, `wave token doctor` checks it by default; pass `wave token doctor -f ./main.yaml` to be explicit.

Multiple platforms are declared in `$config`:

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, jsonc, css, sketch, md-yml]
```

## md-yml

`md-yml` generates a YAML token fragment that can be copied into Markdown frontmatter. With `filterLayer: 1`, the following tokens produce `{theme}2md.yml`:

```yaml
color:
  primary-main: '#1a72f0'
  primary-on-main: '#ffffff'
  text-emphasis: '#112233'
radius:
  md: 8px
font:
  font-family:
    - system-ui
    - sans-serif
  heading-h1:
    color: "{color.text-emphasis}"
    fontFamily: "{font.font-family}"
    fontSize: 2.5rem
    fontWeight: 700
    letterSpacing: 0px
    lineHeight: 1.2
```

The first output layer is the namespace, and the remaining source path segments join with `-`. So `theme.color.primary.main` becomes `color.primary-main` after filtering `theme`, and document bodies can use:

```markdown
{color.primary-main}
```

md-yml keeps theme direct references that project onto the same file and rewrites their paths to output paths. For example, `theme.font.heading.h1` inherits `fontFamily: "{theme.font.font-family}"` from the flat fields of `theme.font.$extensions.typography` and outputs as `fontFamily: "{font.font-family}"`. Direct references inside complete tokens, composite sub-fields, and array members follow the same rule.

A reference survives only when the target is also emitted into the current payload and the consumer slot is not rewritten by computation. External resource references, `$ref` + override, `smoothShadow` / `smoothGradient`, `inheritColor` / `currentColor`, and other computed values still output the final value after resolver and transformer processing. Objects, arrays, and explicit composites keep their structure. The file contains no `---` delimiter, `$description` comments, token wrappers, or `$type` / `$value` metadata.

After `filterLayer` processing, at least a namespace and a local key must remain. Source segments in the path cannot be empty or contain `.`; when different source paths project onto the same key, the build fails. The build also fails before writing any product of that pass when a value contains data YAML cannot represent losslessly, such as `undefined`, non-finite numbers, sparse arrays, or cycles.

## $extensions

`$extensions` expresses Wave's extension semantics. After the build, extension fields are consumed and never appear verbatim in output files.

Profiles inherit base tokens and the extensions of existing groups; re-declaring or overriding them is not allowed. `$override` replaces `$value` only and cannot change extension settings like `smoothShadow.target`, `platform.sketch.path`, or `inheritColor.property.opacity`. When those differences are needed, create a separate base directory; new tokens can declare their own extensions. Full boundaries: [Profiles and Night](/design-token/quality-theming).

Supported fields:

| Field | Location | Applicable types | Purpose |
| --- | --- | --- | --- |
| `typography` | group | effective type `typography` | Font default fields and rem base; see [Colors and typography](/design-token/color-typography) |
| `smoothShadow` | token | `shadow` | Derive a multi-layer smooth shadow from a single layer |
| `smoothGradient` | token | `gradient` | Derive a smooth gradient from 2 stops |
| `inheritColor` | token | `color` | Emit a context-inheriting color |
| `platform.sketch.path` | group or token | any token | Adjust the grouping prefix of Sketch asset names |
| `platform.sketch.skip` | group or token | any token | Skip Sketch output only |
| `platform.sketch.property.opacity` | token | `number` under `theme.state.*` | Emit the Sketch opacity field |
| `platform.sketch.property.cornerRadius` | token | radius/dimension tokens | Emit the Sketch corners.radii field |
| `platform.sketch.outline` | border token | `border` | Emit a CSS outline and the Sketch two-layer shadow simulation |
| `composite` | group | direct children must be tokens | Merge a group of tokens into a component object |
| `currentColor` | token | legacy | Legacy compatibility field; new content uses `inheritColor` |

The legacy forms `$extensions.sketch.*` and `$extensions.outline` are rejected outright by the build, which points to the migration command. One run in the project directory completes the rename (preview only by default; add `--write` to write back):

```bash
wave token migrate extensions --write
```

## smoothShadow

`smoothShadow` applies to `shadow` tokens, deriving a multi-layer smooth shadow from a single layer.

```yaml
theme:
  shadow:
    $type: shadow
    card:
      $value:
        color: "#00000033"
        offsetX: 0
        offsetY: 8
        blur: 24
        spread: 0
      $extensions:
        smoothShadow:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 4
```

Fields:

| Field | Description |
| --- | --- |
| `cubicBezier` | 4 numbers, or a curve referenced from a dimension resource |
| `step` | Number of visible output layers, integer `>= 1` |
| `target` | Optional target shadow layer; when present, interpolates from the current shadow to the target |

The input value must be a single shadow layer object, not an array. With `target`, `step` must be `>= 2`.

`target` accepts the same fields as a shadow layer, and can specify the target transparency alone through `alpha`:

```yaml
$extensions:
  smoothShadow:
    cubicBezier: [0.4, 0, 0.2, 1]
    step: 4
    target:
      alpha: 0.08
      offsetX: 0
      offsetY: 16
      blur: 48
      spread: -4
```

## smoothGradient

`smoothGradient` applies to `gradient` tokens, expanding 2 endpoints into multiple gradient stops.

```yaml
theme:
  gradient:
    $type: gradient
    overlay:
      $value:
        - color: "#00000000"
          position: 0
        - color: "#000000cc"
          position: 1
      $extensions:
        smoothGradient:
          cubicBezier: [0.4, 0, 0.2, 1]
          step: 7
```

Fields:

| Field | Description |
| --- | --- |
| `cubicBezier` | 4 numbers, or a curve referenced from a dimension resource |
| `step` | Total stop count, integer `>= 2` |

The input gradient must have exactly 2 stops.

## inheritColor

`inheritColor` applies to `color` tokens, meaning the output inherits the context color.

```yaml
theme:
  color:
    $type: color
    icon:
      $value: "#000000"
      $extensions:
        inheritColor: true
    iconSubtle:
      $value: "#000000"
      $extensions:
        inheritColor:
          property:
            opacity: 0.36
          siblingSlot: foreground
```

Fields:

| Field | Description |
| --- | --- |
| `inheritColor: true` | Emit an inheriting color |
| `property.opacity` | Emit opacity; supports numbers, aliases, `$ref` |
| `property.alpha` | Emit alpha; supports numbers, aliases, `$ref` |
| `siblingSlot` | In Sketch output, find the sibling color value within the same composite |

Output differences:

| Platform | Output |
| --- | --- |
| `css` | `currentColor` or `color-mix(in srgb, currentColor X%, transparent)` |
| `json` / `jsonc` / `md-yml` | `$COLOR_FOREGROUND` or `{ color: "$COLOR_FOREGROUND", opacity: X }` |
| `sketch` | Writes Sketch color, `opacity`, or `alpha` fields |

## platform.sketch

`$extensions.platform.sketch` only controls Sketch JSON output and does not affect the keys of `json`, `jsonc`, `css`, or `md-yml`. `path` and `skip` can be written on a group or a token; on a group, they apply to descendant tokens.

```yaml
theme:
  color:
    $type: color
    $extensions:
      platform:
        sketch:
          path: foundation/color
    primary:
      $value: "#1872f0"
  state:
    hover:
      $type: number
      $value: 0.16
      $extensions:
        platform:
          sketch:
            path: foundation/interaction
            property:
              opacity: true
  radius:
    card:
      $type: dimension
      $value: "12px"
      $extensions:
        platform:
          sketch:
            property:
              cornerRadius: true
```

Fields:

| Field | Description |
| --- | --- |
| `platform.sketch.path` | Slash grouping prefix of Sketch asset names, e.g. `foundation/color`; can be written on a group or a token |
| `platform.sketch.skip` | When `true`, omits Sketch output; a descendant group or token may explicitly write `false` to restore output |
| `platform.sketch.property.opacity` | Writes the `opacity` number in layer records |
| `platform.sketch.property.cornerRadius` | Writes the `corners.radii` number in layer records |
| `platform.sketch.outline` | Border tokens only; generates the two-layer shadow outline simulation per `offset` and makes CSS emit outline variables |

`path` uses slash grouping as the prefix of asset names. Assuming `filterLayer: 1`, the color token above produces an asset named `foundation/color/primary`; without `path`, the name is the leaf key after `filterLayer` processing.

Priority:

1. The token's own `path`
2. The nearest parent group's `path`
3. The `path` of a higher ancestor group

`property` does not inherit. To emit `opacity` or `corners.radii`, it must still be written on the corresponding token.

`skip` accepts booleans only, inherits from the nearest declaration, and the token's own value wins. An explicit `false` overrides an ancestor group's `true`. This switch filters Sketch output only; CSS, JSON, JSONC, and md-yml still emit the token.

Limits:

- `path` must be a plain slash grouping path, e.g. `foundation/color`; leading/trailing slashes, empty segments, and `.` are not allowed.
- `property` supports only `opacity` and `cornerRadius`, the value must be `true`, and it can only be written on tokens.
- `property.opacity` applies to `number` tokens under `theme.state.*`.
- `property.cornerRadius` applies to radius/dimension tokens under `theme.radius.*` or `theme.dimension.*`.
- `outline` takes effect only on border tokens.
- Unknown fields, unknown properties, or misplaced usage fail the build. For example, `$type: number` with `property.fillColor: true` errors because `fillColor` is not a supported Sketch property; `$type: color` with `property.opacity: true` errors because `opacity` only accepts state number tokens.
- Unknown platforms under `platform.*` (e.g. `platform.figma`) only produce warnings and do not affect the build; they are reserved compatibility slots for future platforms.

## Sketch asset manifest

The `sketch` platform outputs a JSON asset manifest: the root holds `meta` and `assets`, with one asset per line inside `assets` for easy human review and git diff.

```json
{
  "meta": { "themeId": "6f1c2a54b7d84e0f9a1c32d45e6b70f8", "baseId": null, "version": 2 },
  "assets": [
    { "uuid": "0f8e6d5c4b3a29180f7e6d5c4b3a2918", "name": "foundation/color/primary-main", "kind": "color", "color": "#1872f0ff" },
    { "name": "foundation/interaction/hover", "kind": "layer", "opacity": 0.16 }
  ]
}
```

- `meta.themeId` comes from the current day document's root `$id`: main output uses main's identity, named profile output uses that profile's own identity; `null` when missing. Use `wave token ids --write` to fill in document identity. Night inherits the corresponding day's identity.
- `meta.baseId` is the main's root `$id` in named profile (including its night) output, and `null` in main (including its night) output. It is a payload v2 addition, and `version` stays fixed at `2`; if the Sketch plugin strictly validates the legacy `meta` field set, confirm the plugin accepts `baseId` first — do not judge compatibility by the version number alone.
- Every record carries `name` and `kind`; when the token has a registered token-level `$id`, it also carries `uuid`, otherwise that field is omitted.
- `kind` has exactly three values: `color` (color tokens, corresponding to Swatches), `text` (typography tokens, corresponding to shared text styles), and `layer` (shadows, gradients, outline borders, corner dimensions, etc., corresponding to shared layer styles).
- Only syncable assets enter the manifest: plain borders, plain dimensions, transitions, and the like produce no records.
- Text records contain only font fields (`fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `kerning`), never the text color; `fontWeight` accepts only the 100–900 hundreds scale, and other values error immediately at Sketch build time, leaving CSS and JSON unaffected.
- Layer records combine fields such as `shadows`, `gradient`, `opacity`, and `corners`; `fills` and `gradient` are mutually exclusive within one record.
- Records follow the token order in the theme files; renaming or changing anything besides `path` does not disturb the order.

Asset names must be unique within one manifest: when two tokens produce exactly the same name, the build errors. Slashes in names are plain characters, and overlapping prefixes are not conflicts — `shadow` and `shadow/elevation-1` can coexist.

Color positions in layer records always carry `#RRGGBBAA` HEX8 color snapshots with no Swatch binding; color assets in the same manifest still carry `uuid` by their own `$id` for Sync Token adoption. Details: [Colors and typography](/design-token/color-typography).

## composite

`composite` merges a group's direct child tokens into one component object. Suited to component variants such as buttons and cards.

```yaml
component:
  button:
    outline:
      $extensions:
        composite: true
      fill:
        $value: "{theme.color.surface}"
      border:
        $value: "{theme.color.primary}"
      radius:
        $value: "9999px"
```

Rules:

- `composite` is written on the group's `$extensions`.
- Direct children of a composite group must all be tokens; further group nesting is not allowed.
- JSON/JSONC/md-yml output merges into an object.
- Sketch output no longer maps composites to component style fields; component logic will be designed separately later.
