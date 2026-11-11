---
title: Check a token workspace
description: Use token doctor to check structure, resources, identity, and existing output directories.
category: Design Token
commands:
  - wave token doctor
appliesTo:
  - Local CLI
---

## Usage

```bash
wave token doctor
wave token doctor -f ./main.yaml
wave token doctor -f ./themes/mobile.yaml
```

`-f` accepts a main, a directory containing main, or a Day profile in any directory. A default main input checks main plus named profiles under the existing discovery rules; an explicit profile file checks only the selected target.

## Check scope

- main/profile structure and base linkage.
- `$override` hits and redundant overrides.
- Document and token identity conflicts.
- All resources declared by the currently selected targets, including declarations that are never referenced.
- Migratable legacy `theme.dimension` usage.

Redundant overrides produce info only and do not change the success state. Structure errors, identity conflicts, and invalid resources exit non-zero.

## Output directory check

```bash
wave token doctor -f ./main.yaml --output ./dist
```

`--output` checks an existing output directory. The check fails when the directory is missing or the path is not a directory. No output is created here and no build runs.

## Output modes

```bash
wave token doctor --status
wave token doctor --verbose
wave token doctor --json
```

All three modes share findings and exit status. JSON adds structured findings and identity; verbose expands the full identity details.

## Boundaries

Token doctor does not run WCAG. For contrast:

```bash
wave token wcag -f ./main.yaml
```

For the global runtime environment and toolchain, use `wave doctor`; for compression and motion tools, use `wave compress doctor` and `wave motion doctor` respectively.
