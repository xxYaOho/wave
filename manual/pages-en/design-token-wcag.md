---
title: Check WCAG contrast
description: Use token wcag to check color contrast of main, profiles, or Night.
category: Design Token
commands:
  - wave token wcag
appliesTo:
  - Local CLI
---

## Declare check items

Declare at the root of `main.yaml`:

```yaml
doctor:
  wcagPairs:
    primary-on-surface:
      foreground: "{theme.color.primary}"
      background: "{theme.color.surface}"
```

Each pair must contain `foreground` and `background`. Both values must be alias strings pointing at resolved color tokens.

The `doctor` root key does not participate in token output.

## Run the check

```bash
wave token wcag
wave token wcag -f ./main.yaml
wave token wcag -f ./themes/mobile.yaml
wave token wcag -f ./themes/mobile.yaml --night
```

`-f` selects a main or a Day profile directly; there is no `[scope]` or `--profile`. `--night` reads the conventional overlay next to the current Day source document.

## Scoring

| Dimension | AA | AAA |
| --- | --- | --- |
| Normal Text | 4.5 | 7 |
| Large Text | 3 | 4.5 |
| UI Components | 3 | No AAA judgment |

Thresholds use the unrounded ratio. Red scores are reporting only and do not block the command; invalid schema, unresolved references, non-color inputs, or unsynthesized alpha return non-zero.

## How it differs from other checks

`wave token doctor` checks workspace health and does not run WCAG. `wave doctor` only checks the local toolchain.
