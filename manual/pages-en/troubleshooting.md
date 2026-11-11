---
title: Troubleshooting
description: Use the right check entry points to locate environment, source document, write, and toolchain issues.
category: Reference
commands:
  - wave doctor
  - wave token doctor
  - wave token wcag
  - wave compress doctor
  - wave motion doctor
appliesTo:
  - Local CLI
---

## Where to start

```bash
wave --help
wave -m
wave doctor --status
```

`--help` shows concise command help, `-m` prints the Markdown manual for the current scope, and `doctor` checks the local toolchain.

## main.yaml not found

`wave token` reads the current directory's `main.yaml` by default. For a new project, run first:

```bash
wave token new
wave token
```

For an existing project, use `-f`:

```bash
wave token build -f /path/to/main.yaml
wave token build -f /path/to/workspace-directory
```

## main.yaml missing $config

The entry document must contain a valid `$config`:

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, css]
```

Use `wave token doctor -f ./main.yaml` to check structure and resources.

## Profile fails to build

```bash
wave token doctor -f /path/to/profile.yaml
wave token ids -f /path/to/main.yaml
```

Check:

- The profile sits in the base main's directory or a subdirectory of it.
- `$config.base` equals the main's original root `$id`.
- `$override` uses registered token `$id`s.
- New token types can be determined from the profile itself.

To create a profile, register the base first, then run `wave token new profile <name> -f ./main.yaml`.

## Night is not built

Confirm the overlay sits next to the Day source document and is named `<stem>@night.yaml`. Then select the original Day source explicitly:

```bash
wave token build -f /path/to/day-or-profile.yaml --night
```

Custom `--output` locations are not auto-discovered. Profile Night cannot be consumed by building main alone.

## Output already exists

New source documents and motion output never overwrite existing targets by default. Preview the plan with `--dry-run` first, then add `--force` after confirming the overwrite:

```bash
wave token new night -f ./main.yaml --force
wave motion -f ./frames --format gif --force
```

`--yes` only skips the confirmation; it does not grant overwrite permission.

## Missing tools

```bash
wave compress doctor
wave compress install --check
wave motion doctor
wave motion install --check
```

Run the matching `install --yes` only after confirming the install plan.

## Command does not exist

The only token entry today is `wave token`; motion has no `mg`. Common migrations:

| Old form | Current form |
| --- | --- |
| `wave dt build` | `wave token build` |
| `wave dt init` | `wave token new` |
| `wave night` | `wave token new night` |
| `wave compress run` | `wave compress` |
| `wave motion gif` | `wave motion --format gif` |
| `wave workspace create` | `wave workspace` |
| `--out` | `--output` |
