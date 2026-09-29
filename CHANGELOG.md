# wave

## 0.23.0

### Minor Changes

- fdc08b4: Add the `md-yml` design-token output platform for Markdown-friendly YAML token fragments. Theme-local direct references remain reusable after namespace projection, including references inherited through typography defaults; external and computed references remain materialized.

  When `--platform` is provided, Wave now creates one base-parameter pass per selected profile instead of expanding `parameterGroup`. Group-specific `filterLayer`, `colorSpace`, and `outputDir` values no longer apply to that CLI override; `--out` without `--platform` still expands all groups.

- 19f037a: 支持 DTCG 2025.10 全部标准 token 类型、typed reference 和 Wave dimension 简写；CSS 遇到未知自定义 object 或 array 时明确失败。
- Rework design-token profiles as identity-linked delta overrides over the base theme. A `profiles/<name>.yaml` now carries `$override` entries keyed by base token `$id` (value-only whole replacement), optional new tokens, its own document `$id`, and a required `$config.base` binding that is verified against the base document identity. Standalone full-document profiles are no longer supported.

  Sketch payloads gain `meta.baseId` alongside `themeId` (payload version stays 2; plugin consumers must tolerate the additive field). The `$extensions.typography` extension is flattened to six sibling fields (`baseFontSize`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`) and the nested `defaults:` form is rejected. A new `wave dt new-profile <name>` command snapshots all accounted base tokens into a ready-to-edit profile. `wave dt ids` maintains profile document identities and hard-blocks on base mismatches; `wave dt doctor` now checks profile health across the whole workspace (base binding, override targets, redundant overrides) with consistent text/JSON/status output.

  Night overlays, the main-only workspace entry contract, and the output platform set are unchanged. Migration of existing theme workspaces is manual: rewrite profiles as deltas, flatten typography extensions, and move per-profile tuning values into referenced tokens (e.g. `theme.font.base-size`).

- ba99038: Remove the trial-period Sketch swatch binding: layer color positions no longer emit `{ "$ref": "<uuid>" }` and always carry the concrete `#RRGGBBAA` HEX8 snapshot instead. The outline ring keeps its two-layer `shadows` shape (ring layer plus the fixed `#ffffffff` gap layer).

  The Sketch-only color-reference metadata, its alias index, and the "internal reference target is not emitted" build error are gone with it: a color token no longer needs a registered `$id`, and a `sketch.skip` or root-excluded target no longer fails an outline border build. This is a breaking output-contract change for Sketch consumers that relied on the binding; the HEX8 degradation path those consumers already had to accept is now the only form.

## 0.22.0

### Minor Changes

- 59146f3: Remove the deprecated `themefile` entry, direct RESOURCE generation, and top-level `create`/`init` commands. Use `main.yaml` and `wave dt init` for design-token workspaces.

## 0.21.0

### Minor Changes

- df9fda9: Allow self-contained design-token profiles to build without resource declarations, and move declaration-level resource validation from build to `wave dt doctor`.

## 0.20.0

### Minor Changes

- fc16e18: Replace Sketch color references with full output-path JSON Pointers and allow identical leaf keys under distinct Sketch paths. This is a breaking output-contract change: existing Sync Token versions cannot import the new references until their follow-up update.

## 0.19.0

### Minor Changes

- Redesign `wave manual` with a blueprint visual system: deep-sea blue palette, serif display type, hairline rules, and a Departure Mono / Maple Mono code font stack. Restructure the manual content by splitting the design-token reference into five focused pages and regrouping navigation into 开始 / Design Token / 素材 / 工作区 / 参考. Docs pages gain an On This Page outline and prev/next pager, and the home page becomes a hero plus full directory.

## 0.18.0

### Minor Changes

- Add rem typography dimensions with a configurable `theme.font.$extensions.typography.baseFontSize` for CSS and Sketch output.
- Round all final Sketch typography line heights up to whole pixels.

## 0.17.0

### Minor Changes

- Add Sketch color-token references for typography, borders, and outline rings while preserving literal color fallbacks.

## 0.16.0

### Minor Changes

- 950ab99: Add SVG icon compression support with `wave compress --icon` and optional `~/.config/wave/svgo.cjs` config loading.
- Refine the design-token profile model and output contracts.

  - Use `main.yaml` as the default profile and `profiles/<name>.yaml` for named profiles.
  - Remove legacy variant CLI behavior and `variants/` auto-discovery.
  - Treat missing or invalid Night Mode overlays as skipped output instead of failed day builds.
  - Stop emitting `theme.dimension` as a public output root and guide migration through `wave dt doctor`.
  - Package built-in resources with the compiled CLI.
  - Normalize composite shadow and border values before CSS and Sketch formatting.
  - Format normal border tokens as CSS border shorthand and keep outline offset output.
  - Allow `theme.radius.*` to use `sketch.property.cornerRadius`.
