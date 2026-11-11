---
title: Asset compression
description: Compress PNG, JPG, SVG, and GIF assets, and control preview, output, and writing.
category: Assets
commands:
  - wave compress
  - wave compress doctor
  - wave compress install
appliesTo:
  - Local CLI
---

## Preview compression

```bash
wave compress -f ./assets --dry-run
```

The input can be a file or a directory; the default is the current directory. `--dry-run` shows the real compression results without writing files.

## Write output

```bash
wave compress -f ./assets --yes
wave compress -f ./assets --output ./optimized --yes
```

By default, output goes to `wave-compress/` under the input directory; source files are never overwritten. `--yes` only skips the confirmation; overwriting existing output still requires `--force`.

## Scope and quality

```bash
wave compress -f ./assets --type png --type jpg --recursive
wave compress -f ./assets --type png --quality 80
```

`--type` only accepts repeated flags, not comma-joined values. Supported types: `png`, `jpg`, `svg`, `gif`.

Without `--quality`, the default safe policy applies. Passing a value from 1–100 enables lossy quality mode.

## SVG icon cleanup

```bash
wave compress -f ./assets --type svg --icon --yes
```

`--icon` cleans SVG icon colors so they can be recolored through CSS.

## Toolchain

```bash
wave compress doctor
wave compress install --check
wave compress install --yes
```

Check the tools first, review the install plan, then confirm the installation.
