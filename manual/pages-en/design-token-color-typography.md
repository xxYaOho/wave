---
title: Colors and typography
description: Reference for DTCG color objects, alpha, typography tokens, and dashed borders.
category: Design Token
commands:
  - wave token --help
appliesTo:
  - Local CLI
---

## Colors and alpha

Prefer DTCG color objects to describe colors:

```yaml
primary:
  main:
    $value:
      colorSpace: oklch
      components: [0.518, 0.251, 262.6]
      hex: "#0052f5"
```

`hex` is a 6-digit fallback for compatibility output. Put transparency in `alpha`, never inside `hex`.

One build can output CSS and Sketch at the same time. CSS follows `colorSpace`; Sketch outputs `#RRGGBBAA`.

The legacy syntax keeps working. Color and transparency can be written separately, and both `color` and `alpha` accept references:

```yaml
inverse:
  surface:
    $description: Inverted background, commonly used for Snackbar or Toast
    $value:
      color: "{tailwindcss.color.slate.900}"
      alpha: "{wave.dimension.alpha.800}"
```

At build time, Wave resolves references first and then outputs the final color per `colorSpace`.

## Typography

A standard DTCG `typography` value must contain `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, and a unit-less number `lineHeight`. `fontFamily`, `fontSize`, `fontWeight`, and `letterSpacing` each follow their corresponding standard types and may reference tokens of matching types. Extra fields fail the build.

Wave provides flat `$extensions.typography`, an optional `$value.color`, and `lineHeight` with a `px | pt | rem` unit. The typography extension can only be written on a group whose effective `$type` is `typography`, and accepts exactly six sibling fields — `baseFontSize`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing` — declaring at least one. The legacy nested `typography.defaults` form is rejected; move its fields under `typography`.

The five standard fields act as defaults for child tokens: child groups shallow-override ancestor defaults per field, and the token's own `$value` overrides last; object fields are replaced wholesale with no deep merge. After merging, every typography token must contain the five standard fields. The optional `color` can only be written in the token `$value`, not as an extension default field; JSON/JSONC keep it, CSS additionally emits `--<token>-color`, and when it directly references an already-emitted `theme.color.*` it stays as `var(--<color-token>)`.

`fontSize` is the font size default of a typography composite; `baseFontSize` is only the rem conversion base — they are not the same setting. rem defaults to a `16px` base. To override it, declare a finite number greater than 0, or a reference resolving to such a number, in `theme.font.$extensions.typography.baseFontSize`; the value is interpreted in CSS px and cannot be a dimension object. The base itself is never included in the typography JSON/JSONC value. With rem in play, CSS writes a valid `font-size` on `:root` and keeps the token's rem values; Sketch converts `fontSize`, absolute `lineHeight`, and `letterSpacing` as `rem × effective base`. `fontSize` and `letterSpacing` keep up to three decimal places; the final `lineHeight` always rounds up to an integer.

```yaml
theme:
  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: 14
        fontFamily: ["Inter", "sans-serif"]
        fontSize:
          value: 0.875
          unit: rem
        fontWeight: 400
        letterSpacing: 0
    body:
      $value:
        lineHeight: 1.5
    label:
      $value:
        lineHeight:
          value: 20
          unit: px
```

### Adjust the rem base per profile

A profile cannot re-declare the extensions of an existing group. When different profiles need different bases, make `baseFontSize` in main reference a registered number token, then override that token's value by ID in the profile.

Base file `main.yaml`:

```yaml
$id: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$config:
  theme: example
  parameter:
    platform: [json, css, sketch]
theme:
  font:
    $type: typography
    $extensions:
      typography:
        baseFontSize: "{theme.font.base-size}"
        fontFamily: ["Inter", "sans-serif"]
        fontSize: { value: 1, unit: rem }
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: 0
    base-size:
      $id: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      $type: number
      $value: 14
    body:
      $value: {}
```

Delta file `profiles/mobile.yaml`:

```yaml
$config:
  base: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$override:
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:
    $value: 16
```

After running `wave token build -f ./profiles/mobile.yaml`, the body font size is still `1rem`; the CSS root font size is `16px` and the Sketch font size is `16`. main's base stays `14`. See [Profiles and Night](/design-token/quality-theming) for profile identity and the full override rules.

### Font and line-height output

`fontFamily` accepts one string or a string array. The DTCG schema keeps the standard structure; the CSS platform requires the value to form a non-empty font stack. CSS turns arrays into a legal font stack: plain CSS identifiers are unquoted; other names lose one layer of existing paired quotes, then get wrapped in double quotes with escaping. `inherit`, `initial`, `unset`, `revert`, and `revert-layer` are always quoted. A typography token in CSS only emits field variables (`-family`, `-size`, `-weight`, `-line-height`, `-letter-spacing`, and optionally `-color`), never an aggregate shorthand variable. When an already-emitted `fontFamily` token equals the typography's font stack, CSS omits the local `--<token>-family` field variable and consumers take the family token's own variable; without an equal-value token, the local `--<token>-family` is still emitted. Sketch does not resolve system aliases; when the array contains `PingFang SC` it is preferred, otherwise the first concrete font is chosen. `system`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, and CSS generic families are not concrete fonts; when the array contains only those, Sketch omits `fontFamily`. String values keep the existing behavior.

`lineHeight` must be greater than 0. A unit-less number or a numeric string means a multiplier; `{ value }` does not mean a multiplier and must carry a unit. CSS keeps multipliers and absolute units; Sketch's final `lineHeight` rounds up to an integer regardless of multiplier, `px`, `pt`, or `rem`. `fontSize`, absolute `lineHeight`, and `letterSpacing` use a rem base of 16 by default, overridable via `theme.font.$extensions.typography.baseFontSize`. Wave never converts between px and pt.

### Sketch color output

In Sketch output, every color asset's `color` field is an `#RRGGBBAA` HEX8 snapshot; colors with alpha or opacity overrides fold transparency into the snapshot's alpha channel. Color positions inside layer assets (`shadows[].color`, `gradient.color`) are HEX8 snapshots too, with no Swatch binding: whether a color token registers `$id` or is skipped by `sketch.skip` only affects whether it appears as a color asset in the manifest, never the values at color positions.

The gap layer of an outline is fixed to `#ffffffff`. The legacy `@/<path>` string references and the trial `{ "$ref": "<uuid>" }` bindings are no longer emitted; changing colors on the Sketch side requires re-importing the payload.

## Dashed borders

`border` is a standard composite of `color`, `width`, and `style`. `style` accepts a standard stroke style string, an object with `dashArray` and `lineCap`, or a reference to a standalone `strokeStyle` token:

```yaml
antline:
  $type: border
  $value:
    color: "{theme.color.primary}"
    width: 1
    style:
      dashArray:
        - value: 4
          unit: px
        - value: 8
          unit: px
      lineCap: butt
```

String styles support `solid`, `dashed`, `dotted`, `double`, `groove`, `ridge`, `outset`, and `inset`. An object style must contain both a non-empty `dashArray` and a `lineCap`; `lineCap` accepts only `round`, `butt`, `square`. `dashArray` members follow the dimension contract and also accept Wave dimension shorthands and extended units. Odd-length arrays repeat once; every platform outputs the same even-length array.

The DTCG schema does not restrict dash member signs or all-zero combinations; when CSS cannot express a negative or all-zero pattern, it shows the token path, type, and value shape, then fails. CSS outputs a usable `dashed` shorthand for object styles plus `-dash-array` and `-line-cap` companion variables, e.g. `--border-antline: 1px dashed #1872f0`, `--border-antline-dash-array: 4px 8px`, and `--border-antline-line-cap: butt`. A companion name colliding with a real token key fails the build. Sketch output contains only syncable assets; dashed borders produce no Sketch record.
