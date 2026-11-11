---
title: Workspace creation
description: Create design project directories from local configuration, controlling target location and existing content.
category: Workspace
commands:
  - wave workspace
appliesTo:
  - Local CLI
---

## Create a workspace

```bash
wave workspace
```

The command asks for project name, type, version, and tags per the configuration, then creates the directory structure and README. No `create` subcommand is needed.

Preview the plan only:

```bash
wave workspace --dry-run
```

Skip the write confirmation:

```bash
wave workspace --yes
```

## Target location

```bash
wave workspace --output ./my-project --yes
```

`--output` points at the final workspace directory, not a parent. The logical project name still comes from the interactive answers.

Existing targets are rejected by default. With `--force`, Wave only overwrites the README and placeholder files this run would generate, keeps other files in the directory, and never deletes content recursively. Plain files and symlinks as targets are still rejected.

## Configuration file

Default path:

```text
~/.config/wave/workspace.yaml
```

Use another configuration:

```bash
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```

When the file is missing, built-in defaults apply. `WAVE_WORKSPACE_CONFIG` affects workspace only, not the token resource cache.
