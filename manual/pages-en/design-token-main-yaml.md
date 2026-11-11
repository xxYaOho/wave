---
title: main.yaml syntax
description: Reference for `$config`, parameterGroup, token structure, and `theme` top-level keys in main.yaml.
category: Design Token
commands:
  - wave token build
appliesTo:
  - Local CLI
---

## main.yaml

`main.yaml` declares both `$config` and token content. Fully self-contained tokens do not need to declare resources:

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./build
    platform: [json, css]
theme:
  color:
    primary:
      $type: color
      $value: "#2563eb"
```

When tokens reference external values, declare the dependencies through `$config.resource`:

```yaml
$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: example
  resource:
    palette:
      - tailwindcss
    dimension:
      - wave
  parameter:
    outputDir: ./build
    platform:
      - json
      - css
    colorSpace: hex
theme:
  color:
    $type: color
    primary:
      $description: Brand primary color
      $value: "{tailwindcss.color.indigo.600}"
    onPrimary:
      $value: "#ffffff"
  radius:
    card:
      $type: dimension
      $value: "12px"
```

`$config` supports:

| Field | Description |
| --- | --- |
| `theme` | Theme name, also the output file name prefix |
| `resource.palette` | Optional; palette resources, given as a non-empty string or a non-empty string array |
| `resource.dimension` | Optional; dimension resources, given as a non-empty string or a non-empty string array |
| `resource.custom` | Optional; custom resource files, given as a non-empty string or a non-empty string array |
| `parameter.outputDir` | Non-empty output directory |
| `parameter.platform` | Non-empty array; supports `json`, `jsonc`, `css`, `sketch`, `md-yml` |
| `parameter.filterLayer` | Integer ≥ 0; skips the first N path layers when outputting keys |
| `parameter.colorSpace` | Supports `hex`, `oklch`, `srgb`, `hsl` |
| `parameterGroup.<name>` | Additional output parameter sets; fields match `parameter` |

`$config` is a closed structure. Unknown fields, wrong types, empty strings, or invalid enum values fail the build and show the field path in the error.

Build only requires every reference in the token graph to resolve uniquely. Missing, broken, or duplicate resource declarations that are never referenced do not block the build; `wave token doctor` strictly checks every declaration on the current target.

## parameterGroup

`parameterGroup` builds several output sets at once. `parameter` provides the defaults and each group overrides fields of the same name. A group accepts exactly the same fields as `parameter`.

```yaml
$config:
  theme: example
  resource:
    palette: tailwindcss
    dimension: wave
  parameter:
    colorSpace: hex
    filterLayer: 1
  parameterGroup:
    css:
      outputDir: ./build/css
      platform: [css]
    sketch:
      outputDir: ./build/sketch
      platform: [sketch]
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss.color.indigo.600}"
```

Wave expands `parameterGroup`; each group produces one pass. `--output` overrides the output directories of these passes and does not change a group's platform, `filterLayer`, or `colorSpace`. The platform list is no longer overridden from the CLI; adjust `parameter` or the relevant parameter group in the configuration.

Wave checks every output path of the whole build before writing, including default, named profile, valid night, and each parameter group. If two passes would write the same file, the build fails immediately and existing files stay untouched; for example, one group outputs `[json, css]` while another outputs `[json]` into the same directory, and they fail because the JSON paths overlap. An invalid night still warns and is skipped, and does not join the path check.

## Token syntax

Wave uses DTCG-style structure:

```yaml
theme:
  color:
    $type: color
    surface:
      $value: "#ffffff"
    text:
      $value: "{theme.color.surface}"
```

Common fields:

| Field | Location | Description |
| --- | --- | --- |
| `$type` | group or token | Token type, inheritable by child nodes |
| `$value` | token | Token value |
| `$description` | group or token | Emitted into jsonc/css comments |
| `$id` | main/profile root, token | Identity field, see the next section |
| `$deprecated` | token | Marks deprecation |
| `$ref` | token | JSON Pointer reference, e.g. `#/theme/color/primary/$value` |
| `$extends` | group | Inherits another group, format `{theme.group.path}` |
| `$extensions` | group or token | Wave extension fields |

## The identity field $id

`$id` is Wave's identity field so that Sketch sync still recognizes tokens after they are renamed or moved. It has two levels:

- Document level: main and every day profile may declare their own `$id` at the root, delivered as `meta.themeId` in Sketch output. The field is optional; when declared it must be a non-empty string. Night files must not declare a root `$id` and inherit the day document identity.
- Token level: written on the token. Three states: absent means unregistered; an empty value (`null` or a blank string) means a reserved slot; a non-empty string registers the identity. Token identity must be unique within one theme; groups cannot declare `$id`.

Use `wave token ids` to maintain both levels: by default it only prints a dry-run report, and `--write` writes back document root identity plus new token identity for main and day profiles. Missing or empty identity slots get filled and existing document root IDs are never re-issued; `$override` and night files are excluded from writing. Writing requires a clean Git worktree by default; to keep current uncommitted changes, pass `--allow-dirty` explicitly.

A profile's `$config.base` must equal the main's registered root `$id` from before the run. Whenever a profile exists while main is unregistered, or any profile's base is missing or mismatched, ids refuses to write any file. Register main in a base directory that has no profiles yet, then create profiles. Details: [Profiles and Night](/design-token/quality-theming).

`$id` does not affect token values in json, jsonc, css, or md-yml; Sketch uses it only for asset association and never changes keys.

```bash
wave token ids -f ./main.yaml
wave token ids --write -f ./main.yaml
```

```yaml
$id: 6f1c2a54b7d84e0f9a1c32d45e6b70f8

$config:
  theme: example

theme:
  color:
    primary:
      $id: 0f8e6d5c4b3a29180f7e6d5c4b3a2918
      $type: color
      $value: "#2563eb"
```

Wave supports every standard DTCG 2025.10 `$type`:

| Category | `$type` |
| --- | --- |
| Basic values | `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `strokeStyle` |
| Composite values | `border`, `transition`, `shadow`, `gradient`, `typography` |

`opacity` is not a standard `$type`. Use a `number` token for transparency; `inheritColor.property.opacity` and `$extensions.platform.sketch.property.opacity` are Wave extension fields, documented under "Extensions and output". Unknown custom `$type`s produce a warning; JSON/JSONC keep the value, md-yml keeps YAML-safe values, CSS emits scalars only, and custom objects or arrays fail the CSS build.

## Dimension syntax

The DTCG standard dimension uses an object with units limited to `px` or `rem`:

```yaml
space:
  $type: dimension
  $value:
    value: 8
    unit: px
```

Wave also accepts these shorthands:

```yaml
spaceNumber:
  $type: dimension
  $value: 8
spaceString:
  $type: dimension
  $value: "8"
spaceLength:
  $type: dimension
  $value: "0.5rem"
spaceObject:
  $type: dimension
  $value:
    value: 8
```

The shorthands also support `pt`, `em`, and `%`. Unit-less values default to `px` in JSON, JSONC, and CSS, so both `8` and `{ value: 8 }` output `"8px"`. These forms are Wave input capabilities, not the DTCG standard dimension; when Sketch native numeric properties cannot express a unit, the build stops instead of converting silently.

## Typed references

A complete-token alias inherits the target token's type; references inside composite values must point at matching standard types:

```yaml
theme:
  color:
    primary:
      $type: color
      $value: "#1872f0"
  radius:
    small:
      $type: dimension
      $value: 4
  border:
    dashed:
      $type: strokeStyle
      $value:
        dashArray: [4, 8]
        lineCap: butt
    control:
      $type: border
      $value:
        color: "{theme.color.primary}"
        width: "{theme.radius.small}"
        style: "{theme.border.dashed}"
    controlAlias:
      $value: "{theme.border.control}"
```

You can also reference a complete value with `$ref: "#/theme/border/control/$value"`. Type mismatches, unresolved references, or composites missing standard fields report the token path and fail the build.

## `theme` top-level keys

Top-level keys under `theme` express token purpose and also shape CSS and Sketch output. New projects should prefer these roots:

| Key | Purpose | Common `$type` |
| --- | --- | --- |
| `color` | Brand, semantic, text, background, and stroke colors | `color` |
| `state` | Interaction state values such as hover, pressed, disabled | `number` |
| `shadow` | Drop, elevation, and smooth shadows | `shadow` |
| `gradient` | Gradients, mask gradients, smooth gradients | `gradient` |
| `border` | Stroke widths, stroke styles, outline tokens | `dimension`, `border` |
| `radius` | Corner radii and component radii | `dimension`, `number` |
| `font` | Font, size, weight, line-height, and letter-spacing combinations | `typography` |

CSS output treats only `color`, `state`, `shadow`, `gradient`, `border`, `radius`, and `font` as public roots. `theme.dimension` remains only for legacy project compatibility and is no longer a recommended public output root; put dimensions, opacity, and curves into the root matching their purpose, or keep using them as `$config.resource.dimension` reference resources.

References come in two forms:

```yaml
primary:
  $value: "{tailwindcss.color.indigo.600}"

secondary:
  $ref: "#/theme/color/primary/$value"
```

## Compatibility fields

| Field | Status | Replacement |
| --- | --- | --- |
| `currentColor` | deprecated | `inheritColor` |

New documents and new projects should not keep using compatibility fields.
