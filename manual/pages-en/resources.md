---
title: Built-in resources
description: Browse, update, and inspect Wave's design-token reference resources.
category: Design Token
commands:
  - wave token show
  - wave token update
  - wave token status
appliesTo:
  - Local CLI
---

## Browse resources

```bash
wave token show
wave token show palette
wave token show dimension
wave token show tailwindcss
wave token show leonardo --format yaml
wave token show wave --format json
```

| `--format` | Output |
| --- | --- |
| `flat-json` | Flat key-value, the default |
| `json` | Nested JSON |
| `yaml` | Raw YAML |

Resources only participate in reference resolution; they do not directly determine output content.

## Update the cache

```bash
wave token update
wave token update tailwindcss
wave token update tailwindcss --version 4
wave token update leonardo
```

Without a name, updates all supported resources.

## Show status

```bash
wave token status
```

Status includes cache, state, and config paths, plus the Tailwind CSS and Leonardo cache state.

## Common resources

| Resource | Purpose |
| --- | --- |
| `tailwindcss` | Tailwind palette |
| `leonardo` | Leonardo light/dark palettes |
| `wave` | Wave's built-in dimension system |
