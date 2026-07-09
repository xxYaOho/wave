# wave

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
