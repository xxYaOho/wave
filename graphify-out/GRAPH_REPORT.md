# Graph Report - .  (2026-04-14)

## Corpus Check
- Corpus is ~49,197 words - fits in a single context window. You may not need a graph.

## Summary
- 508 nodes · 634 edges · 88 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 75 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Theme Reference Resolution|Theme Reference Resolution]]
- [[_COMMUNITY_Theme Pipeline & Generation|Theme Pipeline & Generation]]
- [[_COMMUNITY_CSS Variable Transforms|CSS Variable Transforms]]
- [[_COMMUNITY_Cubic Bezier Math|Cubic Bezier Math]]
- [[_COMMUNITY_Doctor Contrast Checking|Doctor Contrast Checking]]
- [[_COMMUNITY_Documentation & Config|Documentation & Config]]
- [[_COMMUNITY_CLI Help & Doctor Utils|CLI Help & Doctor Utils]]
- [[_COMMUNITY_Test Fixture Management|Test Fixture Management]]
- [[_COMMUNITY_Contrast Evaluation|Contrast Evaluation]]
- [[_COMMUNITY_CLI Commands & Guides|CLI Commands & Guides]]
- [[_COMMUNITY_Sketch Colors|Sketch Colors]]
- [[_COMMUNITY_Sketch Format|Sketch Format]]
- [[_COMMUNITY_Core Pipeline|Core Pipeline]]
- [[_COMMUNITY_CLI Tests|CLI Tests]]
- [[_COMMUNITY_Test Fixtures|Test Fixtures]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
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
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]

## God Nodes (most connected - your core abstractions)
1. `resolveDtcgRef()` - 11 edges
2. `generateTheme` - 11 edges
3. `transformToken()` - 9 edges
4. `buildFullSketchOutput()` - 9 edges
5. `parseDtcgRef()` - 9 edges
6. `processThemeDocument` - 8 edges
7. `resolveReferences` - 8 edges
8. `registerWaveExtensions` - 8 edges
9. `resolveSketchColor()` - 7 edges
10. `formatFlatJson()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Embedded Manual Template` --semantically_similar_to--> `Basic Theme Manual Template`  [INFERRED] [semantically similar]
  src/cli/commands/theme.ts → templates/basic/manual.md
- `theme Command` --conceptually_related_to--> `Night and Variants Themes`  [INFERRED]
  src/cli/commands/theme.ts → docs/GUIDE.md
- `ParsedThemefile Type` --shares_data_with--> `RESOURCE Declaration`  [INFERRED]
  src/types/index.ts → docs/SPEC.md
- `Dimension Display Transformer` --shares_data_with--> `RESOURCE Declaration`  [INFERRED]
  src/cli/commands/show.ts → docs/SPEC.md
- `Built-in Resources` --semantically_similar_to--> `RESOURCE Declaration`  [INFERRED] [semantically similar]
  README.md → docs/SPEC.md

## Hyperedges (group relationships)
- **Theme Authoring Flow** — readme_themefile, readme_main_yaml, spec_resource_declaration, guide_reference_system, spec_design_token_flow [INFERRED 0.88]
- **Wave Extension Family** — spec_composite_extension, spec_smooth_gradient, spec_smooth_shadow, spec_inherit_color [EXTRACTED 1.00]
- **CLI Command Surface** — cli_program, help_help_command, list_list_command, show_show_command, theme_theme_command [EXTRACTED 1.00]
- **Theme Contrast Evaluation Flow** — doctor_theme_context_create_theme_doctor_context, doctor_pair_extractor_extract_doctor_pairs, doctor_contrast_evaluator_evaluate_contrast, doctor_registry_run_theme_contrast_check [INFERRED 0.91]
- **Single Namespace Resource Validation Pattern** — schema_dimension_dimension_schema, schema_palette_palette_schema, schema_resource_validate_generic_resource [INFERRED 0.92]
- **Theme File Discovery And Selection** — doctor_theme_context_detect_theme_files, detector_night_detect_night_mode, detector_variants_detect_variants, doctor_theme_select_select_theme [INFERRED 0.80]
- **Theme generation pipeline** — theme_service_generate_theme, theme_pipeline_load_themefile, theme_pipeline_build_dependency_dictionary, theme_pipeline_process_theme_document, style_dict_generate_tokens [INFERRED 0.94]
- **Theme reference resolution flow** — theme_pipeline_process_theme_document, theme_reference_expand_extends, theme_reference_two_pass_reference_resolution, theme_reference_resolve_references [INFERRED 0.91]
- **Inherit-color metadata consumer set** — inherit_color_attr_inherit_color_attribute_transform, css_variables_with_desc_format, flat_flat_json_format, flat_flat_jsonc_format, sketch_format_sketch_format [INFERRED 0.91]
- **inheritColor multi-format output pipeline** — inherit_color_schema_inherit_color_validation, inherit_color_transformer_inherit_color_transformation, inherit_color_css_format_inherit_color_css_output, inherit_color_flat_format_inherit_color_flat_output, inherit_color_sketch_format_inherit_color_sketch_output, sketch_component_format_sketch_component_mapping [INFERRED 0.91]
- **Doctor theme audit flow** — doctor_pairs_schema_wcag_pairs_schema, pair_extractor_wcag_pair_extraction, doctor_theme_context_theme_doctor_context, doctor_contrast_score_wcag_contrast_scoring, doctor_runner_doctor_result_aggregation, cli_doctor_wave_doctor_command [INFERRED 0.90]
- **Resource and theme resolution pipeline** — themefile_resource_parser_resource_directive_syntax, resource_validation_resource_schema_validation, resource_merge_dependency_dictionary, resource_resolver_reference_resolution, extends_resolver_group_extends_inheritance, theme_command_current_behavior_theme_document_isolation, theme_command_current_fallback_fail_fast_unresolved_references [INFERRED 0.88]
- **Simple reference benchmark flow** — nested_reference_resolution_simple_create_mock_data_sources, nested_reference_resolution_simple_resolve_reference, nested_reference_resolution_simple_benchmark_depths, nested_reference_resolution_simple_benchmark_performance_comparison [INFERRED 0.87]
- **Nested reference benchmark flow** — nested_reference_resolution_resolve_reference, nested_reference_resolution_benchmark_depths, nested_reference_resolution_benchmark_mixed_references, theme_reference_resolve_references [INFERRED 0.82]
- **Temporary theme fixture lifecycle** — fixture_loader_create_temp_theme, fixture_loader_cleanup_temp_theme, fixture_loader_test_theme_contract, theme_service_test_temp_theme_flow [INFERRED 0.90]

## Communities

### Community 0 - "Theme Reference Resolution"
Cohesion: 0.12
Nodes (34): CircularReferenceError, collectInternalReferences(), deepMergeGroups(), deriveSwatchNameFromDtcgRef(), deriveSwatchNameFromStringRef(), expandExtends(), expandGroupExtends(), ExtendsCycleError (+26 more)

### Community 1 - "Theme Pipeline & Generation"
Cohesion: 0.08
Nodes (33): cssVariablesWithDescFormat, parseDimension, flatJsonFormat, flatJsoncFormat, inheritColorAttributeTransform, jsoncFormat, benchmarkMixedReferences, Mixed reference benchmark payload (+25 more)

### Community 2 - "CSS Variable Transforms"
Cohesion: 0.11
Nodes (10): formatCssVariables(), formatTokenValue(), getFilteredName(), getGroupCommentPaths(), isGradientToken(), isShadowToken(), ensureExtensionsRegistered(), generateTokens() (+2 more)

### Community 3 - "Cubic Bezier Math"
Cohesion: 0.17
Nodes (20): cubicBezierX(), cubicBezierXDerivative(), cubicBezierY(), sampleCubicBezier(), solveCubicBezierT(), alphaToHex(), applyColorAlpha(), convertColorWithAlpha() (+12 more)

### Community 4 - "Doctor Contrast Checking"
Cohesion: 0.1
Nodes (23): Doctor CLI Contract, wave doctor command, evaluateContrast, WCAG Threshold Matrix, WCAG contrast scoring, extractDoctorPairs, doctor.wcagPairs schema, createDoctorRegistry (+15 more)

### Community 5 - "Documentation & Config"
Cohesion: 0.1
Nodes (21): DTCG Specification, writeFile Utility, Night and Variants Themes, Reference System, Sketch API Export, Sketch Output, Sketch Layer Style Reference, composite Extension (+13 more)

### Community 6 - "CLI Help & Doctor Utils"
Cohesion: 0.12
Nodes (3): flattenResource(), formatValueForDisplay(), isValueUnitPair()

### Community 7 - "Test Fixture Management"
Cohesion: 0.16
Nodes (19): cleanupTempTheme, createTempTheme, expectOutputToMatch, generateDiff, loadExpectation, loadTestTheme, renderScalar, renderTokens (+11 more)

### Community 8 - "Contrast Evaluation"
Cohesion: 0.16
Nodes (10): computeRatio(), evaluateContrast(), resolveColorToChroma(), extractDoctorPairs(), isColorToken(), lookupResolved(), checkBunVersion(), compareVersions() (+2 more)

### Community 9 - "CLI Commands & Guides"
Cohesion: 0.14
Nodes (17): Style Dictionary, colorSpace Configuration, help Command, list Command, Built-in Resources, main.yaml, themefile, Dimension Display Transformer (+9 more)

### Community 10 - "Sketch Colors"
Cohesion: 0.22
Nodes (11): buildFullSketchOutput(), buildNestedTree(), capitalize(), extractOpacity(), generateFlatKey(), hexToSketchColor(), isBorderToken(), isColorToken() (+3 more)

### Community 11 - "Sketch Format"
Cohesion: 0.22
Nodes (12): applyOpacityToHex(), cleanValue(), extractColorFromValue(), findSiblingToken(), getInheritColorAlpha(), getInheritColorOpacity(), getInheritColorSiblingSlot(), hexToSketchColor() (+4 more)

### Community 12 - "Core Pipeline"
Cohesion: 0.22
Nodes (9): buildDependencyDictionary(), expandHomePath(), isParseError(), loadThemefile(), loadYamlFile(), processThemeDocument(), resolveOutputDir(), generateTheme() (+1 more)

### Community 13 - "CLI Tests"
Cohesion: 0.18
Nodes (14): wave list command, wave show command, Shadow CSS serialization, Group $extends inheritance, Dependency dictionary assembly, Reference resolution across theme resources, Resource schema validation, Smooth gradient CLI output (+6 more)

### Community 14 - "Test Fixtures"
Cohesion: 0.24
Nodes (6): createTempTheme(), expectOutputToMatch(), generateDiff(), renderScalar(), renderTokens(), renderValue()

### Community 15 - "Community 15"
Cohesion: 0.38
Nodes (9): cleanInternalFields(), cleanShadowZeroPx(), formatFlatJson(), formatInheritColorValue(), getFilteredName(), getInheritColorAlpha(), getInheritColorOpacity(), isInheritColorToken() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.38
Nodes (9): checkDanglingJsonPointer(), checkValueDeep(), validateComposite(), validateDoctorSection(), validateExtends(), validateInheritColor(), validateThemeSchema(), validateToken() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (7): checkExists(), isBareName(), resolveResource(), findCrossDependencyReferences(), isBareName(), loadResource(), resolveResourcePath()

### Community 18 - "Community 18"
Cohesion: 0.47
Nodes (8): benchmarkDepths(), benchmarkMixedReferences(), benchmarkPerformanceComparison(), createMockDataSources(), extractValue(), getValueAtPath(), main(), resolveReference()

### Community 19 - "Community 19"
Cohesion: 0.54
Nodes (7): benchmarkDepths(), benchmarkPerformanceComparison(), createMockDataSources(), extractValue(), getValueAtPath(), main(), resolveReference()

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (7): benchmarkDepths, benchmarkPerformanceComparison, resolveReference, benchmarkDepths, benchmarkPerformanceComparison, Deep-reference slowdown should trigger depth limit review, resolveReference

### Community 22 - "Community 22"
Cohesion: 0.53
Nodes (4): convertColorSpace(), createColorFromSpace(), formatColorOutput(), formatError()

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (2): createThemeDoctorContext(), isParseError()

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (6): inheritColor CSS output, inheritColor flat JSON output, inheritColor validation, inheritColor Sketch output, inheritColor transformation, Sketch component mapping

### Community 25 - "Community 25"
Cohesion: 0.4
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 0.6
Nodes (4): getBuiltinDimensionPath(), getBuiltinPalettePath(), loadBuiltinDimension(), loadBuiltinPalette()

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (5): detectNightMode, detectVariants, detectThemeFiles, Theme File Entry, selectTheme

### Community 29 - "Community 29"
Cohesion: 0.5
Nodes (4): Version Single Source Decision, Default Wave Config, Dynamic Version Loader, WaveConfig Type

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (4): Designer Swiss Army Knife Vision, README and GUIDE Split, Complete Usage Guide, Wave CLI

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (2): checkFileExists(), detectNightMode()

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): doctor.wcagPairs RootKey Refactor, doctor.wcagPairs, DoctorRunResult Type

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (3): Commander CLI Program, CLI Bootstrap Entrypoint, ExitCode Catalog

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (3): dimensionSchema, paletteSchema, validateGenericResource

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (3): wave list built-in resources test, resolveResource, resolveResourcePath

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (2): Console Logger, Exit Helper

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (2): Color space conversion, Theme transformer target color space conversion

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (1): smoothGradient Extension

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (1): smoothShadow Extension

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (1): valueCssVarTransform

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (1): createMockDataSources

## Ambiguous Edges - Review These
- `resolveResource` → `wave list built-in resources test`  [AMBIGUOUS]
  tests/cli-list.test.ts · relation: conceptually_related_to
- `resolveReferences` → `Circular reference failure case`  [AMBIGUOUS]
  tests/integration/theme-service.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **65 isolated node(s):** `Sketch Output`, `Designer Swiss Army Knife Vision`, `Style Dictionary`, `DTCG Specification`, `Version Single Source Decision` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 40`** (2 nodes): `runWave()`, `cli-show.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `runWave()`, `cli-list.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `runWaveTheme()`, `smooth-gradient-output.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `createMockDictionary()`, `inherit-color-sketch-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `theme-command-current-fallback.test.ts`, `runWaveTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `theme-command-current-behavior.test.ts`, `runWaveTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `createMockDictionary()`, `inherit-color-css-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `createMockDictionary()`, `inherit-color-flat-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `createMockDictionary()`, `sketch-component-format.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `buildResolved()`, `pair-extractor.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `runWave()`, `cli-doctor.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `themefile.ts`, `parseThemefile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `theme-yaml.ts`, `parseThemeYaml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `variants.ts`, `detectVariants()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `exit()`, `logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `Console Logger`, `Exit Helper`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `Color space conversion`, `Theme transformer target color space conversion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `css-var-transform.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `smooth-gradient-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `doctor-pairs-schema.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `extends-resolver.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `inherit-color-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `resource-validation.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `doctor-runner.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `smooth-shadow-contract.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `theme-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `themefile-resource-parser.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `color-space.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `inherit-color-schema.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `resource-resolver.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `smooth-shadow-transformer.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `doctor-contrast-score.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `resource-merge.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `theme-service.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `inherit-color-attr.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `dimension.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `palette.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `smoothGradient Extension`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `smoothShadow Extension`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `valueCssVarTransform`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `createMockDataSources`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `resolveResource` and `wave list built-in resources test`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `resolveReferences` and `Circular reference failure case`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `generateTheme` connect `Theme Pipeline & Generation` to `Test Fixture Management`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `theme Command` connect `Documentation & Config` to `CLI Commands & Guides`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `Theme Doctor Context` connect `Doctor Contrast Checking` to `CLI Tests`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `Sketch Output`, `Designer Swiss Army Knife Vision`, `Style Dictionary` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Theme Reference Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._