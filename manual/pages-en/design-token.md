---
title: Design token overview
description: Use the token module to build outputs, create source documents, check quality, and maintain resources.
category: Design Token
commands:
  - wave token
  - wave token build
appliesTo:
  - Local CLI
---

## Default build

From a directory containing `main.yaml`, run:

```bash
wave token
```

It is equivalent to:

```bash
wave token build
```

Output platforms are decided by `$config.parameter.platform` or parameter groups in `main.yaml`. The CLI no longer provides `--platform`; change the configuration to adjust platforms.

```yaml
$config:
  theme: example
  parameter:
    outputDir: ./dist
    platform: [json, css]
```

## Command groups

| Group | Commands |
| --- | --- |
| Build | `build` |
| Create | `new`, `new profile`, `new night` |
| Check | `doctor`, `wcag` |
| Identity | `ids` |
| Migrate | `migrate extensions` |
| Resources | `show`, `update`, `status` |

Use `-m` to get the full Markdown manual at any level:

```bash
wave token -m
wave token new -m
wave token new night -m
```

## Source document input

`-f, --file` selects the source document for the operation:

```bash
wave token build
wave token build -f ./themes/acme
wave token build -f ./themes/acme/main.yaml
wave token build -f ./themes/acme/themes/mobile.yaml
```

Rules:

- Omitting `-f`: reads `./main.yaml`.
- A directory input: reads the `main.yaml` inside it.
- A `main.yaml` input: processes the default profile.
- Any other Day YAML input: processes that profile and locates the base `main.yaml` from the nearest ancestor directory.
- An `@night.yaml` input: rejected. Night is not a Day source document.

Directories may be named `profiles`, `themes`, `variants`, or anything else. Explicit `-f` does not depend on directory names.

## Build scope

```bash
# Build main only
wave token build -f ./themes/acme

# Build one named profile only
wave token build -f ./themes/acme/themes/mobile.yaml

# Build main and all named profiles via the workspace discovery rules
wave token build -f ./themes/acme --profiles all

# Consume the Night overlay at its conventional location at the same time
wave token build -f ./themes/acme/themes/mobile.yaml --night
```

`--profiles all` only works with a main file or directory; it cannot combine with a single profile file. It does not recursively guess YAML in every directory.

## Output

All token build outputs accept `-o, --output` to override the configured output directory:

```bash
wave token build -f ./main.yaml --output ./dist
```

Output path collisions fail before writing. See the respective manuals for creation rules of source documents such as profiles and Night.

## Check and maintain

```bash
wave token doctor -f ./main.yaml
wave token wcag -f ./main.yaml
wave token ids -f ./main.yaml
wave token migrate extensions -f ./main.yaml
```

`doctor` does not run WCAG. `ids` and `migrate extensions` report only by default; add `--write` to modify source files.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `main.yaml` | Base token tree, default profile, and `$config` |
| Day profile YAML | Overrides base values by token ID or adds tokens |
| `<stem>@night.yaml` | Night path overrides for a Day document |
| `$config.resource` | Provides reference data; does not directly drive output |

See the corresponding command manuals for profile and Night creation, consumption, and custom output rules. Token syntax: [main.yaml syntax](/design-token/main-yaml).
