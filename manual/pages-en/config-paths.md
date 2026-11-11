---
title: Configuration paths
description: Locate Wave's workspace configuration, resource cache, and default output locations.
category: Reference
commands:
  - wave token status
  - wave workspace --help
appliesTo:
  - Local CLI
---

## Workspace configuration

```text
~/.config/wave/workspace.yaml
```

Override the path:

```bash
WAVE_WORKSPACE_CONFIG=/path/to/workspace.yaml wave workspace
```

## Resource cache

```bash
wave token status
```

Output includes cache, state, and config paths, plus the Tailwind CSS and Leonardo cache state.

## Token output

Configured in `main.yaml`:

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, css]
```

Command-line override of the output directory for one run:

```bash
wave token build -f ./main.yaml --output ./dist
```

The platform list is maintained only in `$config`; there is no CLI `--platform`.

## Profile and Night output

Default locations:

```text
profiles/<name>.yaml
<Day directory>/<stem>@night.yaml
```

Both accept `--output` for a custom file. Custom locations do not widen implicit discovery; see the corresponding creation manuals for how they are consumed later.

## Compress output

```text
<input>/wave-compress/
```

Override the output directory:

```bash
wave compress -f ./assets --output ./optimized --yes
```

## Motion output

```text
<frames>/wave-mg/<frames-name>@<fps>fps.gif
<frames>/wave-mg/<frames-name>@<fps>fps.png
```

Use `--output` to specify the complete output file path.
