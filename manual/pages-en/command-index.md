---
title: Command index
description: Find Wave commands by task and get the Markdown manual at the matching level.
category: Reference
commands:
  - wave
appliesTo:
  - Local CLI
---

## Common commands

```bash
wave token
wave compress -f ./assets --dry-run
wave motion -f ./frames --format gif --dry-run
wave workspace --dry-run
```

`wave token` builds the current directory's `main.yaml` by default. Compression, motion, and workspace commands also run their tasks directly, with no extra `run`, `gif`, or `create` subcommand.

## Design Token

| Command | Purpose |
| --- | --- |
| `wave token build` | Generate token outputs |
| `wave token new` | Create a token workspace |
| `wave token new profile <name>` | Create a profile from a registered base |
| `wave token new night` | Create a Night overlay from a Day main or profile |
| `wave token doctor` | Check workspace, resources, and identity |
| `wave token wcag` | Check color contrast |
| `wave token ids` | Report or write back document and token identity |
| `wave token migrate extensions` | Migrate legacy `$extensions` syntax |
| `wave token show` | Browse built-in resources |
| `wave token update [name]` | Update the resource cache |
| `wave token status` | Show resource cache status |

The bare `wave token` command equals `wave token build`. `migrate` has no default migration target; `extensions` must be written explicitly.

## Asset toolchain

```bash
wave compress doctor
wave compress install --check
wave motion doctor -f ./frames
wave motion install --check
```

`--check` only shows the install plan. Add `--yes` only after confirming.

## Global commands

| Command | Purpose |
| --- | --- |
| `wave doctor` | Check the local runtime and toolchain |
| `wave install` | Review or run recommended tool installation |
| `wave workspace` | Create a design project workspace |
| `wave manual` | Launch the visual web manual |
| `wave version` | Show the version |

## Get the manual

`--help` gives concise help. `-m, --manual` prints structured Markdown for the current command scope, suited for agents:

```bash
wave -m
wave token -m
wave token new -m
wave token new night -m
wave token migrate extensions -m
```

Documentation mode runs no builds, creation, compression, or encoding, and never starts a web server.
