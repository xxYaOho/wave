# Graph Report - .  (2026-05-08)

## Corpus Check
- 100 files · ~56,088 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 142 nodes · 206 edges · 14 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Engine & References|Core Engine & References]]
- [[_COMMUNITY_Roadmap & Ecosystem|Roadmap & Ecosystem]]
- [[_COMMUNITY_Token Transformer|Token Transformer]]
- [[_COMMUNITY_Sketch Output Format|Sketch Output Format]]
- [[_COMMUNITY_Theme Pipeline|Theme Pipeline]]
- [[_COMMUNITY_Schema Validation|Schema Validation]]
- [[_COMMUNITY_CSS Variables Format|CSS Variables Format]]
- [[_COMMUNITY_DTCG Type System|DTCG Type System]]
- [[_COMMUNITY_Theme Service|Theme Service]]
- [[_COMMUNITY_Doctor Context|Doctor Context]]
- [[_COMMUNITY_Group Pipeline Tests|Group Pipeline Tests]]
- [[_COMMUNITY_Themefile Parser|Themefile Parser]]
- [[_COMMUNITY_Product Vision|Product Vision]]
- [[_COMMUNITY_Group Parser Tests|Group Parser Tests]]

## God Nodes (most connected - your core abstractions)
1. `Wave` - 17 edges
2. `transformToken()` - 9 edges
3. `Themefile Configuration` - 8 edges
4. `Resource Resolution` - 8 edges
5. `resolveSketchColor()` - 7 edges
6. `Token Generation Data Flow` - 6 edges
7. `processValue()` - 5 edges
8. `deriveSmoothShadow()` - 5 edges
9. `walkNode()` - 5 edges
10. `main.yaml (DTCG Token Source)` - 5 edges

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

### Community 0 - "Core Engine & References"
Cohesion: 0.1
Nodes (28): Core Value Proposition, wave doctor, Wave Positioning: Local Design Token Workstation, Brace Reference {namespace.path}, Circular Reference Detection, DTCG Color Space Support, Composite Extension, Cross-Dependency Reference Restriction (+20 more)

### Community 1 - "Roadmap & Ecosystem"
Cohesion: 0.09
Nodes (27): AI Token Assistant, Component-Level Token Binding, Design System Template Marketplace, DTCG Format (W3C), Error Message Design Optimization, Figma Plugin Bidirectional Sync, Figma Variables, GitHub Action / CI Integration (+19 more)

### Community 2 - "Token Transformer"
Cohesion: 0.28
Nodes (15): alphaToHex(), applyColorAlpha(), convertColorWithAlpha(), deriveSmoothGradient(), deriveSmoothShadow(), extractColorAlpha(), extractInheritColorOpacity(), extractInheritColorPropertyValue() (+7 more)

### Community 3 - "Sketch Output Format"
Cohesion: 0.22
Nodes (12): applyOpacityToHex(), cleanValue(), extractColorFromValue(), findSiblingToken(), getInheritColorAlpha(), getInheritColorOpacity(), getInheritColorSiblingSlot(), hexToSketchColor() (+4 more)

### Community 4 - "Theme Pipeline"
Cohesion: 0.23
Nodes (10): buildDependencyDictionary(), buildGroupPasses(), expandHomePath(), isParseError(), loadThemefile(), loadYamlFile(), mergeParameters(), processThemeDocument() (+2 more)

### Community 5 - "Schema Validation"
Cohesion: 0.38
Nodes (9): checkDanglingJsonPointer(), checkValueDeep(), validateComposite(), validateDoctorSection(), validateExtends(), validateInheritColor(), validateThemeSchema(), validateToken() (+1 more)

### Community 6 - "CSS Variables Format"
Cohesion: 0.43
Nodes (6): formatCssVariables(), formatTokenValue(), getFilteredName(), getGroupCommentPaths(), isGradientToken(), isShadowToken()

### Community 7 - "DTCG Type System"
Cohesion: 0.29
Nodes (0): 

### Community 8 - "Theme Service"
Cohesion: 0.9
Nodes (4): generatePass(), generateTheme(), generateThemeTokens(), isSelected()

### Community 9 - "Doctor Context"
Cohesion: 0.67
Nodes (2): createThemeDoctorContext(), isParseError()

### Community 10 - "Group Pipeline Tests"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Themefile Parser"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Product Vision"
Cohesion: 1.0
Nodes (2): Mental Model, Scope Boundary (Explicitly Excluded)

### Community 13 - "Group Parser Tests"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **19 isolated node(s):** `DTCG Format (W3C)`, `wave doctor`, `GitHub Action / CI Integration`, `Design System Template Marketplace`, `Token Version Management & Diff` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Group Pipeline Tests`** (2 nodes): `themefile-group-pipeline.test.ts`, `makeParsed()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Themefile Parser`** (2 nodes): `themefile.ts`, `parseThemefile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Product Vision`** (2 nodes): `Mental Model`, `Scope Boundary (Explicitly Excluded)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Group Parser Tests`** (1 nodes): `themefile-group-parser.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Wave` connect `Roadmap & Ecosystem` to `Core Engine & References`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `Themefile Configuration` connect `Core Engine & References` to `Roadmap & Ecosystem`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Wave` (e.g. with `Themefile Configuration` and `Wave CLI`) actually correct?**
  _`Wave` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DTCG Format (W3C)`, `wave doctor`, `GitHub Action / CI Integration` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Engine & References` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Roadmap & Ecosystem` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._