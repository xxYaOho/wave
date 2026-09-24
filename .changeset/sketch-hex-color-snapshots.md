---
"wave": minor
---

Remove the trial-period Sketch swatch binding: layer color positions no longer emit `{ "$ref": "<uuid>" }` and always carry the concrete `#RRGGBBAA` HEX8 snapshot instead. The outline ring keeps its two-layer `shadows` shape (ring layer plus the fixed `#ffffffff` gap layer).

The Sketch-only color-reference metadata, its alias index, and the "internal reference target is not emitted" build error are gone with it: a color token no longer needs a registered `$id`, and a `sketch.skip` or root-excluded target no longer fails an outline border build. This is a breaking output-contract change for Sketch consumers that relied on the binding; the HEX8 degradation path those consumers already had to accept is now the only form.
