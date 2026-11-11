---
title: Maintain token identity
description: Use token ids to report or write back `$id`s of main, Day profiles, and tokens.
category: Design Token
commands:
  - wave token ids
appliesTo:
  - Local CLI
---

## Report only by default

```bash
wave token ids -f ./main.yaml
```

Reports document identity, registered and unregistered tokens, empty slots, non-canonical forms, and cross-file conflicts, without modifying files.

## Write identity back

After reviewing the report, run:

```bash
wave token ids --write -f ./main.yaml
```

The write scope covers main and Day profiles under the existing discovery rules. Missing or empty identity slots get filled; existing document root IDs are never re-issued. `$override` and Night files are excluded from writing.

Writing requires a clean Git worktree by default. Only when you confirm keeping current uncommitted changes, use:

```bash
wave token ids --write --allow-dirty -f ./main.yaml
```

## Identity rules

- main and each Day profile may declare their own document `$id` at the root.
- Token `$id` lives on the token; groups do not declare `$id`.
- Absent means unregistered; `null` or a blank string means a reserved slot.
- Token identity must be unique within one theme.
- Night must not carry a root `$id`; it inherits the Day identity.

A profile's `$config.base` must equal the main's registered root `$id`. When a profile exists but main is unregistered, the base does not match, or token IDs conflict, ids refuses to write any file. Do not bypass conflicts by re-issuing main's identity.

## Create follow-up content

After registering the base, create a profile:

```bash
wave token new profile mobile -f ./main.yaml
```

See [Create a workspace and profiles](/design-token/create) for profile creation prerequisites and output rules.
