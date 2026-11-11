---
title: Create a Night overlay
description: Generate a Night overlay from a Day main or Day profile, controlling output location and overwrite behavior.
category: Design Token
commands:
  - wave token new night
appliesTo:
  - Local CLI
---

## Purpose

Generate a path-based Night overlay from an existing Day source document:

```bash
wave token new night
wave token new night -f ./themes/acme
wave token new night -f ./themes/acme/themes/mobile.yaml
```

The command completes base/profile merging, resource loading, and reference resolution, then derives Night from the resolved Day colors. It never modifies the Day source file.

## Input

| Input | Day source document |
| --- | --- |
| `-f` omitted | `./main.yaml` |
| `-f <directory>` | `<directory>/main.yaml` |
| `-f <main.yaml>` | The specified main |
| `-f <other-day.yaml>` | The specified profile |

Profiles may live in `profiles`, `themes`, `variants`, or any other directory. Wave searches ancestor directories for the nearest base `main.yaml` and verifies the profile's `$config.base`.

Do not pass `@night.yaml`, resource files, or standalone YAML without a base.

## Default output

The output file sits next to the Day source document:

```text
main.yaml                 → main@night.yaml
themes/mobile.yaml        → themes/mobile@night.yaml
variants/mobile.yaml      → variants/mobile@night.yaml
```

The fixed naming lets the following command find the overlay automatically:

```bash
wave token build -f <Day source document> --night
```

## Custom output

Use `-o, --output` to specify another YAML file:

```bash
wave token new night -f ./themes/acme/themes/mobile.yaml --output ./drafts/mobile-night.yaml
```

Custom locations are not discovered by the default build. To consume them:

1. Move the content back to `mobile@night.yaml` next to the Day source document.
2. Run the original Day profile's build:

```bash
wave token build -f ./themes/acme/themes/mobile.yaml --night
```

Building main alone never consumes a profile's Night.

## Overwrite and preview

When the target exists, it is rejected by default and the original file stays untouched:

```bash
wave token new night -f ./main.yaml
```

To confirm the overwrite:

```bash
wave token new night -f ./main.yaml --force
```

Preview the generation plan without writing files:

```bash
wave token new night -f ./main.yaml --dry-run
```

`--force` overwrites only the target overlay; it never touches the Day document, base, or other files. Directory and symlink targets are still rejected.

## Appearance parameters

```bash
wave token new night --scene candle-light
wave token new night --luminance 0.55
wave token new night --luminance-ev high
```

| Parameter | Values |
| --- | --- |
| `--scene` | `moon`, `night-light`, `night`, `candle-light`, `sunset` |
| `--luminance` | Primary Night luminance dial from 0 to 1 |
| `--luminance-ev` | `minimal`, `low`, `medium`, `high`, `max` |

Priority:

```text
--luminance > --luminance-ev > $config.night > built-in defaults
```

Scene uses `--scene > $config.night.scene > night`. `--luminance` controls luminance, not chroma; the legacy `--chroma` and `--chroma-ev` flags are no longer accepted.

## Content contract

The overlay contains only `$value` overrides for paths that already exist under `theme.color` and `theme.state`, and never writes a root `$id`. Day and Night share the theme identity; Sketch distinguishes the appearance through `meta.mode=night`.

After generation, run:

```bash
wave token doctor -f <Day source document>
wave token wcag -f <Day source document> --night
wave token build -f <Day source document> --night
```
