# Sketch Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `$extensions.sketch.path` and `$extensions.sketch.property` for Sketch output, with strict validation, legacy `sketchMap` compatibility, swatch synchronization, and user documentation.

**Architecture:** Keep YAML parsing thin. Add a focused Sketch extension normalizer in the transformer layer, expose normalized `_sketch` metadata on `WaveToken`, and keep `sketchFormat()` responsible only for Sketch JSON serialization. Change `$extends` nested merge only for `$extensions.sketch`; non-Sketch same-name extensions keep current override behavior.

**Tech Stack:** TypeScript strict ESM, Bun test runner, pnpm scripts, existing Wave schema/resolver/transformer/generator pipeline.

---

## File Structure

- Create `src/core/transformer/sketch-extension.ts`: parse and validate resolved `$extensions.sketch`, normalize legacy `sketchMap`, validate resolved value shape for Sketch property mappings, and derive effective Sketch names.
- Modify `src/types/index.ts`: add `SketchExtension`, `SketchPropertyMap`, `_sketch`, and allow resolved shadow color objects to carry `_swatchName`.
- Modify `src/core/schema/theme.ts`: add `$extensions.sketch` schema validation and strict property/type checks for explicit `$type`.
- Modify `src/core/resolver/theme-reference.ts`: deep-merge only `$extensions.sketch` during `$extends`, and preserve non-Sketch override behavior.
- Modify `src/core/transformer/theme-transformer.ts`: call `parseSketchExtension()`, attach `_sketch`, preserve legacy `_sketchMap`, and propagate effective swatch paths where possible.
- Modify `src/core/generator/formats/sketch.ts`: use `_sketch.path` as Sketch JSON key for color/style/dimension output; use `_sketch.property` for `opacity` and `cornerRadius`; synchronize all existing swatch carriers.
- Add tests:
  - `tests/sketch-extension-schema.test.ts`
  - `tests/sketch-extension-transformer.test.ts`
  - `tests/sketch-extension-format.test.ts`
  - extend `tests/extends-resolver.test.ts` or add targeted tests for `$extensions.sketch` merge.
- Create `docs/design-token.md`: design-token user guide.
- Modify `MANUAL.md`: keep Design Token summary and link to `docs/design-token.md`.

## Task 1: Types And Normalizer

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/core/transformer/sketch-extension.ts`
- Test: `tests/sketch-extension-transformer.test.ts`

- [ ] **Step 1: Add failing transformer tests**

Add `tests/sketch-extension-transformer.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

function tokenByName(result: ReturnType<typeof transformToWaveTokens>, name: string) {
	const token = result.tokens.find((item) => item.name === name);
	if (!token) throw new Error(`Missing token ${name}`);
	return token;
}

describe('sketch extension transformer', () => {
	test('normalizes sketch.path and sketch.property', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: {
									path: 'foundation/interaction/hover',
									property: { opacity: true },
								},
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-interaction-hover');

		expect(token._sketch).toEqual({
			path: 'foundation/interaction/hover',
			property: { opacity: true },
		});
	});

	test('normalizes legacy sketchMap opacity', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: { sketchMap: 'opacity' },
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-interaction-hover');

		expect(token._sketch).toEqual({ property: { opacity: true } });
		expect(token._sketchMap).toBe('opacity');
	});

	test('explicit sketch.property wins over legacy sketchMap', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					radius: {
						card: {
							$type: 'dimension',
							$value: 8,
							$extensions: {
								sketchMap: 'opacity',
								sketch: { property: { cornerRadius: true } },
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-radius-card');

		expect(token._sketch).toEqual({ property: { cornerRadius: true } });
		expect(token._sketchMap).toBe('opacity');
	});
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
bun test tests/sketch-extension-transformer.test.ts
```

Expected: fail because `token._sketch` is undefined and `sketch-extension.ts` does not exist.

- [ ] **Step 3: Add types**

In `src/types/index.ts`, add before `WaveToken`:

```ts
export interface SketchPropertyMap {
	opacity?: true;
	cornerRadius?: true;
}

export interface SketchExtension {
	path?: string;
	property?: SketchPropertyMap;
}
```

Add to `WaveToken`:

```ts
	/** normalized Sketch-specific output hints */
	_sketch?: SketchExtension;
```

- [ ] **Step 4: Add normalizer**

Create `src/core/transformer/sketch-extension.ts`:

```ts
import type { SketchExtension, SketchPropertyMap } from '../../types/index.ts';

const LEGACY_SKETCH_MAP: Record<string, keyof SketchPropertyMap> = {
	opacity: 'opacity',
	cornerRadius: 'cornerRadius',
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProperty(value: unknown): SketchPropertyMap | undefined {
	if (!isRecord(value)) return undefined;

	const property: SketchPropertyMap = {};
	if (value.opacity === true) property.opacity = true;
	if (value.cornerRadius === true) property.cornerRadius = true;
	return Object.keys(property).length > 0 ? property : undefined;
}

export function parseSketchExtension(
	extensions: Record<string, unknown> | undefined,
): SketchExtension | undefined {
	if (!extensions) return undefined;

	const sketch = isRecord(extensions.sketch) ? extensions.sketch : undefined;
	const normalized: SketchExtension = {};

	if (sketch && typeof sketch.path === 'string' && sketch.path.trim() !== '') {
		normalized.path = sketch.path;
	}

	const explicitProperty = sketch ? parseProperty(sketch.property) : undefined;
	if (explicitProperty) {
		normalized.property = explicitProperty;
	} else if (typeof extensions.sketchMap === 'string') {
		const mapped = LEGACY_SKETCH_MAP[extensions.sketchMap];
		if (mapped) {
			normalized.property = { [mapped]: true } as SketchPropertyMap;
		}
	}

	return normalized.path || normalized.property ? normalized : undefined;
}
```

- [ ] **Step 5: Wire normalizer in transformer**

In `src/core/transformer/theme-transformer.ts`, import:

```ts
import { parseSketchExtension } from './sketch-extension.ts';
```

Inside `transformToken()`, before `sdValue`, add:

```ts
	const sketchExtension = parseSketchExtension(token.$extensions);
```

Add to `sdValue`:

```ts
			...(sketchExtension !== undefined && { _sketch: sketchExtension }),
```

- [ ] **Step 6: Run tests**

Run:

```bash
bun test tests/sketch-extension-transformer.test.ts tests/transform-to-wave-tokens.test.ts tests/format-sketch.test.ts
```

Expected: pass.

## Task 2: Schema Validation

**Files:**
- Modify: `src/core/schema/theme.ts`
- Test: `tests/sketch-extension-schema.test.ts`

- [ ] **Step 1: Add failing schema tests**

Create `tests/sketch-extension-schema.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';

function messages(tree: Record<string, unknown>): string[] {
	return validateThemeSchema(tree).issues.map((issue) => issue.message);
}

describe('sketch extension schema', () => {
	test('accepts path and supported property on number token under dimension root', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: {
									path: 'foundation/interaction/hover',
									property: { opacity: true },
								},
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
	});

	test('rejects unknown sketch property key', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: { property: { fillColor: true } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(messages(result as never)).toContain(
			'Unknown sketch property "fillColor". Supported properties: opacity, cornerRadius',
		);
	});

	test('rejects misspelled true value', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: { property: { opacity: 'ture' } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('sketch.property.opacity must be true'),
			),
		).toBe(true);
	});

	test('rejects color token using opacity property', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'color',
							$value: '#000000',
							$extensions: {
								sketch: { property: { opacity: true } },
							},
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('opacity requires $type "number" or "dimension"'),
			),
		).toBe(true);
	});

	test('rejects number property outside dimension root', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					accent: {
						$type: 'number',
						$value: 0.16,
						$extensions: {
							sketch: { property: { opacity: true } },
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes('must be under a dimension root'),
			),
		).toBe(true);
	});
});
```

- [ ] **Step 2: Run failing schema test**

Run:

```bash
bun test tests/sketch-extension-schema.test.ts
```

Expected: fail because `sketch` is unknown and no specific validation exists.

- [ ] **Step 3: Implement schema validation**

In `src/core/schema/theme.ts`:

Add `sketch` to `KNOWN_EXTENSIONS`.

Add helper functions near `validateInheritColor()`:

```ts
const SKETCH_PROPERTY_KEYS = new Set(['opacity', 'cornerRadius']);

function isDimensionPath(tokenPath: string): boolean {
	const parts = tokenPath.split('.');
	const themeIndex = parts[0] === 'theme' ? 1 : 0;
	return parts[themeIndex] === 'dimension';
}

function validateSketchExtension(
	extensions: Record<string, unknown>,
	tokenType: string | undefined,
	tokenPath: string,
	issues: ThemeSchemaIssue[],
): void {
	if (!('sketch' in extensions)) return;

	const sketch = extensions.sketch;
	if (typeof sketch !== 'object' || sketch === null || Array.isArray(sketch)) {
		issues.push({
			path: `${tokenPath}.$extensions.sketch`,
			level: 'error',
			message: 'sketch extension must be an object',
		});
		return;
	}

	const sketchObj = sketch as Record<string, unknown>;
	if ('path' in sketchObj) {
		if (typeof sketchObj.path !== 'string' || sketchObj.path.trim() === '') {
			issues.push({
				path: `${tokenPath}.$extensions.sketch.path`,
				level: 'error',
				message: 'sketch.path must be a non-empty string',
			});
		}
	}

	if (!('property' in sketchObj)) return;
	const property = sketchObj.property;
	if (typeof property !== 'object' || property === null || Array.isArray(property)) {
		issues.push({
			path: `${tokenPath}.$extensions.sketch.property`,
			level: 'error',
			message: 'sketch.property must be an object',
		});
		return;
	}

	const propertyObj = property as Record<string, unknown>;
	for (const [key, value] of Object.entries(propertyObj)) {
		if (!SKETCH_PROPERTY_KEYS.has(key)) {
			issues.push({
				path: `${tokenPath}.$extensions.sketch.property.${key}`,
				level: 'error',
				message: `Unknown sketch property "${key}". Supported properties: opacity, cornerRadius`,
			});
			continue;
		}
		if (value !== true) {
			issues.push({
				path: `${tokenPath}.$extensions.sketch.property.${key}`,
				level: 'error',
				message: `sketch.property.${key} must be true`,
			});
		}
		if (
			tokenType !== undefined &&
			tokenType !== 'number' &&
			tokenType !== 'dimension'
		) {
			issues.push({
				path: `${tokenPath}.$extensions.sketch.property.${key}`,
				level: 'error',
				message: `${key} requires $type "number" or "dimension", got "${tokenType}"`,
			});
		}
		if (!isDimensionPath(tokenPath)) {
			issues.push({
				path: `${tokenPath}.$extensions.sketch.property.${key}`,
				level: 'error',
				message: `sketch.property.${key} must be under a dimension root for Sketch dimension output`,
			});
		}
	}
}
```

Call it after `validateInheritColor(...)`:

```ts
			validateSketchExtension(extensions, tokenType, tokenPath, issues);
```

- [ ] **Step 4: Fix schema test helper if needed**

If the `messages(result as never)` helper is awkward, replace assertions with direct `result.issues.some(...)`; keep the expected message strings concrete.

- [ ] **Step 5: Run schema tests**

Run:

```bash
bun test tests/sketch-extension-schema.test.ts tests/inherit-color-schema.test.ts tests/composite-token.test.ts
```

Expected: pass.

## Task 3: `$extensions.sketch` Merge

**Files:**
- Modify: `src/core/resolver/theme-reference.ts`
- Test: `tests/extends-resolver.test.ts`

- [ ] **Step 1: Add failing resolver tests**

Append to `tests/extends-resolver.test.ts`:

```ts
test('deep merges only sketch extension fields during extends', () => {
	const tree = {
		base: {
			$extensions: {
				sketch: {
					path: 'foundation/base',
					property: { opacity: true },
				},
				smoothShadow: {
					step: 3,
					target: { alpha: 0.1 },
				},
			},
			child: { $value: 1, $type: 'number' },
		},
		derived: {
			$extends: '{base}',
			$extensions: {
				sketch: {
					property: { cornerRadius: true },
				},
				smoothShadow: {
					step: 4,
				},
			},
		},
	};

	const expanded = expandExtends(tree);

	expect(expanded.derived.$extensions.sketch).toEqual({
		path: 'foundation/base',
		property: { opacity: true, cornerRadius: true },
	});
	expect(expanded.derived.$extensions.smoothShadow).toEqual({ step: 4 });
});
```

- [ ] **Step 2: Run failing resolver test**

Run:

```bash
bun test tests/extends-resolver.test.ts
```

Expected: fail because `sketch.path` or `sketch.property.opacity` is lost.

- [ ] **Step 3: Implement scoped merge**

In `src/core/resolver/theme-reference.ts`, add helpers near `mergeGroups()`:

```ts
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeSketchExtension(
	parentSketch: unknown,
	childSketch: unknown,
): unknown {
	if (!isPlainObject(parentSketch) || !isPlainObject(childSketch)) {
		return childSketch;
	}

	const result: Record<string, unknown> = { ...parentSketch, ...childSketch };
	if (
		isPlainObject(parentSketch.property) &&
		isPlainObject(childSketch.property)
	) {
		result.property = {
			...parentSketch.property,
			...childSketch.property,
		};
	}
	return result;
}

function mergeExtensions(
	parentExtensions: unknown,
	childExtensions: unknown,
): unknown {
	if (!isPlainObject(parentExtensions) || !isPlainObject(childExtensions)) {
		return childExtensions;
	}

	const result: Record<string, unknown> = {
		...parentExtensions,
		...childExtensions,
	};
	if ('sketch' in parentExtensions && 'sketch' in childExtensions) {
		result.sketch = mergeSketchExtension(
			parentExtensions.sketch,
			childExtensions.sketch,
		);
	}
	return result;
}
```

Replace the `$extensions` merge branch in `mergeGroups()` with:

```ts
				if (key === '$extensions') {
					result[key] = mergeExtensions(result.$extensions, childValue) as
						| Record<string, unknown>
						| undefined;
				} else {
					result[key] = childValue;
				}
```

- [ ] **Step 4: Run resolver tests**

Run:

```bash
bun test tests/extends-resolver.test.ts tests/resource-resolver.test.ts
```

Expected: pass.

## Task 4: Sketch Formatter Paths And Properties

**Files:**
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/sketch-extension-format.test.ts`

- [ ] **Step 1: Add failing formatter tests**

Create `tests/sketch-extension-format.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import type { WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

describe('sketch extension format', () => {
	test('uses sketch.path as color key', () => {
		const out = sketchFormat([
			token({
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				type: 'color',
				value: '#0f172a',
				_sketch: { path: 'foundation/color/text/default' },
			}),
		]);
		const parsed = JSON.parse(out);
		expect(parsed.color['foundation/color/text/default']).toBe('#0f172aff');
		expect(parsed.color['text-default']).toBeUndefined();
	});

	test('uses sketch.path and property opacity for dimension token', () => {
		const out = sketchFormat([
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				type: 'number',
				value: 0.16,
				_sketch: {
					path: 'foundation/interaction/hover',
					property: { opacity: true },
				},
			}),
		]);
		const parsed = JSON.parse(out);
		expect(parsed.dimension['foundation/interaction/hover']).toEqual({
			opacity: 0.16,
		});
	});

	test('uses sketch.path and property cornerRadius for dimension token', () => {
		const out = sketchFormat([
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				type: 'dimension',
				value: 8,
				_sketch: {
					path: 'foundation/radius/card',
					property: { cornerRadius: true },
				},
			}),
		]);
		const parsed = JSON.parse(out);
		expect(parsed.dimension['foundation/radius/card']).toEqual({
			cornerRadius: 8,
		});
	});

	test('keeps legacy sketchMap fallback', () => {
		const out = sketchFormat([
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				type: 'number',
				value: 0.16,
				_sketchMap: 'opacity',
			}),
		]);
		const parsed = JSON.parse(out);
		expect(parsed.dimension['interaction-hover']).toEqual({ opacity: 0.16 });
	});

	test('uses sketch.path as style shadow key', () => {
		const out = sketchFormat([
			token({
				name: 'theme-style-shadow-1',
				path: ['theme', 'style', 'shadow', '1'],
				type: 'shadow',
				value: [{ color: '#00000033', offsetX: 0, offsetY: 4, blur: 8, spread: -2 }],
				_sketch: { path: 'foundation/elevation/1' },
			}),
		]);
		const parsed = JSON.parse(out);
		expect(parsed.style['foundation/elevation/1'].shadow[0]).toMatchObject({
			color: '#00000033',
			x: 0,
			y: 4,
			blur: 8,
			spread: -2,
		});
	});
});
```

- [ ] **Step 2: Run failing formatter tests**

Run:

```bash
bun test tests/sketch-extension-format.test.ts
```

Expected: fail because `sketch.ts` ignores `_sketch`.

- [ ] **Step 3: Add helpers in formatter**

In `src/core/generator/formats/sketch.ts`, add:

```ts
function sketchKey(token: WaveToken, fallback: string): string {
	return token._sketch?.path ?? fallback;
}

function dimensionPropertyKey(token: WaveToken): string | undefined {
	if (token._sketch?.property?.opacity === true) return 'opacity';
	if (token._sketch?.property?.cornerRadius === true) return 'cornerRadius';
	return token._sketchMap;
}
```

- [ ] **Step 4: Use `_sketch.path` keys**

Replace direct `styleKey` writes for color/style/dimension with `const outputKey = sketchKey(token, styleKey);`.

Examples:

```ts
if (rootKey === 'color') {
	colorGroup[sketchKey(token, styleKey)] = hexToSketchColor(String(tokenValue));
}
```

For style branches:

```ts
styleGroup[sketchKey(token, styleKey)] = result;
```

For dimension:

```ts
const outputKey = sketchKey(token, styleKey);
const propertyKey = dimensionPropertyKey(token);
if (propertyKey) {
	dimensionGroup[outputKey] = { [propertyKey]: dimValue };
} else {
	...
}
```

- [ ] **Step 5: Run formatter tests**

Run:

```bash
bun test tests/sketch-extension-format.test.ts tests/format-sketch.test.ts tests/sketch-component-format.test.ts
```

Expected: pass.

## Task 5: Swatch Synchronization

**Files:**
- Modify: `src/core/transformer/theme-transformer.ts`
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/sketch-extension-format.test.ts`

- [ ] **Step 1: Add failing swatch tests**

Append to `tests/sketch-extension-format.test.ts`:

```ts
test('component swatch follows referenced token sketch path', () => {
	const out = sketchFormat([
		token({
			name: 'theme-color-primary-main',
			path: ['theme', 'color', 'primary', 'main'],
			type: 'color',
			value: '#1872f0',
			_swatchName: 'color/primary-main',
			_sketch: { path: 'foundation/color/primary/main' },
		}),
		token({
			name: 'component-button-primary-background',
			path: ['component', 'button', 'primary', 'background'],
			type: 'color',
			value: '#1872f0',
			_composite: 'component.button.primary',
			_swatchName: 'color/primary-main',
			_order: 1,
		}),
	]);
	const parsed = JSON.parse(out);
	expect(parsed.component['button-primary'].fills[0].swatch).toBe(
		'foundation/color/primary/main',
	);
});

test('component shadow nested swatch follows referenced token sketch path', () => {
	const out = sketchFormat([
		token({
			name: 'theme-color-shadow',
			path: ['theme', 'color', 'shadow'],
			type: 'color',
			value: '#0f172b',
			_swatchName: 'color/shadow',
			_sketch: { path: 'foundation/color/shadow' },
		}),
		token({
			name: 'component-button-shadow',
			path: ['component', 'button', 'shadow'],
			type: 'shadow',
			value: [
				{
					color: { color: '#0f172b', _swatchName: 'color/shadow' },
					offsetX: 0,
					offsetY: 4,
					blur: 12,
					spread: 0,
				},
			],
			_composite: 'component.button',
			_order: 1,
		}),
	]);
	const parsed = JSON.parse(out);
	expect(parsed.component.button.shadows[0].swatch).toBe(
		'foundation/color/shadow',
	);
});
```

- [ ] **Step 2: Run failing swatch tests**

Run:

```bash
bun test tests/sketch-extension-format.test.ts
```

Expected: fail because swatch names remain legacy paths.

- [ ] **Step 3: Add effective swatch map in formatter**

In `sketchFormat()`, after sorting tokens, build:

```ts
	const effectiveSwatches = new Map<string, string>();
	for (const token of sortedTokens) {
		if (token._swatchName && token._sketch?.path) {
			effectiveSwatches.set(token._swatchName, token._sketch.path);
		}
	}
	const resolveSwatchName = (name: string | undefined): string | undefined =>
		name ? (effectiveSwatches.get(name) ?? name) : undefined;
```

Use `resolveSwatchName()`:

- In `resolveSketchColor()` return path, accept a swatch resolver parameter or post-process returned `swatchName`.
- In `addSketchSwatch()` calls, pass `resolveSwatchName(swatchName)`.
- In `processComponentShadowLayer()`, pass a resolver and rewrite nested `obj._swatchName`.

Minimal approach: change helper signatures:

```ts
type SwatchResolver = (name: string | undefined) => string | undefined;
```

Update `processComponentShadowLayer(layer, resolveSwatchName)` and `addSketchSwatch(base, resolveSwatchName(swatchName))`.

- [ ] **Step 4: Run swatch and legacy tests**

Run:

```bash
bun test tests/sketch-extension-format.test.ts tests/sketch-component-format.test.ts tests/inherit-color-sketch-format.test.ts
```

Expected: pass.

## Task 6: Integration Fixture And Docs

**Files:**
- Create: `tests/fixtures/themes/sketch-extensions/main.yaml`
- Create: `tests/fixtures/themes/sketch-extensions/themefile`
- Modify: `tests/cli-dt.test.ts`
- Create: `docs/design-token.md`
- Modify: `MANUAL.md`

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/themes/sketch-extensions/main.yaml`:

```yaml
$schema: "https://www.designtokens.org/tr/2025.10/format/"

$config:
  theme: sketch-extensions
  resource: {}
  parameter:
    outputDir: ./dist
    filterLayer: 1
  parameterGroup:
    sketch:
      platform:
        - sketch
      filterLayer: 1
    json:
      platform:
        - json
      filterLayer: 1

theme:
  color:
    $type: color
    text:
      default:
        $value: "#0f172a"
        $extensions:
          sketch:
            path: "foundation/color/text/default"
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
    radius:
      card:
        $type: dimension
        $value: 8
        $extensions:
          sketch:
            path: "foundation/radius/card"
            property:
              cornerRadius: true
```

Create `tests/fixtures/themes/sketch-extensions/themefile`:

```text
THEME sketch-extensions
PARAMETER platform sketch,json
PARAMETER output ./dist
PARAMETER filterLayer 1
```

- [ ] **Step 2: Add CLI fixture test**

In `tests/cli-dt.test.ts`, add a test near config-main tests:

```ts
test('dt build supports sketch extension path and property fixture', async () => {
	const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/sketch-extensions');
	const outputDir = path.join(rootDir, '.temp-test-sketch-extensions');
	await fs.rm(outputDir, { recursive: true, force: true });

	const result = await runWave(['dt', 'build', '-f', path.join(fixtureDir, 'main.yaml'), '-o', outputDir]);
	expect(result.exitCode).toBe(0);

	const sketch = JSON.parse(
		await fs.readFile(path.join(outputDir, 'sketch-extensions2sketch.json'), 'utf-8'),
	);
	expect(sketch.color['foundation/color/text/default']).toBe('#0f172aff');
	expect(sketch.dimension['foundation/interaction/hover']).toEqual({ opacity: 0.16 });
	expect(sketch.dimension['foundation/radius/card']).toEqual({ cornerRadius: 8 });

	const json = JSON.parse(
		await fs.readFile(path.join(outputDir, 'sketch-extensions.json'), 'utf-8'),
	);
	expect(json['color-text-default']).toBe('#0f172a');
});
```

Adjust helper names to match the existing `cli-dt.test.ts` utilities if needed.

- [ ] **Step 3: Add design-token docs**

Create `docs/design-token.md` with sections:

```md
# Wave Design Token 手册

本手册记录 `wave dt` 的完整用户向用法。Wave 总入口见 `../MANUAL.md`，内部行为快照见 `docs/SPEC.md`。

## 核心模型

`main.yaml` 是 token 内容来源。`$config` 是 design-token 的入口，声明 theme、resource、parameter 和 parameterGroup。

## 快速开始

```bash
wave dt
wave dt build -f ./main.yaml
wave dt --platform json --platform css --platform sketch
```

## Sketch 输出

Sketch 输出文件名是 `{theme}2sketch.json`。输出包含 `color`、`style`、`dimension`、`component` 等对象。Sketch 中的分组名称使用 slash 路径，例如 `foundation/color/text/default`。

## `$extensions.sketch`

`$extensions.sketch` 只影响 Sketch 输出，不改变 JSON/CSS token key。

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

`path` 会成为 Sketch JSON 对象 key：

```json
{
  "color": {
    "foundation/color/text/default": "#0f172aff"
  }
}
```

`property` 用于把 dimension/number token 的值映射到指定 Sketch 字段。第一版只支持 `opacity` 和 `cornerRadius`：

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

输出：

```json
{
  "dimension": {
    "foundation/interaction/hover": {
      "opacity": 0.16
    }
  }
}
```

`property.opacity` 和 `property.cornerRadius` 只能用于 `theme.dimension.*` 下的 `number` 或 `dimension` token。未知字段、拼错的 `true`、类型不匹配都会报错。

## 资源管理

```bash
wave dt show
wave dt status
wave dt update tailwindcss
```
```

- [ ] **Step 4: Link from MANUAL**

In `MANUAL.md`, under `## Design Token`, add near the top:

```md
完整 design-token 手册见 [`docs/design-token.md`](docs/design-token.md)。本节只保留常用入口。
```

Keep existing summary content; do not duplicate the new full manual.

- [ ] **Step 5: Run integration and docs checks**

Run:

```bash
bun test tests/cli-dt.test.ts tests/sketch-extension-format.test.ts tests/sketch-extension-schema.test.ts tests/sketch-extension-transformer.test.ts
rg -n "docs/design-token.md|\\$extensions.sketch|sketch.path" MANUAL.md docs/design-token.md
```

Expected: tests pass; rg finds the new manual link and sketch extension docs.

## Task 7: Full Verification

**Files:**
- All modified implementation, test, and docs files.

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
bun test tests/sketch-extension-schema.test.ts tests/sketch-extension-transformer.test.ts tests/sketch-extension-format.test.ts tests/extends-resolver.test.ts tests/format-sketch.test.ts tests/sketch-component-format.test.ts tests/inherit-color-sketch-format.test.ts tests/cli-dt.test.ts
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass.

- [ ] **Step 3: Run full tests if targeted tests pass**

Run:

```bash
bun test
```

Expected: pass or report unrelated existing failures separately.

- [ ] **Step 4: Sketch MCP note**

If a Sketch MCP tool is exposed in the implementation session, inspect a real Sketch document or fixture for slash-delimited swatch/shared style naming and record the result. If no Sketch MCP tool is exposed, record that limitation in the final implementation report.

- [ ] **Step 5: Final diff review**

Run:

```bash
git diff --stat
git diff -- src/core/schema/theme.ts src/core/transformer/theme-transformer.ts src/core/transformer/sketch-extension.ts src/core/generator/formats/sketch.ts src/core/resolver/theme-reference.ts src/types/index.ts
```

Expected: changes match the PRD and avoid unrelated refactors.

## Self-Review

- Spec coverage: path output, property whitelist, type/value checks, sketch-only merge, swatch synchronization, docs split, legacy sketchMap, and Sketch MCP limitation are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test commands remain.
- Type consistency: `_sketch`, `SketchExtension`, `SketchPropertyMap`, and `parseSketchExtension()` are named consistently across tasks.
