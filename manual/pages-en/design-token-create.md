---
title: Create a workspace and profiles
description: Use token new to create a base workspace or a profile from a registered base.
category: Design Token
commands:
  - wave token new
  - wave token new profile
appliesTo:
  - Local CLI
---

## Create a token workspace

```bash
wave token new
```

By default, creates a `main.yaml` with `$config` in the current directory. Target a different directory:

```bash
wave token new --output ./my-tokens
```

The target is `./my-tokens/main.yaml`. The directory itself may already exist, but when the target `main.yaml` exists, replacing it requires `--force`.

Preview the plan only:

```bash
wave token new --output ./my-tokens --dry-run
```

## Create a named profile

First register the base document and all token identities:

```bash
wave token ids -f ./main.yaml
wave token ids --write -f ./main.yaml
```

Then create the profile:

```bash
wave token new profile mobile -f ./main.yaml
```

The default output is `<workspace>/profiles/mobile.yaml`. Profile names are lowercased and ASCII spaces become `_`; illegal names, duplicate names, and invalid output file names are rejected.

## Profile custom output

Use `-o, --output` to specify the file:

```bash
wave token new profile mobile -f ./main.yaml --output ./themes/mobile.yaml
```

The output file's stem must equal the normalized profile name. For example, `mobile` can only be written as `mobile.yaml`, not `desktop.yaml`.

If the output sits in the base `main.yaml`'s directory or a subdirectory, it builds directly:

```bash
wave token build -f ./themes/mobile.yaml
```

If the output goes outside the base directory tree, Wave cannot locate main from `$config.base` alone. Move the same `mobile.yaml` into a directory tree the base can discover, then build it through `-f`. `--profiles all` does not scan arbitrary external locations.

## Write safety

Both creation commands follow:

- Target missing: create the target file.
- Target exists: reject and leave the bytes untouched.
- `--force`: overwrite only the target file selected this run.
- `--dry-run`: print the full plan without creating directories or files.

Same-name profile conflicts and target file conflicts are checked separately. A custom path cannot bypass a same-name profile conflict; `--force` allows replacement only when the conflict is the current output target itself.

## What gets generated

A profile carries its own document `$id`, a `$config.base` pointing at the base, and an `$override` snapshot of base token source values. Reference expressions stay as written and are not materialized in advance.

After creation, delete redundant overrides that do not need to be pinned so those tokens keep following the base. For Night, see [Create a Night overlay](/design-token/night).
