---
title: Quick start
description: From local environment checks to your first Wave design delivery task.
category: Getting started
commands:
  - wave --help
  - wave token --help
appliesTo:
  - Local CLI
---

## Prepare the environment

The repo development environment uses mise and pnpm:

```bash
mise install
pnpm install
pnpm dev -- --help
```

During development, use `pnpm dev --` instead of the installed `wave`.

## Pick a task

### Build design tokens

```bash
wave token new
wave token
```

For an existing project, point at the source document directly:

```bash
wave token build -f ./main.yaml
```

### Compress assets

```bash
wave compress -f ./assets --dry-run
```

### Generate motion

```bash
wave motion -f ./frames --format gif --dry-run
wave motion -f ./frames --format apng --dry-run
```

### Create a workspace

```bash
wave workspace --dry-run
```

## Check the environment

```bash
wave doctor --status
```

Module toolchains are checked separately with `wave compress doctor` and `wave motion doctor`.

## Get the manual

```bash
wave --help
wave token --help
wave token new night -m
wave manual
```

`--help` shows concise help; `-m` prints the Markdown manual for the current scope; `wave manual` launches the visual web manual.
