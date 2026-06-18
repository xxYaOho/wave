# Sketch Extensions PRD

## 1. Executive Summary

**Problem Statement:** Wave 的 Sketch 输出规则分散在 `$extensions.sketchMap`、`inheritColor.siblingSlot`、`composite`、token path 推导和 `sketch.ts` formatter 内。当前结构能工作，但难以表达 Sketch 的真实管理路径，也会让后续 component、shared style、swatch color 规则继续散落。

**Proposed Solution:** 新增系统化的 `$extensions.sketch` 命名空间，先覆盖 Sketch 命名路径和现有 `sketchMap` 等价属性映射；同时新增 Sketch extension 归一化层，让 schema、resolver、transformer 和 Sketch formatter 通过稳定内部结构协作。新增 `docs/design-token.md` 作为 design-token 专题手册，并让 `MANUAL.md` 链接过去。

**Success Criteria:**

- `main.yaml` 可以通过 `$extensions.sketch.path` 为 Sketch swatch color 或 shared style 输出指定 `a/b/c/name` 管理路径。
- `sketch.path` 明确作为 Sketch JSON 对象 key 使用，不新增 `name` 字段。
- `$ref` 推导出的 swatch 引用会跟随被引用 token 的 `sketch.path`，避免 component 引用旧路径。
- `filterLayer` 继续影响 JSON/CSS 等通用 key 输出；Sketch formatter 当前不读取 `filterLayer`，本功能不得把 `filterLayer` 引入 Sketch 显式路径。
- `$extensions.sketch.property` 能覆盖现有 `sketchMap` 使用场景，并保留 `sketchMap` 兼容；第一版只支持白名单字段，不提供任意 Sketch JSON patch。
- Sketch property 映射必须做简单类型和值形状校验，不能把 color token 输出为 `opacity`，也不能把 number token 输出为 swatch color。
- `$extends` 继承时，只有父子 `$extensions.sketch` 需要按字段深度合并；其他同名 extension 保持现有覆盖语义。
- 新增或更新测试覆盖 schema 校验、transformer 归一化、Sketch formatter 输出、legacy 兼容和文档链接。

## 2. User Experience & Functionality

### User Personas

- **UI/UX Designer:** 使用 Sketch 管理 color variable、shared style 和 token 文件，需要输出名称符合设计系统分组，而不是受通用 flat key 规则限制。
- **Design System Maintainer:** 维护 `main.yaml`、resource 和多平台输出，需要 Sketch 特例可读、可迁移、可测试。
- **Wave Maintainer:** 后续会迭代 component、swatch、shared style 规则，需要 Sketch 平台逻辑集中在明确模块中。

### User Stories

**Story 1:** As a designer, I want to set a Sketch output path per token so that Sketch variables and styles appear under the grouping I use in Sketch.

Acceptance criteria:

- A token can declare `$extensions.sketch.path: "a/b/c/name"`.
- Sketch output uses `a/b/c/name` as the JSON key for supported color, style, and dimension entries.
- Sketch output does not add a separate `name` field for `sketch.path`.
- `filterLayer` does not alter an explicit `sketch.path`; JSON/CSS keep their current `filterLayer` behavior.
- Empty path strings and non-string path values fail schema validation.

**Story 2:** As a maintainer, I want Sketch-specific properties in one namespace so that token semantics and Sketch output details stay separate.

Acceptance criteria:

- A token can declare `$extensions.sketch.property` as an object.
- The first implementation supports only `opacity: true` and `cornerRadius: true` for dimension/number tokens.
- `opacity: true` emits `{ opacity: value }`.
- `cornerRadius: true` emits `{ cornerRadius: value }`.
- `false` values fail schema validation.
- `opacity` is valid only on `number` or `dimension` tokens whose resolved value is numeric.
- `cornerRadius` is valid only on `number` or `dimension` tokens whose resolved value is numeric or a parseable px dimension.
- `number` tokens with `sketch.property` are MVP-supported only when they live under `theme.dimension.*` or an equivalent dimension root that the Sketch formatter emits into the `dimension` group.
- A color token using `property.opacity` or `property.cornerRadius` fails validation.
- Legacy `$extensions.sketchMap` still works.
- If both `sketch.property` and `sketchMap` exist, `sketch.property` wins and `sketchMap` remains a compatibility fallback.

**Story 3:** As a maintainer, I want inherited Sketch extensions to merge predictably so that base groups can define Sketch defaults and child groups can override only one field.

Acceptance criteria:

- `$extends` merges `$extensions.sketch` by nested object keys.
- Child `sketch.path` overrides parent `sketch.path`.
- Child `sketch.property` overrides only matching property keys and preserves other parent property keys.
- Existing same-name extension override behavior for non-Sketch extensions remains compatible.
- Regression tests prove existing `smoothShadow`, `smoothGradient`, `inheritColor`, and `composite` inheritance semantics do not change.

**Story 4:** As a Wave user, I want a dedicated design-token manual so that advanced token and Sketch rules are documented without turning `MANUAL.md` into an unreadable long page.

Acceptance criteria:

- `docs/design-token.md` documents current design-token usage and the new `$extensions.sketch` model.
- `MANUAL.md` keeps a concise Design Token section and links to `docs/design-token.md`.
- `docs/design-token.md` is the design-token user guide and must not duplicate install, compress, motion, or workspace instructions.
- `MANUAL.md` remains the top-level usage entry and command overview.
- `docs/SPEC.md` remains an internal behavior snapshot, not the primary user manual.

### Non-Goals

- Redesigning component token semantics.
- Adding `inheritFrom` for component color inheritance.
- Implementing automatic swatch binding strategy such as `swatch: auto`.
- Changing Sketch import/plugin behavior.
- Changing JSON, JSONC, or CSS output key behavior except where legacy `sketchMap` compatibility requires transformer cleanup.
- Replacing `filterLayer`; it remains the generic output key control.

## 3. AI System Requirements

This feature has no AI runtime requirement.

### Tool Requirements

- Local repo inspection with `rg`, `pnpm`, and Bun test runner.
- Existing test framework under `tests/`.

### Evaluation Strategy

- Use unit tests for schema, `$extends` merge, transformer metadata, and Sketch formatter output.
- Use at least one fixture-style smoke test that mirrors `/Users/teatao/Projects/my-color/orca/main.yaml` shape: `$config.parameterGroup.sketch.filterLayer: 1`, token-level `$extensions.sketch.path`, and dimension-level property mapping.
- In that fixture, assert that Sketch JSON uses `sketch.path` as object keys while JSON/CSS output continues to use current filter-layer behavior.
- If a Sketch MCP tool is available in the implementation session, inspect a real Sketch document or fixture to confirm slash-delimited swatch/shared style naming before finalizing formatter behavior. If Sketch MCP is not available, record that limitation in the implementation report and rely on the explicit JSON contract in this PRD.
- Cross-check documentation against actual CLI surface and implementation behavior.

## 4. Technical Specifications

### Architecture Overview

The feature should introduce a Sketch extension normalization layer between raw `$extensions` and platform output.

```text
main.yaml
  -> parseThemeYaml()
  -> validateThemeSchema()
  -> expandExtends()
  -> resolveReferences()
  -> transformToWaveTokens()
       -> parseSketchExtension()
       -> WaveToken._sketch
  -> sketchFormat()
       -> uses _sketch.path and _sketch.property
```

The YAML parser should stay thin. It should continue to parse YAML into a raw object and should not learn Sketch semantics.

### Data Model

Add an internal Sketch metadata shape:

```ts
interface SketchExtension {
  path?: string;
  property?: SketchPropertyMap;
}

interface SketchPropertyMap {
  opacity?: true;
  cornerRadius?: true;
}
```

Add an optional field to `WaveToken`:

```ts
_sketch?: SketchExtension;
```

Legacy `_sketchMap?: string` may remain during compatibility. New code should prefer `_sketch.property`.

### `$extensions.sketch`

Supported first-version fields:

```yaml
$extensions:
  sketch:
    path: "foundation/color/text/default"
    property:
      opacity: true
```

Field rules:

- `path` must be a non-empty string.
- `path` uses Sketch slash grouping syntax: `group/subgroup/name`.
- `property` must be an object when present.
- First-version `property` supports only `opacity: true` and `cornerRadius: true`.
- `property` is valid only on dimension or number tokens in the first version.
- `property.opacity: true` must emit the same Sketch dimension object shape as legacy `sketchMap: opacity`.
- `property.cornerRadius: true` emits `{ cornerRadius: value }`.
- `false`, string, number, array, and object values under `property.opacity` or `property.cornerRadius` fail schema validation.
- Unknown `property` keys fail schema validation.
- Explicit `$type` mismatches fail schema validation when the source token declares `$type`.
- Resolved value mismatches fail during Sketch extension normalization or before Sketch formatting.

Type and value rules:

| Sketch mapping | Allowed `$type` | Resolved `$value` requirement | Invalid example |
| --- | --- | --- | --- |
| `sketch.property.opacity: true` | `number`, `dimension` | number after resolution | `$type: color`, `$value: "#000000"` |
| `sketch.property.cornerRadius: true` | `number`, `dimension` | number or parseable px dimension after resolution | `$type: color`, `$value: "#000000"` |
| `color` group output | `color` or inherited `color` | color string or resolved color object accepted by current color pipeline | `$type: number`, `$value: 0.16` |
| `style.interaction.*` output | `color` or inherited `color` | shapes accepted by current `resolveSketchColor`, including inheritColor metadata and `{ _color, opacity }` object values | `$type: number`, `$value: 0.16` |
| `style.shadow*` output | `shadow` or inherited `shadow` | shadow object or array accepted by current shadow pipeline | `$type: color`, `$value: "#000000"` |
| `style.gradient*` output | `gradient` or inherited `gradient` | gradient stop object or array accepted by current gradient pipeline | `$type: number`, `$value: 1` |

Example invalid token:

```yaml
theme:
  dimension:
    interaction:
      hover:
        $type: color
        $value: "#000000"
        $extensions:
          sketch:
            path: "foundation/interaction/hover"
            property:
              opacity: true
```

Expected failure:

```text
theme.dimension.interaction.hover.$extensions.sketch.property.opacity:
opacity requires $type "number" or "dimension", got "color".
```

### Sketch JSON Output Contract

`sketch.path` replaces the emitted object key inside the current Sketch output group. It does not add a separate `name` field.

Supported first-version groups:

| Token shape | Current default key | With `sketch.path` | Output group |
| --- | --- | --- | --- |
| `theme.color.*` | sub-path joined with `-` | `sketch.path` | `color` |
| `theme.style.interaction.*` | sub-path joined with `-` | `sketch.path` | `style` |
| `theme.style.shadow*` | sub-path joined with `-` | `sketch.path` | `style` |
| `theme.style.gradient*` | sub-path joined with `-` | `sketch.path` | `style` |
| `theme.dimension.*` | sub-path joined with `-` | `sketch.path` | `dimension` |
| `_composite` component tokens | composite path joined with `-` | not changed in MVP | `component` |

Color example:

```yaml
theme:
  color:
    text:
      default:
        $type: color
        $value: "#0f172a"
        $extensions:
          sketch:
            path: "foundation/color/text/default"
```

Expected Sketch JSON:

```json
{
  "color": {
    "foundation/color/text/default": "#0f172aff"
  }
}
```

Dimension example:

```yaml
theme:
  dimension:
    interaction:
      hover:
        $type: number
        $value: 0.16
        $extensions:
          sketch:
            path: "foundation/interaction/hover"
            property:
              opacity: true
```

Expected Sketch JSON:

```json
{
  "dimension": {
    "foundation/interaction/hover": {
      "opacity": 0.16
    }
  }
}
```

Shadow example:

```yaml
theme:
  style:
    shadow:
      1:
        $type: shadow
        $value:
          - color: "#00000033"
            offsetX: 0
            offsetY: 4
            blur: 8
            spread: -2
        $extensions:
          sketch:
            path: "foundation/elevation/1"
```

Expected Sketch JSON:

```json
{
  "style": {
    "foundation/elevation/1": {
      "shadow": [
        {
          "x": 0,
          "y": 4,
          "blur": 8,
          "spread": -2,
          "color": "#00000033"
        }
      ]
    }
  }
}
```

Component support remains compatibility-first. MVP does not use `sketch.path` to rename component object keys. Component support is limited to preserving existing `composite` behavior and keeping swatch references aligned when component fills or borders reference color tokens that define `sketch.path`.

### Legacy Compatibility

Legacy:

```yaml
$extensions:
  sketchMap: opacity
```

Normalized:

```ts
_sketch: {
  property: { opacity: true }
}
```

If both forms exist:

```yaml
$extensions:
  sketchMap: opacity
  sketch:
    property:
      cornerRadius: true
```

The normalized output should use `sketch.property` as the stronger signal. `sketchMap` should not overwrite explicit `sketch.property`.

Legacy `sketchMap` compatibility mapping:

| Legacy value | Normalized first-version property |
| --- | --- |
| `opacity` | `{ opacity: true }` |
| `cornerRadius` | `{ cornerRadius: true }` |
| any other string | Preserve legacy `_sketchMap` fallback; do not invent new `sketch.property` behavior |

### Swatch Reference Synchronization

Current Sketch output can carry swatch links in multiple places. `sketch.path` must update every existing `_swatchName` carrier, not only top-level color tokens.

Rules:

- If a referenced color token has `_sketch.path`, every derived `_swatchName` uses that path.
- If a referenced color token has no `_sketch.path`, every derived `_swatchName` keeps the current path-derived behavior.
- The synchronization applies to all current swatch carriers: token-level `_swatchName`, component fill/border `swatch`, `inheritColor` sibling propagation, and nested component shadow color objects shaped like `{ color, _swatchName }`.
- If an `inheritColor` token resolves color through `siblingSlot`, the propagated swatch name uses the sibling token's effective Sketch path.
- Existing tests that expect legacy swatch names continue to pass when no `sketch.path` is present.
- This PRD does not add a user-facing `swatch` field; it only keeps existing swatch references aligned with explicit Sketch paths.

### `$extends` Merge

Current `$extensions` inheritance already merges by extension key. The gap is narrower: when the same object-valued extension appears in both parent and child, nested fields are overwritten as a whole. MVP changes nested merge only for `$extensions.sketch`; same-name non-Sketch extensions keep their existing override behavior.

Expected behavior:

```yaml
base:
  $extensions:
    sketch:
      path: "foundation/color/base"
      property:
        opacity: true

child:
  $extends: "{base}"
  $extensions:
    sketch:
      property:
        cornerRadius: true
```

Resolved child:

```yaml
$extensions:
  sketch:
    path: "foundation/color/base"
    property:
      opacity: true
      cornerRadius: true
```

### Sketch Formatter Behavior

Name path priority:

1. `token._sketch.path`
2. Existing Sketch path derivation

Property mapping priority:

1. `token._sketch.property`
2. Legacy `_sketchMap`
3. Formatter default

First-version property behavior:

- For dimension/number tokens, `token._sketch.property.opacity === true` emits `{ opacity: value }`.
- For dimension/number tokens, `token._sketch.property.cornerRadius === true` emits `{ cornerRadius: value }`.
- `number` property mapping is valid only when the token path is emitted through the Sketch `dimension` group; other number-token paths are non-MVP and must fail validation or normalization.
- `false` values are invalid by schema; if encountered after compatibility handling, the formatter treats them as unsupported and keeps default output instead of spreading them into Sketch JSON.
- Unsupported property keys are schema errors. If an unsupported key reaches the formatter through legacy or malformed input, the formatter keeps current default output and must not spread it into Sketch JSON.
- `token._sketch.property` must not be treated as a blind object spread into Sketch JSON.
- Sketch output intent must validate both token type and resolved value shape before emitting path or property-specific output.

The formatter should remain responsible for Sketch JSON serialization. It should not parse raw `$extensions`.

### Documentation

Create `docs/design-token.md` with the full user-facing design-token guide. It owns design-token depth only; it must not copy full install, compress, motion, workspace, or doctor documentation.

Recommended sections:

- Core model
- Quick start
- `$config`
- Token syntax
- Output parameters
- Sketch output
- `$extensions`
- `$extensions.sketch`
- Resource management
- Migration notes

Update `MANUAL.md` to keep a concise Design Token section and link to `docs/design-token.md`.

## 5. Risks & Roadmap

### Phased Rollout

**MVP:**

- Add `$extensions.sketch.path`.
- Add `$extensions.sketch.property`.
- Add Sketch extension normalizer.
- Preserve `sketchMap`.
- Fix nested `$extensions.sketch` merge.
- Add user documentation.

**v1.1:**

- Revisit component token design.
- Decide whether `inheritFrom` belongs in `$extensions.sketch`.
- Decide whether `swatch` should control binding strategy.

**v2.0:**

- Consider a richer Sketch intermediate model for swatch color, shared style, text style, layer style, and component output if Sketch import requirements become stable.

### Technical Risks

- **Over-broad `property`:** A fully open property object may allow invalid Sketch JSON fields. Mitigation: validate a first-version whitelist and forbid blind object spreading in the formatter.
- **Type mismatch:** A token can declare a Sketch property that does not match its `$type` or resolved value shape. Mitigation: validate explicit `$type` in schema and validate resolved value shape before Sketch formatting.
- **Path ambiguity:** `path` could mean filesystem path. Mitigation: document it as Sketch name path and always use slash examples.
- **Merge regression:** Changing `$extensions` merge may affect non-Sketch extensions. Mitigation: add regression tests for existing smoothShadow, smoothGradient, inheritColor, and composite inheritance.
- **Swatch mismatch:** Explicit Sketch paths can desynchronize component `swatch` references, including nested shadow color swatches. Mitigation: derive effective swatch names from referenced tokens after Sketch extension normalization and cover every existing `_swatchName` carrier.
- **Formatter churn:** Moving logic too aggressively may break current Sketch output. Mitigation: keep formatter serialization stable and introduce `_sketch` as additive metadata first.
- **Documentation drift:** `MANUAL.md`, `docs/design-token.md`, and `docs/SPEC.md` may diverge. Mitigation: define ownership: `MANUAL.md` is overview, `docs/design-token.md` is the design-token user guide, `docs/SPEC.md` is internal snapshot.
