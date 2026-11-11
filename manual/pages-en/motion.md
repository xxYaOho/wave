---
title: Motion generation
description: Generate GIF or APNG from a directory of PNG frames, controlling format, output, and overwriting.
category: Assets
commands:
  - wave motion
  - wave motion doctor
  - wave motion install
appliesTo:
  - Local CLI
---

## Generate motion

```bash
wave motion -f ./frames --format gif
wave motion -f ./frames --format apng
```

The input directory needs at least two PNG frames. Non-interactive environments must pass `--format gif|apng` explicitly; in a TTY, omitting the format opens an interactive choice.

## Output

```bash
wave motion -f ./frames --format gif --output ./loading.gif
wave motion -f ./frames --format apng --output ./loading.png
```

By default, output goes to `wave-mg/` under the frames directory; the file name contains the frames directory name and the FPS. Existing output is rejected by default; confirm first, then use `--force`.

Preview the plan only:

```bash
wave motion -f ./frames --format gif --dry-run
```

## Encoding parameters

```bash
wave motion -f ./frames --format gif --fps 24 --quality 80 --loop forever
```

| Parameter | Default |
| --- | --- |
| `--fps <n>` | 24 |
| `-q, --quality <n>` | 80 |
| `--loop <mode>` | `forever`; also supports `once` |

The command never modifies the source frames.

## Toolchain and frame checks

```bash
wave motion doctor
wave motion doctor -f ./frames
wave motion install --check
wave motion install --yes
```

`motion doctor` accepts an optional `-f` PNG frames directory to check the frame input at the same time.
