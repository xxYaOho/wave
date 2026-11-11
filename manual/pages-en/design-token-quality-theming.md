---
title: Profile and Night model
description: Understand identity, overrides, and directory relationships of base, Day profiles, and Night overlays.
category: Design Token
commands:
  - wave token
appliesTo:
  - Local CLI
---

## Base and profiles

`main.yaml` is the base and the project baseline. One base together with its Day profiles forms a series; different structures should use separate base workspaces.

A profile uses a closed `$config`:

```yaml
$id: dddddddddddddddddddddddddddddddd
$config:
  base: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
$override:
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:
    $value: "#1872f0"
theme:
  color:
    accent:
      $type: color
      $value: "#ff3366"
```

- `$config.base` must equal the main's registered root `$id` verbatim.
- `$override` keys are base token `$id`s, not token paths or document IDs.
- Each entry contains only `$value`; objects and arrays are replaced wholesale, with no sub-field merging.
- New tokens must not collide with existing paths; existing groups must not re-declare metadata.
- New token types must be determinable from the profile itself.
- A profile cannot delete base tokens, change existing types, or modify existing extensions.

Reference expressions survive profile merging until the reference resolution stage; they are not materialized in advance.

## Directories and base location

Explicit `-f` does not depend on fixed directory names:

```text
main.yaml
profiles/mobile.yaml
themes/mobile.yaml
variants/mobile.yaml
```

All of these Day profiles are valid. Wave walks up from the profile's directory to the nearest `main.yaml`, then verifies `$config.base`.

`--profiles all` still uses the existing workspace discovery rules and does not recursively guess YAML in arbitrary directories. The legacy variant model and `--variant` parameter are unsupported, but `variants/` works as an ordinary directory name.

## Night is a path override

Night is an override file for Day, not a profile, and does not use `$override`:

```yaml
theme:
  color:
    primary:
      $value: "#93c5fd"
```

Night only overrides leaves that Day already has under `theme.color` and `theme.state`; a root `$id` is forbidden, and Day document and token identity carry over.

Default file relationship:

```text
main.yaml                 → main@night.yaml
themes/mobile.yaml        → themes/mobile@night.yaml
variants/mobile.yaml      → variants/mobile@night.yaml
```

Select the original Day source document explicitly at build time:

```bash
wave token build -f ./main.yaml --night
wave token build -f ./themes/mobile.yaml --night
```

A missing or generally invalid overlay warns and is skipped; identity violations fail.

## Related tasks

- Create a profile: [Create a workspace and profiles](/design-token/create)
- Create an overlay: [Create a Night overlay](/design-token/night)
- Check structure: [Check a token workspace](/design-token/doctor)
- Check contrast: [Check WCAG contrast](/design-token/wcag)
- Maintain identity: [Maintain token identity](/design-token/ids)
