# Wave DT Research Handoff

Date: 2026-07-09
Status: implementation handoff for `refactor-dt` worktree

## Read First

Start from these files:

- `docs/superpowers/plans/2026-07-09-wave-dt-profile-model.md`
- `docs/research/wave-dt-profile-model.md`
- `docs/research/wave-token-helper-private.md`

The implementation worktree is:

```text
/Users/teatao/.worktree/cli_wave/refactor-dt
```

Do not treat older research notes as implemented behavior. The approved plan is the execution source for this iteration.

## Current Decision Summary

- Keep `main.yaml`; do not rename it to `default.yaml`.
- Remove new user-facing `variant` behavior: no `--variant`, no `--variants`, no `variants/` auto-discovery, and no old variant output path compatibility.
- Add explicit profile selection:
  - default build: `main.yaml` only;
  - `--profile <name>`: one named profile;
  - `--profiles all`: `main.yaml` plus named profiles.
- Profiles live at `profiles/<name>.yaml`; nested profile directories are invalid.
- Night Mode files are `main@night.yaml` and `profiles/<name>@night.yaml`; they are overlays, not profiles.
- Missing or invalid Night Mode never fails the day build, including explicit `--night`; emit `Night Mode unavailable/invalid and skipped` and skip night output.
- `theme.dimension` stops emitting in CSS and Sketch. Build emits one migration warning; doctor owns detailed migration guidance.
- CSS emits public roots `color`, `state`, `shadow`, `gradient`, `border`, `radius`, and `font`.
- CSS length-like output adds browser-required units.
- CSS typography emits field variables and one shorthand variable.
- CSS outline emits outline value plus offset companion; no split color/width/style fields.
- Sketch outline uses two shadow layers in final Sketch JSON order: ring first, gap second. Gap color is fixed to `#ffffff`.
- Sketch typography outputs text shared style payload only. Wave does not control whether color or alignment follows shared style.
- Sketch text shared style output does not control whether color or alignment follows shared style.
- `$helper` remains documentation-only in this iteration.

## Legacy Themefile Boundary

The approved plan keeps one compatibility guard for existing `themefile + main.yaml` projects:

- if `main.yaml` has `$config`, local `$config` is the source of truth;
- if `main.yaml` has no `$config`, the loaded legacy `themefile` config may still provide `THEME`, resources, parameters, and groups while token content comes from `main.yaml`.

This is transitional compatibility, not a renewed product direction. Current usage has largely moved away from legacy `themefile`; the historical debt should be intentionally retired after this wave.

Follow-up deprecation direction:

- keep compatibility only where it prevents existing tests or examples from breaking during the profile refactor;
- do not add new user-facing capability that depends on legacy `themefile`;
- after the profile model lands, add a separate deprecation/removal plan for legacy `themefile` entry behavior;
- prefer doctor or migration guidance for remaining users rather than expanding compatibility code.

## Execution Discipline

Use Subagent-Driven execution.

- Work in `/Users/teatao/.worktree/cli_wave/refactor-dt`.
- Execute the approved plan task by task.
- After each implementation node, run `critic-gate` read-only review.
- Iterate each node until `critic-gate` returns approval.
- Keep commits atomic and aligned to plan tasks.
