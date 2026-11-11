---
title: Installation and toolchain
description: Install development dependencies, and check or install the local tools Wave needs.
category: Getting started
commands:
  - wave doctor
  - wave install --check
  - wave install --help
appliesTo:
  - Local CLI
---

## Purpose

Wave itself runs on Bun, project dependencies are managed with pnpm, and the local toolchain comes from mise and system tools. Wave does not bundle image compression or motion encoding tools into the CLI.

## Development environment

```bash
mise install
pnpm install
pnpm dev -- --version
```

## Check the environment

```bash
wave doctor
wave doctor --status
wave doctor --json
```

`doctor` checks the Wave runtime environment and recommended tools. Module commands also provide standalone checks:

```bash
wave compress doctor
wave motion doctor
```

## Review the install plan

```bash
wave install --check
wave compress install --check
wave motion install --check
```

## Run the installation

After confirming the install plan, add `--yes` to the matching install command to run the installation. Install commands invoke the project's mise tasks. When mise is missing, Wave tells you to install mise first.

## Tool groups

| Module | Local tools |
| --- | --- |
| compress | `oxipng`, `pngquant`, `svgo`, `gifsicle`, `jpegtran` or `mozjpeg` |
| motion | `gifski`, `apngasm` |
