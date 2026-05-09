# Graph Report - .  (2026-05-09)

## Corpus Check
- 0 files · ~53,782 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 239 nodes · 336 edges · 37 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Spec & Doctor Rules|Spec & Doctor Rules]]
- [[_COMMUNITY_Roadmap & Future Features|Roadmap & Future Features]]
- [[_COMMUNITY_Theme Pipeline Core|Theme Pipeline Core]]
- [[_COMMUNITY_Theme Transformer|Theme Transformer]]
- [[_COMMUNITY_Inherit Color Helpers|Inherit Color Helpers]]
- [[_COMMUNITY_Receipt UI Helpers|Receipt UI Helpers]]
- [[_COMMUNITY_CSS Variables Format|CSS Variables Format]]
- [[_COMMUNITY_Sketch Format|Sketch Format]]
- [[_COMMUNITY_Theme Validators|Theme Validators]]
- [[_COMMUNITY_Flat JSON Format|Flat JSON Format]]
- [[_COMMUNITY_CSS Variables With Desc|CSS Variables With Desc]]
- [[_COMMUNITY_DTCG Type Guards|DTCG Type Guards]]
- [[_COMMUNITY_Wave Spinner CLI|Wave Spinner CLI]]
- [[_COMMUNITY_Build Context|Build Context]]
- [[_COMMUNITY_Theme Context|Theme Context]]
- [[_COMMUNITY_Group Pipeline Tests|Group Pipeline Tests]]
- [[_COMMUNITY_Themefile Parser|Themefile Parser]]
- [[_COMMUNITY_Scope Concepts|Scope Concepts]]
- [[_COMMUNITY_Smooth Gradient Tests|Smooth Gradient Tests]]
- [[_COMMUNITY_Flat Format Tests|Flat Format Tests]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `Wave` - 17 edges
2. `renderSuccess()` - 10 edges
3. `transformToken()` - 9 edges
4. `renderFailed()` - 9 edges
5. `Themefile Configuration` - 8 edges
6. `Resource Resolution` - 8 edges
7. `buildFlatRecord()` - 8 edges
8. `resolveSketchColor()` - 7 edges
9. `flatJsoncFormat()` - 7 edges
10. `BuildContext` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Wave` --implements--> `Themefile Configuration`  [INFERRED]
  docs/ROADMAP_PRODUCT.md → docs/SPEC.md
- `Wave` --implements--> `Output Formats (json/jsonc/css/sketch)`  [INFERRED]
  docs/ROADMAP_PRODUCT.md → docs/SPEC.md
- `Wave` --implements--> `Wave CLI`  [INFERRED]
  docs/ROADMAP_PRODUCT.md → docs/SPEC.md
- `Style Dictionary (Amazon)` --conceptually_related_to--> `Wave CLI`  [INFERRED]
  docs/ROADMAP_PRODUCT.md → docs/SPEC.md
- `Core Value Proposition` --rationale_for--> `Token Generation Data Flow`  [INFERRED]
  docs/ROADMAP_PRODUCT.md → docs/SPEC.md

## Hyperedges (group relationships)
- **Token Generation Pipeline** — spec_themefile, spec_main_yaml, spec_resource_resolution, spec_colorspace, spec_output_formats [EXTRACTED 0.95]
- **Wave Custom Extensions (cubic-bezier based)** — spec_smooth_gradient, spec_smooth_shadow, spec_wave_dimension [INFERRED 0.85]
- **Reference Resolution System** — spec_brace_reference, spec_dtcg_ref, spec_circular_reference, spec_cross_dependency_restriction [EXTRACTED 0.90]

## Communities

### Community 0 - "Spec & Doctor Rules"
Cohesion: 0.1
Nodes (28): Core Value Proposition, wave doctor, Wave Positioning: Local Design Token Workstation, Brace Reference {namespace.path}, Circular Reference Detection, DTCG Color Space Support, Composite Extension, Cross-Dependency Reference Restriction (+20 more)

### Community 1 - "Roadmap & Future Features"
Cohesion: 0.09
Nodes (27): AI Token Assistant, Component-Level Token Binding, Design System Template Marketplace, DTCG Format (W3C), Error Message Design Optimization, Figma Plugin Bidirectional Sync, Figma Variables, GitHub Action / CI Integration (+19 more)

### Community 2 - "Theme Pipeline Core"
Cohesion: 0.18
Nodes (14): buildDependencyDictionary(), buildGroupPasses(), expandHomePath(), isParseError(), loadThemefile(), loadYamlFile(), mergeParameters(), processThemeDocument() (+6 more)

### Community 3 - "Theme Transformer"
Cohesion: 0.24
Nodes (15): alphaToHex(), applyColorAlpha(), convertColorWithAlpha(), deriveSmoothGradient(), deriveSmoothShadow(), extractColorAlpha(), extractInheritColorOpacity(), extractInheritColorPropertyValue() (+7 more)

### Community 4 - "Inherit Color Helpers"
Cohesion: 0.22
Nodes (12): applyOpacityToHex(), cleanValue(), extractColorFromValue(), findSiblingToken(), getInheritColorAlpha(), getInheritColorOpacity(), getInheritColorSiblingSlot(), hexToSketchColor() (+4 more)

### Community 5 - "Receipt UI Helpers"
Cohesion: 0.34
Nodes (15): borderBottom(), borderTop(), boxWidth(), centerLine(), clamp(), kvLine(), line(), midDashed() (+7 more)

### Community 6 - "CSS Variables Format"
Cohesion: 0.22
Nodes (6): cssVariablesFormat(), formatTokenValue(), getFilteredName(), getGroupCommentPaths(), isGradient(), isShadow()

### Community 7 - "Sketch Format"
Cohesion: 0.35
Nodes (11): addSketchSwatch(), applyOpacityToHex(), cleanValue(), extractColorFromValue(), findSiblingToken(), hexToSketchColor(), mapGradientStops(), processComponentShadowLayer() (+3 more)

### Community 8 - "Theme Validators"
Cohesion: 0.38
Nodes (9): checkDanglingJsonPointer(), checkValueDeep(), validateComposite(), validateDoctorSection(), validateExtends(), validateInheritColor(), validateThemeSchema(), validateToken() (+1 more)

### Community 9 - "Flat JSON Format"
Cohesion: 0.49
Nodes (9): buildFlatRecord(), cleanInternalFields(), cleanShadowZeroPx(), flatJsoncFormat(), flatJsonFormat(), formatInheritColorValue(), getFilteredName(), isInheritColorToken() (+1 more)

### Community 10 - "CSS Variables With Desc"
Cohesion: 0.43
Nodes (6): formatCssVariables(), formatTokenValue(), getFilteredName(), getGroupCommentPaths(), isGradientToken(), isShadowToken()

### Community 11 - "DTCG Type Guards"
Cohesion: 0.29
Nodes (0): 

### Community 12 - "Wave Spinner CLI"
Cohesion: 0.29
Nodes (1): WaveSpinner

### Community 13 - "Build Context"
Cohesion: 0.29
Nodes (1): BuildContext

### Community 14 - "Theme Context"
Cohesion: 0.67
Nodes (2): createThemeDoctorContext(), isParseError()

### Community 15 - "Group Pipeline Tests"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Themefile Parser"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Scope Concepts"
Cohesion: 1.0
Nodes (2): Mental Model, Scope Boundary (Explicitly Excluded)

### Community 18 - "Smooth Gradient Tests"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Flat Format Tests"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **19 isolated node(s):** `DTCG Format (W3C)`, `wave doctor`, `GitHub Action / CI Integration`, `Design System Template Marketplace`, `Token Version Management & Diff` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Group Pipeline Tests`** (2 nodes): `themefile-group-pipeline.test.ts`, `makeParsed()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Themefile Parser`** (2 nodes): `themefile.ts`, `parseThemefile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scope Concepts`** (2 nodes): `Mental Model`, `Scope Boundary (Explicitly Excluded)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smooth Gradient Tests`** (2 nodes): `findToken()`, `smooth-gradient-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Flat Format Tests`** (2 nodes): `makeToken()`, `format-flat.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `findToken()`, `inherit-color-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `token()`, `inherit-color-sketch-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `theme-command-current-fallback.test.ts`, `runWaveTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `token()`, `inherit-color-css-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `findToken()`, `smooth-shadow-contract.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `token()`, `inherit-color-flat-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `theme-transformer.test.ts`, `findToken()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `token()`, `sketch-component-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `findToken()`, `smooth-shadow-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `parseCliOptions()`, `create.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `themefile-group-parser.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `css-var-transform.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `format-sketch.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `format-css.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `receipt.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Wave` connect `Roadmap & Future Features` to `Spec & Doctor Rules`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `Themefile Configuration` connect `Spec & Doctor Rules` to `Roadmap & Future Features`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Wave` (e.g. with `Themefile Configuration` and `Wave CLI`) actually correct?**
  _`Wave` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DTCG Format (W3C)`, `wave doctor`, `GitHub Action / CI Integration` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Spec & Doctor Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Roadmap & Future Features` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._