---
title: Migrate token source documents
description: Use the token migrate command group to migrate legacy extension fields and control source-file write-back.
category: Design Token
commands:
  - wave token migrate
  - wave token migrate extensions
appliesTo:
  - Local CLI
---

## Command group

`wave token migrate` has no default migration target. Currently supported:

```bash
wave token migrate extensions -f ./main.yaml
```

`extensions` migrates the legacy `$extensions` Sketch family syntax to `platform.sketch`. It does not migrate legacy standalone profiles and never changes token values or output platforms.

## Report and write back

By default, only a change report is printed:

```bash
wave token migrate extensions -f ./main.yaml
```

After reviewing the report, write back to main and the Day profiles in the workspace:

```bash
wave token migrate extensions -f ./main.yaml --write
```

`-f` accepts the base `main.yaml` or the directory containing it. Do not use resources, Night overlays, or single profiles as entry points for this workspace migration command.

Write-back modifies only source YAML within the confirmed scope. Review the report before running and make sure no unrelated changes are included.

## Get the manual for the current scope

```bash
wave token migrate -m
wave token migrate extensions -m
```

The first explains the command group and migration targets; the second gives the concrete usage of `extensions`.
