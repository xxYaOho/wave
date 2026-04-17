# Graph Report - .  (2026-04-17)

## Corpus Check
- 98 files · ~54,866 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 395 nodes · 586 edges · 69 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Token Core & Extensions|Token Core & Extensions]]
- [[_COMMUNITY_Reference Resolution|Reference Resolution]]
- [[_COMMUNITY_Color Gradient Formatting|Color Gradient Formatting]]
- [[_COMMUNITY_Number & Theme Transform|Number & Theme Transform]]
- [[_COMMUNITY_Contrast Evaluation|Contrast Evaluation]]
- [[_COMMUNITY_CLI Utilities|CLI Utilities]]
- [[_COMMUNITY_Sketch Color Output|Sketch Color Output]]
- [[_COMMUNITY_Sketch Format Helpers|Sketch Format Helpers]]
- [[_COMMUNITY_Product Roadmap|Product Roadmap]]
- [[_COMMUNITY_Theme Pipeline & Service|Theme Pipeline & Service]]
- [[_COMMUNITY_Test Fixture Management|Test Fixture Management]]
- [[_COMMUNITY_Flat & Inherit Formatting|Flat & Inherit Formatting]]
- [[_COMMUNITY_Schema Validation|Schema Validation]]
- [[_COMMUNITY_Resource Resolution|Resource Resolution]]
- [[_COMMUNITY_Benchmarks|Benchmarks]]
- [[_COMMUNITY_Nested Reference Benchmarks|Nested Reference Benchmarks]]
- [[_COMMUNITY_DTCG Type Guards|DTCG Type Guards]]
- [[_COMMUNITY_Cubic Bezier Math|Cubic Bezier Math]]
- [[_COMMUNITY_Color Space Conversion|Color Space Conversion]]
- [[_COMMUNITY_Doctor Theme Context|Doctor Theme Context]]
- [[_COMMUNITY_Config Validation|Config Validation]]
- [[_COMMUNITY_Builtin Resources|Builtin Resources]]
- [[_COMMUNITY_File IO Utils|File I/O Utils]]
- [[_COMMUNITY_Theme Service Tests|Theme Service Tests]]
- [[_COMMUNITY_Dimension Schema|Dimension Schema]]
- [[_COMMUNITY_Palette Schema|Palette Schema]]
- [[_COMMUNITY_Resource Schema|Resource Schema]]
- [[_COMMUNITY_Night Mode Detection|Night Mode Detection]]
- [[_COMMUNITY_User Resource Loading|User Resource Loading]]
- [[_COMMUNITY_CLI Show Command|CLI Show Command]]
- [[_COMMUNITY_Smooth Gradient Tests|Smooth Gradient Tests]]
- [[_COMMUNITY_Sketch Format Tests|Sketch Format Tests]]
- [[_COMMUNITY_Theme Current Fallback Tests|Theme Current Fallback Tests]]
- [[_COMMUNITY_Theme Current Behavior Tests|Theme Current Behavior Tests]]
- [[_COMMUNITY_CSS Format Tests|CSS Format Tests]]
- [[_COMMUNITY_Flat Format Tests|Flat Format Tests]]
- [[_COMMUNITY_Sketch Component Tests|Sketch Component Tests]]
- [[_COMMUNITY_Pair Extractor Tests|Pair Extractor Tests]]
- [[_COMMUNITY_CLI Doctor Tests|CLI Doctor Tests]]
- [[_COMMUNITY_Themefile Parser|Themefile Parser]]
- [[_COMMUNITY_Theme YAML Parser|Theme YAML Parser]]
- [[_COMMUNITY_Variant Detection|Variant Detection]]
- [[_COMMUNITY_Logger|Logger]]
- [[_COMMUNITY_Theme Multiselect TUI|Theme Multiselect TUI]]
- [[_COMMUNITY_CSS Var Transform Tests|CSS Var Transform Tests]]
- [[_COMMUNITY_Smooth Gradient Transformer Tests|Smooth Gradient Transformer Tests]]
- [[_COMMUNITY_Doctor Pairs Schema Tests|Doctor Pairs Schema Tests]]
- [[_COMMUNITY_Extends Resolver Tests|Extends Resolver Tests]]
- [[_COMMUNITY_Inherit Color Transformer Tests|Inherit Color Transformer Tests]]
- [[_COMMUNITY_Resource Validation Tests|Resource Validation Tests]]
- [[_COMMUNITY_Doctor Runner Tests|Doctor Runner Tests]]
- [[_COMMUNITY_Smooth Shadow Contract Tests|Smooth Shadow Contract Tests]]
- [[_COMMUNITY_Theme Transformer Tests|Theme Transformer Tests]]
- [[_COMMUNITY_Themefile Resource Parser Tests|Themefile Resource Parser Tests]]
- [[_COMMUNITY_Color Space Tests|Color Space Tests]]
- [[_COMMUNITY_Inherit Color Schema Tests|Inherit Color Schema Tests]]
- [[_COMMUNITY_Resource Resolver Tests|Resource Resolver Tests]]
- [[_COMMUNITY_Smooth Shadow Transformer Tests|Smooth Shadow Transformer Tests]]
- [[_COMMUNITY_Doctor Contrast Score Tests|Doctor Contrast Score Tests]]
- [[_COMMUNITY_Resource Merge Tests|Resource Merge Tests]]
- [[_COMMUNITY_CLI Entry Point|CLI Entry Point]]
- [[_COMMUNITY_Detector Index|Detector Index]]
- [[_COMMUNITY_Validator Index|Validator Index]]
- [[_COMMUNITY_Resolver Index|Resolver Index]]
- [[_COMMUNITY_Inherit Color Attr Transform|Inherit Color Attr Transform]]
- [[_COMMUNITY_Generator Dimension|Generator Dimension]]
- [[_COMMUNITY_Generator Palette|Generator Palette]]
- [[_COMMUNITY_Generator Transforms Index|Generator Transforms Index]]
- [[_COMMUNITY_Config Index|Config Index]]

## God Nodes (most connected - your core abstractions)
1. `resolveDtcgRef()` - 11 edges
2. `transformToken()` - 9 edges
3. `buildFullSketchOutput()` - 9 edges
4. `parseDtcgRef()` - 9 edges
5. `resolveSketchColor()` - 7 edges
6. `formatFlatJson()` - 7 edges
7. `resolveExternalDtcgValue()` - 7 edges
8. `resolveInternalDtcgValue()` - 7 edges
9. `resolveReference()` - 6 edges
10. `resolveReference()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `README.md` ----> `Wave CLI`  [EXTRACTED]
   →   _Bridges community 0 → community 8_

## Hyperedges (group relationships)
- **Wave $extensions Family** —  [INFERRED 0.95]
- **Documentation Hierarchy** —  [INFERRED 0.90]
- **Theme Authoring Pipeline** —  [INFERRED 0.92]

## Communities

### Community 0 - "Token Core & Extensions"
Cohesion: 0.11
Nodes (45): Color Space Configuration, Composite Token, currentColor Extension (Deprecated), Token Generation Data Flow, Design Token, Wave Dimension, doctor.wcagPairs, DTCG $ref Reference (+37 more)

### Community 1 - "Reference Resolution"
Cohesion: 0.12
Nodes (34): CircularReferenceError, collectInternalReferences(), deepMergeGroups(), deriveSwatchNameFromDtcgRef(), deriveSwatchNameFromStringRef(), expandExtends(), expandGroupExtends(), ExtendsCycleError (+26 more)

### Community 2 - "Color Gradient Formatting"
Cohesion: 0.11
Nodes (10): formatCssVariables(), formatTokenValue(), getFilteredName(), getGroupCommentPaths(), isGradientToken(), isShadowToken(), ensureExtensionsRegistered(), generateTokens() (+2 more)

### Community 3 - "Number & Theme Transform"
Cohesion: 0.24
Nodes (15): alphaToHex(), applyColorAlpha(), convertColorWithAlpha(), deriveSmoothGradient(), deriveSmoothShadow(), extractColorAlpha(), extractInheritColorOpacity(), extractInheritColorPropertyValue() (+7 more)

### Community 4 - "Contrast Evaluation"
Cohesion: 0.16
Nodes (10): computeRatio(), evaluateContrast(), resolveColorToChroma(), extractDoctorPairs(), isColorToken(), lookupResolved(), checkBunVersion(), compareVersions() (+2 more)

### Community 5 - "CLI Utilities"
Cohesion: 0.16
Nodes (7): findResource(), flattenResource(), formatValueForDisplay(), isValueUnitPair(), showResource(), stringifyCompact(), transformDimensionDisplay()

### Community 6 - "Sketch Color Output"
Cohesion: 0.22
Nodes (11): buildFullSketchOutput(), buildNestedTree(), capitalize(), extractOpacity(), generateFlatKey(), hexToSketchColor(), isBorderToken(), isColorToken() (+3 more)

### Community 7 - "Sketch Format Helpers"
Cohesion: 0.22
Nodes (12): applyOpacityToHex(), cleanValue(), extractColorFromValue(), findSiblingToken(), getInheritColorAlpha(), getInheritColorOpacity(), getInheritColorSiblingSlot(), hexToSketchColor() (+4 more)

### Community 8 - "Product Roadmap"
Cohesion: 0.18
Nodes (16): Phase 1: Foundation (0-2 months), Phase 2: Bridge Building (2-4 months), Phase 3: Ecosystem (4-6 months), Phase 4: Long-term Vision (6+ months), Style Dictionary as Build Engine, SWOT Strengths, SWOT Weaknesses, Wave Value Proposition (+8 more)

### Community 9 - "Theme Pipeline & Service"
Cohesion: 0.22
Nodes (9): buildDependencyDictionary(), expandHomePath(), isParseError(), loadThemefile(), loadYamlFile(), processThemeDocument(), resolveOutputDir(), generateTheme() (+1 more)

### Community 10 - "Test Fixture Management"
Cohesion: 0.24
Nodes (6): createTempTheme(), expectOutputToMatch(), generateDiff(), renderScalar(), renderTokens(), renderValue()

### Community 11 - "Flat & Inherit Formatting"
Cohesion: 0.38
Nodes (9): cleanInternalFields(), cleanShadowZeroPx(), formatFlatJson(), formatInheritColorValue(), getFilteredName(), getInheritColorAlpha(), getInheritColorOpacity(), isInheritColorToken() (+1 more)

### Community 12 - "Schema Validation"
Cohesion: 0.38
Nodes (9): checkDanglingJsonPointer(), checkValueDeep(), validateComposite(), validateDoctorSection(), validateExtends(), validateInheritColor(), validateThemeSchema(), validateToken() (+1 more)

### Community 13 - "Resource Resolution"
Cohesion: 0.31
Nodes (7): checkExists(), isBareName(), resolveResource(), findCrossDependencyReferences(), isBareName(), loadResource(), resolveResourcePath()

### Community 14 - "Benchmarks"
Cohesion: 0.47
Nodes (8): benchmarkDepths(), benchmarkMixedReferences(), benchmarkPerformanceComparison(), createMockDataSources(), extractValue(), getValueAtPath(), main(), resolveReference()

### Community 15 - "Nested Reference Benchmarks"
Cohesion: 0.54
Nodes (7): benchmarkDepths(), benchmarkPerformanceComparison(), createMockDataSources(), extractValue(), getValueAtPath(), main(), resolveReference()

### Community 16 - "DTCG Type Guards"
Cohesion: 0.29
Nodes (0): 

### Community 17 - "Cubic Bezier Math"
Cohesion: 0.6
Nodes (5): cubicBezierX(), cubicBezierXDerivative(), cubicBezierY(), sampleCubicBezier(), solveCubicBezierT()

### Community 18 - "Color Space Conversion"
Cohesion: 0.53
Nodes (4): convertColorSpace(), createColorFromSpace(), formatColorOutput(), formatError()

### Community 19 - "Doctor Theme Context"
Cohesion: 0.4
Nodes (2): createThemeDoctorContext(), isParseError()

### Community 20 - "Config Validation"
Cohesion: 0.4
Nodes (0): 

### Community 21 - "Builtin Resources"
Cohesion: 0.6
Nodes (4): getBuiltinDimensionPath(), getBuiltinPalettePath(), loadBuiltinDimension(), loadBuiltinPalette()

### Community 22 - "File I/O Utils"
Cohesion: 0.4
Nodes (0): 

### Community 23 - "Theme Service Tests"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Dimension Schema"
Cohesion: 0.67
Nodes (0): 

### Community 25 - "Palette Schema"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Resource Schema"
Cohesion: 0.67
Nodes (0): 

### Community 27 - "Night Mode Detection"
Cohesion: 1.0
Nodes (2): checkFileExists(), detectNightMode()

### Community 28 - "User Resource Loading"
Cohesion: 0.67
Nodes (0): 

### Community 29 - "CLI Show Command"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Smooth Gradient Tests"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Sketch Format Tests"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Theme Current Fallback Tests"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Theme Current Behavior Tests"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "CSS Format Tests"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Flat Format Tests"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Sketch Component Tests"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Pair Extractor Tests"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "CLI Doctor Tests"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Themefile Parser"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Theme YAML Parser"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Variant Detection"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Logger"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Theme Multiselect TUI"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "CSS Var Transform Tests"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Smooth Gradient Transformer Tests"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Doctor Pairs Schema Tests"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Extends Resolver Tests"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Inherit Color Transformer Tests"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Resource Validation Tests"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Doctor Runner Tests"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Smooth Shadow Contract Tests"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Theme Transformer Tests"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Themefile Resource Parser Tests"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Color Space Tests"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Inherit Color Schema Tests"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Resource Resolver Tests"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Smooth Shadow Transformer Tests"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Doctor Contrast Score Tests"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Resource Merge Tests"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "CLI Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Detector Index"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Validator Index"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Resolver Index"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Inherit Color Attr Transform"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Generator Dimension"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Generator Palette"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Generator Transforms Index"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Config Index"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `CLI Show Command`** (2 nodes): `runWave()`, `cli-show.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smooth Gradient Tests`** (2 nodes): `runWaveTheme()`, `smooth-gradient-output.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sketch Format Tests`** (2 nodes): `createMockDictionary()`, `inherit-color-sketch-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme Current Fallback Tests`** (2 nodes): `theme-command-current-fallback.test.ts`, `runWaveTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme Current Behavior Tests`** (2 nodes): `theme-command-current-behavior.test.ts`, `runWaveTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSS Format Tests`** (2 nodes): `createMockDictionary()`, `inherit-color-css-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Flat Format Tests`** (2 nodes): `createMockDictionary()`, `inherit-color-flat-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sketch Component Tests`** (2 nodes): `createMockDictionary()`, `sketch-component-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pair Extractor Tests`** (2 nodes): `buildResolved()`, `pair-extractor.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CLI Doctor Tests`** (2 nodes): `runWave()`, `cli-doctor.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Themefile Parser`** (2 nodes): `themefile.ts`, `parseThemefile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme YAML Parser`** (2 nodes): `theme-yaml.ts`, `parseThemeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Variant Detection`** (2 nodes): `variants.ts`, `detectVariants()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logger`** (2 nodes): `exit()`, `logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme Multiselect TUI`** (2 nodes): `theme-multiselect.ts`, `selectThemesToGenerate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSS Var Transform Tests`** (1 nodes): `css-var-transform.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smooth Gradient Transformer Tests`** (1 nodes): `smooth-gradient-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Doctor Pairs Schema Tests`** (1 nodes): `doctor-pairs-schema.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Extends Resolver Tests`** (1 nodes): `extends-resolver.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Inherit Color Transformer Tests`** (1 nodes): `inherit-color-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resource Validation Tests`** (1 nodes): `resource-validation.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Doctor Runner Tests`** (1 nodes): `doctor-runner.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smooth Shadow Contract Tests`** (1 nodes): `smooth-shadow-contract.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme Transformer Tests`** (1 nodes): `theme-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Themefile Resource Parser Tests`** (1 nodes): `themefile-resource-parser.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Color Space Tests`** (1 nodes): `color-space.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Inherit Color Schema Tests`** (1 nodes): `inherit-color-schema.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resource Resolver Tests`** (1 nodes): `resource-resolver.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smooth Shadow Transformer Tests`** (1 nodes): `smooth-shadow-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Doctor Contrast Score Tests`** (1 nodes): `doctor-contrast-score.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resource Merge Tests`** (1 nodes): `resource-merge.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CLI Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Detector Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Validator Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resolver Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Inherit Color Attr Transform`** (1 nodes): `inherit-color-attr.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generator Dimension`** (1 nodes): `dimension.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generator Palette`** (1 nodes): `palette.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generator Transforms Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Config Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Token Core & Extensions` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Reference Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Color Gradient Formatting` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._