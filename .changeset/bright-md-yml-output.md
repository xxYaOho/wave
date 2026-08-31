---
"wave": minor
---

Add the `md-yml` design-token output platform for Markdown-friendly YAML token fragments. Theme-local direct references remain reusable after namespace projection, including references inherited through typography defaults; external and computed references remain materialized.

When `--platform` is provided, Wave now creates one base-parameter pass per selected profile instead of expanding `parameterGroup`. Group-specific `filterLayer`, `colorSpace`, and `outputDir` values no longer apply to that CLI override; `--out` without `--platform` still expands all groups.
