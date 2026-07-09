# Wave Token Helper Notes

Date: 2026-07-08
Status: research note
Audience: Wave maintainers and implementation agents

## Background

During the CSS dimension output discussion, we considered whether Wave needs a helper token concept. The trigger was the real orca token file at `/Users/teatao/Projects/my-color/orca/main.yaml`, where several values are useful for authoring and reference resolution but are not clearly product-facing API.

This note records the idea only. It is not an implementation plan.

## Current Assessment

Wave can use a top-level `$helper` section as an authoring note for source-like values that should not become public `theme` API.

This is not a parser, resolver, or exporter feature yet. Current Wave does not provide a `$helper` reference namespace, and top-level `$key` helper roots are not transformed into output tokens. Treat `$helper` as documentation and future design direction, not as implemented token behavior.

Preferred shape:

```yaml
$helper:
  color:
    black:
      point:
        $type: color
        $description: Color-space black point used for calibration.
        $value: "#000000"
    white:
      point:
        $type: color
        $description: Color-space white point used for calibration.
        $value: "#ffffff"
    current:
      point:
        $type: color
        $description: Mode-aware current point used by authoring shortcuts.
        $value: "#ffffff"
```

Do not use `$extensions.wave.private` for this current design. The active problem is taxonomy clarity, not per-token export hiding.

## Candidate Use Cases

Helper values are useful only for values that must be explained but should not become CSS, Sketch, or JSON public API. In the current codebase, they must not be used as references.

Current real-source candidates:

- `$helper.color.black.point` and `$helper.color.white.point`: color-space calibration points used by containers, scrim, gradients, and profiles. These are better treated as source calibration values than public product tokens.
- `$helper.color.current.point`: a mode-aware authoring shortcut for the current color-space point. The current orca files define it under `theme.color.current.point`, but it is not yet widely consumed.
- Temporary debug or experiment notes such as `$helper.debug.placeholder: "#ff00ff"` when they are used to document exporter experiments.

Current non-candidates:

- `theme.color.transparent`: useful public token; keep output.
- `theme.color.shadow`: semantic shadow color; may be consumed directly and should remain public.
- Shadow, gradient, radius, interaction, and similar public map tokens. These are consumer-facing design decisions, not helpers.

## Boundary

Executable helper values, if implemented later, should follow these rules:

- They require an explicit parser and resolver contract before public `theme` tokens can reference them.
- They require explicit night and profile merge rules before they can be overridden by mode or profile files.
- They default to no output in CSS, Sketch, JSON, and JSONC.
- They must not replace proper public taxonomy. If a token is meaningful to product users, it should remain public.
- They should use DTCG-compatible token shape.
- They should stay outside `theme` unless Wave intentionally promotes them to public API.

## Why Not Now

The current problem is not the absence of a private export flag. The current problem is that `theme.dimension` mixes several public concepts: interaction opacity, radius, shadow, and gradient masks. That should be addressed first by clarifying the `theme` public API taxonomy.

Adding a real helper parser now would risk hiding a taxonomy problem behind new syntax. Keep `$helper` as a documented authoring convention until repeated real files need it as executable behavior.

## Revisit Conditions

Revisit executable helper support when at least one condition is true:

- Multiple real token files contain values that are referenced internally but should not be exported.
- Night or profile files repeatedly override authoring shortcuts that are not product API.
- Moving calibration values into custom resources creates too much friction for normal authoring.
- Exporters need a consistent way to exclude known internal values without path-specific filters.
