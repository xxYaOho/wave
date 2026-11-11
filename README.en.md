# Wave

English | [简体中文](./README.md)

Wave is a local design delivery CLI for UI/UX designers. It puts design token generation, asset compression, PNG frame motion generation, project workspace creation, and local toolchain diagnostics behind a single entry point.

```bash
wave <command> [options]
```

## Manual

Everyday usage is maintained in the local manual:

```bash
wave manual
```

In the development environment, run:

```bash
pnpm dev -- manual
```

The manual content sources live in [manual/](./manual). The README stays a project entry point and does not duplicate per-command usage details.

## Capabilities

| Capability | Command |
| --- | --- |
| Design Token | `wave token` |
| Asset compression | `wave compress` |
| Motion generation | `wave motion --format gif` / `wave motion --format apng` |
| Workspace creation | `wave workspace` |
| Toolchain check and install | `wave doctor` / `wave install` |

`wave token` builds the current directory's `main.yaml` by default. Use `wave token --help` to see the creation, check, identity, migration, and resource commands.

Every command level supports `-m, --manual`, printing a scoped Markdown manual for agents. For example, `wave token new night -m` prints only the Night creation contract.

The current version keeps no `dt`, `design-token`, `mg`, or legacy positional entry points.

## Development

This repo uses mise for the runtime environment and pnpm for dependencies.

```bash
mise install
pnpm install
pnpm dev -- --help
```

Common verification commands:

```bash
pnpm check:ci
pnpm typecheck
pnpm test
pnpm bench:smoke
pnpm build
pnpm check:style
```

`pnpm check:ci` is the full delivery check, aggregating typecheck, tests, build, and Biome checks. `pnpm check:style` runs only Biome format, import order, and lint rules.
`pnpm bench:smoke` is the maintainer-facing Quality Harness quick check, confirming design-token benchmark orchestration and real outputs stay equivalent. Details: [benchmarks/README.md](./benchmarks/README.md).

## Project structure

```text
src/
  cli/          CLI command entry points
  core/         pipeline, generator, compress, motion, workspace, and other core logic
  resources/    built-in resources
manual/         content source of wave manual
docs/           behavior snapshots, change records, and refactor notes
benchmarks/     Quality Harness maintainer metrics tools
tests/          bun:test tests
```

## Docs

- `wave manual`: the user manual.
- [docs/SPEC.md](./docs/SPEC.md): current behavior snapshot; read it before implementing or reviewing.
- [benchmarks/README.md](./benchmarks/README.md): Quality Harness notes; read it before quality work.
- [CHANGELOG.md](./CHANGELOG.md): current change records.
- [docs/CHANGELOG.md](./docs/CHANGELOG.md): history up to v0.15.0.
- [docs/SWISS_KNIFE_REFACTOR.md](./docs/SWISS_KNIFE_REFACTOR.md): the Swiss-knife refactor roadmap.

The single source of truth for the version is [package.json](./package.json).
