# DTCG Color Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support DTCG Color Module 2025.10 color objects across Wave build outputs while preserving legacy color syntax.

**Architecture:** Keep parser and resolver read-only with respect to output color semantics. Add one transformer-owned color normalization helper, then make transformer output stable values that CSS, JSON, JSONC, Sketch, and doctor can consume without re-parsing DTCG color objects. Preserve existing multi-platform output by letting the generator receive both the pass color space and the resolved source tree, so Sketch can render from a hex-normalized token set while CSS/JSON/JSONC keep the pass color space. Standard DTCG component typing stays `number | "none"`; Wave uses a wider internal shape only to route legacy percent-string objects with a valid `hex` fallback through normalization.

**Tech Stack:** TypeScript strict ESM, Bun test, pnpm scripts, existing Wave parser/resolver/transformer/generator pipeline, chroma-js.

---

## Scope

This plan implements the critic-gate approved DTCG Color v2 contract:

- Standard DTCG color requires `colorSpace` and `components`.
- `alpha` is optional and defaults to `1`.
- `hex` is optional, only a fallback, and only valid as `#RRGGBB`.
- `{ hex: "#0052f5" }` is not a new Wave syntax.
- Legacy `"#000000"`, `{ color: "#000000" }`, and `{ color: "#000000", alpha: 0.5 }` remain valid.
- Transformer owns color normalization. Generators do not parse `colorSpace/components/hex`.
- Multi-platform passes such as `json,css,sketch` remain supported. Sketch output uses a hex-normalized token set inside generation; it does not force the whole pass to hex.
- Repo fixtures are required regression coverage. `/Users/teatao/Projects/my-color/orca` is optional local smoke evidence only.

## File Structure

- Create `src/core/transformer/color-value.ts`: internal color normalization helper, alpha handling, DTCG fallback validation, legacy color handling, and `ColorValueError`.
- Modify `src/types/index.ts`: expand DTCG color types to include DTCG standard space names and `number | "none"` components.
- Modify `src/core/transformer/color-space.ts`: keep low-level chroma conversion functions focused on computable numeric spaces.
- Modify `src/core/transformer/theme-transformer.ts`: replace local color conversion helpers with `normalizeColorValue()` and apply it to color tokens, shadow colors, gradient colors, and current/inherit color paths.
- Modify `src/core/generator/token-generator.ts`: let generation receive the resolved source tree and create a hex-normalized token set only for the `sketch` platform when a pass color space is not hex.
- Modify `src/core/pipeline/theme-pipeline.ts`: return the resolved source tree with successful document processing without changing parser/resolver responsibilities.
- Modify `src/core/pipeline/theme-service.ts`: pass the resolved source tree and pass color space into every `generateTokens()` call that uses `processThemeDocument()`.
- Modify `src/core/generator/formats/css.ts`: fail fast if a formatter sees an object color value.
- Modify `src/core/generator/formats/sketch.ts`: fail fast if Sketch receives a non-hex color string where hex is required.
- Modify `src/cli/commands/show.ts`: display DTCG color components as CSS strings even when a component is `none`.
- Modify `src/core/doctor/contrast-evaluator.ts`: use the same normalization rules for DTCG fallback and keep `alpha < 1` as an error.
- Modify `tests/fixtures/themes/orca-realistic/custom/orca-brand.yaml`: add an orca-like fallback color fixture.
- Modify `tests/fixtures/themes/orca-realistic/main.yaml`: reference the orca-like fallback token in color, shadow, and gradient coverage.
- Modify tests listed per task.
- Modify `tests/cli-dt.test.ts`: lock build CLI failures for invalid DTCG color objects.
- Modify `tests/cli-show.test.ts`: lock `dt show tailwindcss` display output as CSS strings.
- Modify `docs/SPEC.md` and `manual/pages/design-token.md`.

---

### Task 1: Expand DTCG Color Types

**Files:**
- Modify: `src/types/index.ts`
- Test: `tests/color-space.test.ts`

- [ ] **Step 1: Write failing type guard tests**

Add these tests to `tests/color-space.test.ts` inside `describe('isDtcgColorSpaceValue', ...)`:

```ts
test('returns true for DTCG color with hex fallback', () => {
	const value = {
		colorSpace: 'oklch',
		components: [0.518, 0.251, 262.6],
		alpha: 1,
		hex: '#0052f5',
	};
	expect(isDtcgColorSpaceValue(value)).toBe(true);
});

test('returns true for DTCG color with none component', () => {
	const value = {
		colorSpace: 'hsl',
		components: ['none', 0, 100],
		hex: '#ffffff',
	};
	expect(isDtcgColorSpaceValue(value)).toBe(true);
});

test('returns true for DTCG standard space with fallback even when not computable by Wave v1', () => {
	const value = {
		colorSpace: 'display-p3',
		components: [1, 0, 1],
		hex: '#ff00ff',
	};
	expect(isDtcgColorSpaceValue(value)).toBe(true);
});

test('returns false for object with hex but without colorSpace and components', () => {
	expect(isDtcgColorSpaceValue({ hex: '#0052f5' })).toBe(false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test tests/color-space.test.ts
```

Expected: FAIL. At least the `none` and `display-p3` cases fail under the current guard.

- [ ] **Step 3: Update DTCG color types**

In `src/types/index.ts`, replace the current color type block:

```ts
export type ColorSpaceType = 'oklch' | 'srgb' | 'hsl';
export type ColorSpaceFormat = 'hex' | ColorSpaceType;

export interface DtcgColorSpaceValue {
	colorSpace: ColorSpaceType;
	components: number[];
	alpha?: number;
	hex?: string;
}
```

with:

```ts
export type ComputableColorSpaceType = 'oklch' | 'srgb' | 'hsl';
export type DtcgColorSpaceType =
	| ComputableColorSpaceType
	| 'srgb-linear'
	| 'hwb'
	| 'lab'
	| 'lch'
	| 'oklab'
	| 'display-p3'
	| 'a98-rgb'
	| 'prophoto-rgb'
	| 'rec2020'
	| 'xyz-d65'
	| 'xyz-d50';
export type ColorSpaceType = ComputableColorSpaceType;
export type ColorSpaceFormat = 'hex' | ComputableColorSpaceType;
export type DtcgColorComponent = number | 'none';

export interface DtcgColorSpaceValue {
	colorSpace: DtcgColorSpaceType;
	components: DtcgColorComponent[];
	alpha?: number;
	hex?: string;
}
```

Then replace the `isDtcgColorSpaceValue` return expression with:

```ts
const supportedSpaces: DtcgColorSpaceType[] = [
	'oklch',
	'srgb',
	'hsl',
	'srgb-linear',
	'hwb',
	'lab',
	'lch',
	'oklab',
	'display-p3',
	'a98-rgb',
	'prophoto-rgb',
	'rec2020',
	'xyz-d65',
	'xyz-d50',
];

return (
	'colorSpace' in obj &&
	'components' in obj &&
	typeof obj.colorSpace === 'string' &&
	supportedSpaces.includes(obj.colorSpace as DtcgColorSpaceType) &&
	Array.isArray(obj.components) &&
	obj.components.every((c) => typeof c === 'number' || c === 'none')
);
```

- [ ] **Step 4: Run focused test**

Run:

```bash
bun test tests/color-space.test.ts
```

Expected: PASS for the new type guard tests. Existing conversion tests may still pass because they use numeric computable spaces.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts tests/color-space.test.ts
git commit -m "feat(dt): accept standard DTCG color value shapes"
```

---

### Task 2: Add Transformer Color Normalization Helper

**Files:**
- Create: `src/core/transformer/color-value.ts`
- Modify: `src/core/transformer/color-space.ts`
- Test: `tests/color-value.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/color-value.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
	ColorValueError,
	normalizeColorValue,
	toSketchHex8,
} from '../src/core/transformer/color-value.ts';

describe('normalizeColorValue', () => {
	test('converts numeric DTCG oklch to hex', () => {
		const result = normalizeColorValue(
			{
				colorSpace: 'oklch',
				components: [0.518, 0.251, 262.6],
				hex: '#0052f5',
			},
			'hex',
			'theme.color.primary.main',
		);
		expect(result.value).toMatch(/^#[0-9a-f]{6}$/i);
		expect(result.source).toBe('dtcg-components');
	});

	test('falls back to six digit hex when components contain none', () => {
		const result = normalizeColorValue(
			{
				colorSpace: 'hsl',
				components: ['none', 0, 100],
				hex: '#ffffff',
			},
			'hex',
			'theme.color.white',
		);
		expect(result.value).toBe('#ffffff');
		expect(result.hex8).toBe('#ffffffff');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('falls back to six digit hex when components contain legacy percent strings', () => {
		const result = normalizeColorValue(
			{
				colorSpace: 'oklch',
				components: ['51.8%', 0.251, 262.6] as never,
				hex: '#0052f5',
			},
			'hex',
			'theme.color.primary.main',
		);
		expect(result.value).toBe('#0052f5');
		expect(result.hex8).toBe('#0052f5ff');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('rejects standalone hex object', () => {
		expect(() =>
			normalizeColorValue({ hex: '#0052f5' }, 'hex', 'theme.color.bad'),
		).toThrow(ColorValueError);
	});

test('rejects DTCG fallback hex with alpha channel', () => {
	expect(() =>
		normalizeColorValue(
				{
					colorSpace: 'oklch',
					components: ['none', 0, 0],
					hex: '#0052f5ff',
				},
				'hex',
				'theme.color.bad',
			),
		).toThrow('DTCG color hex fallback must be #RRGGBB');
});

test('rejects invalid hex fallback even when numeric components are computable', () => {
	expect(() =>
		normalizeColorValue(
			{
				colorSpace: 'oklch',
				components: [0.518, 0.251, 262.6],
				hex: '#0052f5ff',
			},
			'hex',
			'theme.color.bad',
		),
	).toThrow('DTCG color hex fallback must be #RRGGBB');
});

test('legacy explicit alpha overrides hex alpha', () => {
		const result = normalizeColorValue(
			{ color: '#11223380', alpha: 0.25 },
			'hex',
			'theme.color.overlay',
		);
		expect(result.value).toBe('#11223340');
		expect(result.hex8).toBe('#11223340');
	});

	test('converts legacy hex to requested color space', () => {
		const result = normalizeColorValue('#ff00ff', 'hsl', 'theme.color.accent');
		expect(result.value).toMatch(/^hsl\(/);
		expect(result.source).toBe('legacy-string');
	});
});

describe('toSketchHex8', () => {
	test('canonicalizes legacy hex forms', () => {
		expect(toSketchHex8('#fff')).toBe('#ffffffff');
		expect(toSketchHex8('#0000')).toBe('#00000000');
		expect(toSketchHex8('#112233')).toBe('#112233ff');
		expect(toSketchHex8('#11223380')).toBe('#11223380');
	});
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test tests/color-value.test.ts
```

Expected: FAIL with module not found for `color-value.ts`.

The `components: ['51.8%', ...]` test is an explicit legacy fallback-only case. It must not expand the public DTCG component type beyond `number | "none"`; the wider `isDtcgColorObjectShape()` helper is internal to `color-value.ts` and exists only to route such legacy objects to a valid `hex` fallback.

- [ ] **Step 3: Create `src/core/transformer/color-value.ts`**

Add:

```ts
import {
	type ColorSpaceFormat,
	type ComputableColorSpaceType,
	type DtcgColorSpaceType,
	type DtcgColorSpaceValue,
	isDtcgColorSpaceValue,
} from '../../types/index.ts';
import {
	convertColorSpace,
	hexToRgbComponents,
	isComputableColorSpace,
} from './color-space.ts';

export type NormalizedColorSource =
	| 'dtcg-components'
	| 'dtcg-hex-fallback'
	| 'legacy-string'
	| 'legacy-color';

export interface NormalizedColor {
	value: string;
	alpha: number;
	hex6?: string;
	hex8?: string;
	source: NormalizedColorSource;
}

export class ColorValueError extends Error {
	constructor(
		message: string,
		readonly tokenPath?: string,
	) {
		super(tokenPath ? `${message} at ${tokenPath}` : message);
		this.name = 'ColorValueError';
	}
}

interface DtcgColorObjectShape {
	colorSpace: DtcgColorSpaceType | string;
	components: unknown[];
	alpha?: unknown;
	hex?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const supportedDtcgColorSpaces = new Set<string>([
	'oklch',
	'srgb',
	'hsl',
	'srgb-linear',
	'hwb',
	'lab',
	'lch',
	'oklab',
	'display-p3',
	'a98-rgb',
	'prophoto-rgb',
	'rec2020',
	'xyz-d65',
	'xyz-d50',
]);

function isDtcgColorObjectShape(value: unknown): value is DtcgColorObjectShape {
	return (
		isObject(value) &&
		typeof value.colorSpace === 'string' &&
		supportedDtcgColorSpaces.has(value.colorSpace) &&
		Array.isArray(value.components)
	);
}

function parseAlpha(value: unknown, tokenPath?: string): number {
	if (value === undefined) return 1;
	const alpha = typeof value === 'string' ? parseFloat(value) : value;
	if (typeof alpha !== 'number' || Number.isNaN(alpha)) {
		throw new ColorValueError(`Color alpha must be a number, got ${String(value)}`, tokenPath);
	}
	if (alpha < 0 || alpha > 1) {
		throw new ColorValueError(`Color alpha must be between 0 and 1, got ${alpha}`, tokenPath);
	}
	return alpha;
}

function alphaToHex(alpha: number): string {
	return Math.round(alpha * 255).toString(16).padStart(2, '0');
}

function normalizeHexString(hex: string): string | undefined {
	const value = hex.trim().toLowerCase();
	if (/^#[0-9a-f]{3}$/.test(value)) {
		const [, r, g, b] = value;
		return `#${r}${r}${g}${g}${b}${b}`;
	}
	if (/^#[0-9a-f]{4}$/.test(value)) {
		const [, r, g, b, a] = value;
		return `#${r}${r}${g}${g}${b}${b}${a}${a}`;
	}
	if (/^#[0-9a-f]{6}$/.test(value)) return value;
	if (/^#[0-9a-f]{8}$/.test(value)) return value;
	return undefined;
}

export function toSketchHex8(color: string, alphaOverride?: number): string {
	const normalized = normalizeHexString(color);
	if (!normalized) return color;
	if (normalized.length === 7) {
		return `${normalized}${alphaToHex(alphaOverride ?? 1)}`;
	}
	if (alphaOverride !== undefined) {
		return `${normalized.slice(0, 7)}${alphaToHex(alphaOverride)}`;
	}
	return normalized;
}

function legacyHexAlpha(color: string): number {
	const components = hexToRgbComponents(color);
	return components?.alpha ?? 1;
}

function isComputableComponents(
	value: DtcgColorObjectShape,
): value is DtcgColorSpaceValue & {
	colorSpace: ComputableColorSpaceType;
	components: number[];
} {
	return (
		isDtcgColorSpaceValue(value) &&
		isComputableColorSpace(value.colorSpace) &&
		value.components.length === 3 &&
		value.components.every((component) => typeof component === 'number')
	);
}

function normalizeFromHex(
	color: string,
	targetFormat: ColorSpaceFormat,
	tokenPath: string | undefined,
	source: NormalizedColorSource,
	alphaOverride?: number,
): NormalizedColor {
	const normalized = normalizeHexString(color);
	if (!normalized) {
		throw new ColorValueError(`Invalid hex color value "${color}"`, tokenPath);
	}
	const alpha = alphaOverride ?? legacyHexAlpha(normalized);
	const hex6 = normalized.slice(0, 7);
	const hex8 = toSketchHex8(normalized, alpha);
	if (targetFormat === 'hex') {
		return {
			value: alpha < 1 ? hex8 : hex6,
			alpha,
			hex6,
			hex8,
			source,
		};
	}
	const components = hexToRgbComponents(hex8);
	if (!components) {
		throw new ColorValueError(`Invalid hex color value "${color}"`, tokenPath);
	}
	const result = convertColorSpace(
		{
			colorSpace: 'srgb',
			components: [
				components.red / 255,
				components.green / 255,
				components.blue / 255,
			],
			alpha,
		},
		targetFormat,
		tokenPath,
	);
	if (!result.success || result.value === undefined) {
		throw new ColorValueError(result.error ?? 'Color conversion failed', tokenPath);
	}
	return { value: result.value, alpha, hex6, hex8, source };
}

function normalizeDtcgColor(
	value: DtcgColorObjectShape,
	targetFormat: ColorSpaceFormat,
	tokenPath?: string,
): NormalizedColor {
	const alpha = parseAlpha(value.alpha, tokenPath);
	if (value.hex !== undefined) {
		if (typeof value.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.hex)) {
			throw new ColorValueError('DTCG color hex fallback must be #RRGGBB', tokenPath);
		}
	}
	if (isComputableComponents(value)) {
		const result = convertColorSpace({ ...value, alpha }, targetFormat, tokenPath);
		if (result.success && result.value !== undefined) {
			const fallbackHex6 =
				typeof value.hex === 'string' ? value.hex.toLowerCase() : undefined;
			return {
				value: result.value,
				alpha,
				hex6: targetFormat === 'hex' ? result.value.slice(0, 7) : fallbackHex6,
				hex8:
					targetFormat === 'hex'
						? toSketchHex8(result.value)
						: fallbackHex6
							? toSketchHex8(fallbackHex6, alpha)
							: undefined,
				source: 'dtcg-components',
			};
		}
	}
	if (typeof value.hex === 'string') {
		return normalizeFromHex(value.hex, targetFormat, tokenPath, 'dtcg-hex-fallback', alpha);
	}
	throw new ColorValueError(
		`Unsupported DTCG color "${value.colorSpace}" without a valid hex fallback`,
		tokenPath,
	);
}

export function normalizeColorValue(
	value: unknown,
	targetFormat: ColorSpaceFormat = 'hex',
	tokenPath?: string,
): NormalizedColor {
	if (typeof value === 'string') {
		return normalizeFromHex(value, targetFormat, tokenPath, 'legacy-string');
	}
	if (isDtcgColorObjectShape(value)) {
		return normalizeDtcgColor(value, targetFormat, tokenPath);
	}
	if (isObject(value) && 'color' in value) {
		const alpha = parseAlpha(value.alpha, tokenPath);
		const color = value.color;
		if (typeof color === 'string') {
			return normalizeFromHex(color, targetFormat, tokenPath, 'legacy-color', alpha);
		}
		if (isDtcgColorObjectShape(color)) {
			return normalizeDtcgColor({ ...color, alpha }, targetFormat, tokenPath);
		}
	}
	throw new ColorValueError('Unsupported color value', tokenPath);
}
```

- [ ] **Step 4: Add computable color-space helper**

In `src/core/transformer/color-space.ts`, update imports to include `type ComputableColorSpaceType` and add this export after imports:

```ts
export function isComputableColorSpace(
	colorSpace: string,
): colorSpace is ComputableColorSpaceType {
	return colorSpace === 'oklch' || colorSpace === 'srgb' || colorSpace === 'hsl';
}
```

Then update `createColorFromSpace` signature:

```ts
function createColorFromSpace(
	colorSpace: ComputableColorSpaceType,
	components: number[],
): chroma.Color {
```

Then update `convertColorSpace()` so it does not pass the wider `DtcgColorSpaceValue.colorSpace` directly into `createColorFromSpace()`. Add this guard before the `createColorFromSpace()` call:

```ts
	if (!isComputableColorSpace(colorValue.colorSpace)) {
		return {
			success: false,
			error: `Unsupported colorSpace: ${colorValue.colorSpace}`,
		};
	}

	if (!colorValue.components.every((component) => typeof component === 'number')) {
		return {
			success: false,
			error: formatError('components must be numeric for conversion', tokenPath),
		};
	}
```

After that guard, TypeScript can narrow `colorValue.colorSpace` to `ComputableColorSpaceType`:

```ts
const color = createColorFromSpace(
	colorValue.colorSpace,
	colorValue.components as number[],
);
```

- [ ] **Step 5: Run helper tests**

Run:

```bash
bun test tests/color-value.test.ts tests/color-space.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/transformer/color-value.ts src/core/transformer/color-space.ts tests/color-value.test.ts
git commit -m "feat(dt): normalize DTCG and legacy color values"
```

---

### Task 3: Wire Normalization Into Theme Transformer

**Files:**
- Modify: `src/core/transformer/theme-transformer.ts`
- Test: `tests/theme-transformer.test.ts`

- [ ] **Step 1: Write failing transformer tests**

Append these tests to `tests/theme-transformer.test.ts`:

```ts
describe('theme-transformer DTCG color fallback', () => {
	test('does not treat non-color string tokens as colors', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				content: {
					label: {
						$type: 'string',
						$value: 'Submit',
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-content-label').value).toBe('Submit');
	});

	test('uses DTCG hex fallback when components contain legacy percent string', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					primary: {
						main: {
							$value: {
								colorSpace: 'oklch',
								components: ['51.8%', 0.251, 262.6] as never,
								hex: '#0052f5',
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-color-primary-main').value).toBe(
			'#0052f5',
		);
	});

	test('uses DTCG hex fallback with alpha for shadow and gradient colors', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				style: {
					shadow: {
						$type: 'shadow',
						raised: {
							$value: [
								{
									color: {
										colorSpace: 'display-p3',
										components: [1, 0, 1],
										alpha: 0.5,
										hex: '#ff00ff',
									},
									offsetX: 0,
									offsetY: 4,
									blur: 8,
									spread: 0,
								},
							],
						},
					},
					gradient: {
						$type: 'gradient',
						accent: {
							$value: [
								{
									color: {
										colorSpace: 'hsl',
										components: ['none', 100, 50],
										alpha: 0.25,
										hex: '#ff0000',
									},
									position: 0,
								},
							],
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		const shadow = findToken(result.tokens, 'theme-style-shadow-raised')
			.value as Array<Record<string, unknown>>;
		const gradient = findToken(result.tokens, 'theme-style-gradient-accent')
			.value as Array<Record<string, unknown>>;
		expect(shadow[0]!.color).toBe('#ff00ff80');
		expect(gradient[0]!.color).toBe('#ff000040');
	});

	test('throws with token path when unsupported color lacks fallback', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					bad: {
						$value: {
							colorSpace: 'display-p3',
							components: [1, 0, 1],
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input, undefined, 'hex')).toThrow(
			'theme.color.bad',
		);
	});

	test('throws with token path for standalone hex object under color type', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					bad: {
						$value: {
							hex: '#0052f5',
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input, undefined, 'hex')).toThrow(
			'Unsupported color value at theme.color.bad',
		);
	});
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test tests/theme-transformer.test.ts
```

Expected: FAIL. The current transformer leaves percent-string DTCG objects unconverted and does not handle fallback in arrays.

- [ ] **Step 3: Replace local color helpers in transformer**

In `src/core/transformer/theme-transformer.ts`:

1. Remove local `isColorAlphaObject`, `alphaToHex`, and `convertColorWithAlpha`.
2. Remove imports of `convertColorSpace` and `hexToRgbComponents`.
3. Add:

```ts
import {
	ColorValueError,
	normalizeColorValue,
} from './color-value.ts';
```

4. Add these helpers near `processValue`:

```ts
function isLegacyColorObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'color' in value
	);
}

function isDtcgColorObjectCandidate(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'colorSpace' in value &&
		'components' in value
	);
}

function isStandaloneHexObject(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'hex' in value &&
		!('colorSpace' in value) &&
		!('components' in value)
	);
}

function shouldNormalizeScalarColor(
	value: DtcgValue,
	typeValue: string | undefined,
): boolean {
	return (
		typeValue === 'color' &&
		(typeof value === 'string' ||
			isDtcgColorSpaceValue(value) ||
			isDtcgColorObjectCandidate(value) ||
			isLegacyColorObject(value) ||
			isStandaloneHexObject(value))
	);
}
```

5. Change `processValue()` signature:

```ts
function processValue(
	value: DtcgValue,
	targetFormat: ColorSpaceFormat = 'hex',
	tokenPath?: string,
	typeValue?: string,
): DtcgValue {
```

6. At the top of `processValue()`, before the array branch, normalize only scalar color tokens:

```ts
	if (shouldNormalizeScalarColor(value, typeValue)) {
		return normalizeColorValue(value, targetFormat, tokenPath).value as DtcgValue;
	}
```

7. Keep the existing array branch, but pass the parent token type:

```ts
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			processArrayItem(item, targetFormat, `${tokenPath}[${index}]`, typeValue),
		) as unknown as DtcgValue;
	}
```

8. Change `processArrayItem()` signature and color branch:

```ts
function processArrayItem(
	item: unknown,
	targetFormat: ColorSpaceFormat,
	itemPath?: string,
	parentType?: string,
): unknown {
```

Use this branch inside its loop:

```ts
		if (
			(parentType === 'shadow' || parentType === 'gradient') &&
			key === 'color' &&
			(typeof val === 'string' ||
				isDtcgColorSpaceValue(val) ||
				isDtcgColorObjectCandidate(val) ||
				isLegacyColorObject(val))
		) {
			result[key] = normalizeColorValue(
				val,
				targetFormat,
				itemPath ? `${itemPath}.color` : undefined,
			).value;
		} else if (
```

- [ ] **Step 4: Preserve dimension and non-color string handling**

After the color branch in `processValue()`, keep the existing dimension branch and return original strings for non-color tokens:

```ts
	if (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'value' in value
	) {
		const obj = value as { value: number; unit?: string };
		return (obj.unit
			? `${obj.value}${obj.unit}`
			: String(obj.value)) as unknown as DtcgValue;
	}
	return value;
```

Then update `transformToken()` so it computes `typeValue` before processing:

```ts
const typeValue = token.$type ?? parentType;
let processedValue = processValue(
	token.$value,
	targetColorSpace,
	tokenPath,
	typeValue,
);
```

Update smooth shadow preprocessing:

```ts
const processedLayer =
	typeof processedValue === 'object' &&
	processedValue !== null &&
	!Array.isArray(processedValue)
		? processArrayItem(processedValue, targetColorSpace, tokenPath, 'shadow')
		: processedValue;
```

Update currentColor shadow preprocessing:

```ts
const processedLayer = processArrayItem(
	shadowRaw,
	targetColorSpace,
	tokenPath,
	'shadow',
) as Record<string, unknown>;
```

- [ ] **Step 5: Run transformer tests**

Run:

```bash
bun test tests/theme-transformer.test.ts tests/color-value.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/transformer/theme-transformer.ts tests/theme-transformer.test.ts
git commit -m "feat(dt): apply color normalization in transformer"
```

---

### Task 4: Preserve Multi-Platform Passes And Render Sketch From Hex Tokens

**Files:**
- Modify: `src/core/generator/token-generator.ts`
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Modify: `src/core/pipeline/theme-service.ts`
- Modify: `src/types/index.ts`
- Test: `tests/token-generator.test.ts`
- Test: `tests/themefile-group-pipeline.test.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Write failing multi-platform generator test**

Add this test to `tests/token-generator.test.ts`:

```ts
test('multi-platform pass keeps css colorSpace while sketch uses hex tokens', async () => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-gen-'));
	try {
		const resolved = {
			theme: {
				color: {
					$type: 'color',
					primary: {
						$value: {
							colorSpace: 'oklch',
							components: [0.518, 0.251, 262.6],
							hex: '#0052f5',
						},
					},
				},
			},
		} as ResolvedTokenGroup;
		const oklchTokens = transformToWaveTokens(resolved, undefined, 'oklch');
		const result = await generateTokens({
			themeName: 'multi-platform',
			outputDir: tempDir,
			tokens: oklchTokens.tokens,
			resolved,
			platform: ['css', 'sketch'],
			colorSpace: 'oklch',
		});

		expect(result.success).toBe(true);
		const css = await fs.readFile(path.join(tempDir, 'multi-platform.css'), 'utf-8');
		const sketch = JSON.parse(
			await fs.readFile(path.join(tempDir, 'multi-platform2sketch.json'), 'utf-8'),
		);
		expect(css).toContain('oklch(');
		expect(sketch['theme-color-primary']).toEqual({ color: expect.stringMatching(/^#[0-9a-f]{8}$/i) });
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
});
```

At the top of `tests/token-generator.test.ts`, add missing imports if needed:

```ts
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateTokens } from '../src/core/generator/token-generator.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';
```

- [ ] **Step 2: Add pass compatibility test**

Append this test to `describe('buildGroupPasses', ...)` in `tests/themefile-group-pipeline.test.ts`:

```ts
test('mixed sketch and css platform group remains supported', () => {
	const parsed = makeParsed({
		PARAMETER: { colorSpace: 'oklch', platform: 'css,sketch' },
	});

	const passes = buildGroupPasses(parsed, '/theme');
	expect(passes).toHaveLength(1);
	expect(passes[0]!.platforms).toEqual(['css', 'sketch']);
	expect(passes[0]!.colorSpace).toBe('oklch');
});
```

- [ ] **Step 3: Run tests to verify failure**

Add this integration test to `tests/integration/theme-service.test.ts` inside `describe('Theme Service Integration', ...)`:

```ts
test('no-main fallback renders sketch from hex tokens in mixed colorSpace pass', async () => {
	const tempThemeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-no-main-'));
	const outputDir = path.join(tempThemeDir, 'out');
	try {
		await fs.writeFile(
			path.join(tempThemeDir, 'palette.yaml'),
			[
				'custom:',
				'  color:',
				'    $type: color',
				'    primary:',
				'      $value:',
				'        colorSpace: oklch',
				'        components: [0.637, 0.237, 25.331]',
				'        hex: "#fb2c36"',
				'',
			].join('\n'),
			'utf-8',
		);
		await fs.writeFile(
			path.join(tempThemeDir, 'dimension.yaml'),
			[
				'custom:',
				'  dimension:',
				'    spacing:',
				'      $type: dimension',
				'      sm:',
				'        $value: 4',
				'',
			].join('\n'),
			'utf-8',
		);
		await fs.writeFile(
			path.join(tempThemeDir, 'themefile'),
			[
				'THEME no-main-mixed',
				'RESOURCE palette ./palette.yaml',
				'RESOURCE dimension ./dimension.yaml',
				'PARAMETER output ./out',
				'PARAMETER platform css,sketch',
				'PARAMETER colorSpace oklch',
				'',
			].join('\n'),
			'utf-8',
		);

		const result = await generateTheme({
			themeName: 'no-main-mixed',
			themePath: path.join(tempThemeDir, 'themefile'),
			generateOptions: { night: true, variants: false },
		});

		expect(result.ok).toBe(true);
		const css = await fs.readFile(
			path.join(outputDir, 'no-main-mixed.css'),
			'utf-8',
		);
		const sketch = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'no-main-mixed2sketch.json'),
				'utf-8',
			),
		);
		expect(css).toContain('oklch(');
		expect(sketch['color-primary']).toEqual({ color: '#fb2c36ff' });

		const nightCss = await fs.readFile(
			path.join(outputDir, 'no-main-mixed-night.css'),
			'utf-8',
		);
		const nightSketch = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'no-main-mixed-night2sketch.json'),
				'utf-8',
			),
		);
		expect(nightCss).toContain('oklch(');
		expect(nightSketch['color-primary']).toEqual({ color: '#fb2c36ff' });
	} finally {
		await fs.rm(tempThemeDir, { recursive: true, force: true });
	}
});
```

Add this second integration test to the same file to cover the real main, night, and variant service branches:

```ts
test('main night and variant mixed passes render sketch from hex tokens', async () => {
	const tempThemeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-mixed-branches-'));
	const outputDir = path.join(tempThemeDir, 'out');

	async function writeThemeYaml(filePath: string, hex: string): Promise<void> {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(
			filePath,
			[
				'theme:',
				'  color:',
				'    $type: color',
				'    primary:',
				'      $value:',
				'        colorSpace: oklch',
				'        components: [0.637, 0.237, 25.331]',
				`        hex: "${hex}"`,
				'',
			].join('\n'),
			'utf-8',
		);
	}

	try {
		await fs.writeFile(
			path.join(tempThemeDir, 'themefile'),
			[
				'THEME mixed-branches',
				'RESOURCE palette tailwindcss',
				'RESOURCE dimension wave',
				'PARAMETER output ./out',
				'PARAMETER platform css,sketch',
				'PARAMETER colorSpace oklch',
				'',
			].join('\n'),
			'utf-8',
		);
		await writeThemeYaml(path.join(tempThemeDir, 'main.yaml'), '#fb2c36');
		await writeThemeYaml(path.join(tempThemeDir, 'main@night.yaml'), '#0052f5');
		await writeThemeYaml(path.join(tempThemeDir, 'variants', 'dark.yaml'), '#1860dd');

		const result = await generateTheme({
			themeName: 'mixed-branches',
			themePath: path.join(tempThemeDir, 'themefile'),
			generateOptions: { night: true, variants: ['dark'] },
		});

		expect(result.ok).toBe(true);
		for (const suffix of ['', '-night', '-dark']) {
			const css = await fs.readFile(
				path.join(outputDir, `mixed-branches${suffix}.css`),
				'utf-8',
			);
			const sketch = JSON.parse(
				await fs.readFile(
					path.join(outputDir, `mixed-branches${suffix}2sketch.json`),
					'utf-8',
				),
			);
			expect(css).toContain('oklch(');
			expect(sketch['theme-color-primary']).toEqual({
				color: expect.stringMatching(/^#[0-9a-f]{8}$/i),
			});
		}
	} finally {
		await fs.rm(tempThemeDir, { recursive: true, force: true });
	}
});
```

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
bun test tests/token-generator.test.ts tests/themefile-group-pipeline.test.ts tests/integration/theme-service.test.ts
```

Expected: FAIL. `generateTokens()` does not yet accept `resolved` or `colorSpace`; Sketch receives the pass token list in main, night, variant, main no-main fallback, and night no-main fallback generation.

- [ ] **Step 5: Extend generator options**

In `src/core/generator/token-generator.ts`, update imports:

```ts
import type {
	ColorSpaceFormat,
	ResolvedTokenGroup,
	WaveFormatFn,
	WaveToken,
} from '../../types/index.ts';
import { transformToWaveTokens } from '../transformer/theme-transformer.ts';
```

Extend `GeneratorOptions`:

```ts
	resolved?: ResolvedTokenGroup;
	colorSpace?: ColorSpaceFormat;
```

Add helper above `generateTokens()`:

```ts
function tokensForPlatform(
	platform: string,
	tokens: WaveToken[],
	resolved: ResolvedTokenGroup | undefined,
	colorSpace: ColorSpaceFormat | undefined,
): WaveToken[] {
	if (platform !== 'sketch') return tokens;
	if (!resolved || colorSpace === 'hex') return tokens;
	return transformToWaveTokens(resolved, undefined, 'hex').tokens;
}
```

Inside `generateTokens()`, destructure `resolved` and `colorSpace`, then call format with platform tokens:

```ts
const {
	themeName,
	outputDir,
	tokens,
	platform,
	filterLayer,
	groupComments,
	resolved,
	colorSpace,
} = options;
```

Replace:

```ts
const out = def.format(tokens, formatOptions);
```

with:

```ts
const out = def.format(
	tokensForPlatform(normalized, tokens, resolved, colorSpace),
	formatOptions,
);
```

- [ ] **Step 6: Return resolved tree from document processing**

In `src/core/pipeline/theme-pipeline.ts`, update `processThemeDocument()` success return to include `resolved`:

```ts
return {
	ok: true,
	tree: transformResult.tokens,
	order: transformResult.tokens.map((t) => t.name),
	groupComments: transformResult.groupComments,
	resolved,
};
```

Update `ThemeDocumentSuccess` in `src/types/index.ts`:

```ts
resolved: ResolvedTokenGroup;
```

- [ ] **Step 7: Pass resolved tree from service generation**

In `src/core/pipeline/theme-service.ts`, update the main `generateTokens({ ... })` call after `const parseResult = await processThemeDocument(...)` to pass:

```ts
resolved: parseResult.resolved,
colorSpace: colorSpace as ColorSpaceFormat | undefined,
```

Use a normal top-level type import instead of inline `import(...)` if the file already imports from `../../types/index.ts`:

```ts
import {
	ExitCode,
	type ColorSpaceFormat,
	type ExitCodeType,
	type GenerateOptions,
} from '../../types/index.ts';
```

Then replace the existing inline cast in `processMainTheme()`:

```ts
colorSpace as ColorSpaceFormat | undefined,
```

For night and variant branches in the same file, update the `generateTokens({ ... })` calls fed by `processThemeDocument()`:

```ts
resolved: nightParseResult.resolved,
colorSpace: pass.colorSpace as ColorSpaceFormat | undefined,
```

and:

```ts
resolved: variantTokens.resolved,
colorSpace: pass.colorSpace as ColorSpaceFormat | undefined,
```

Update `generateThemeTokens()` signature in `src/core/pipeline/theme-service.ts`:

```ts
async function generateThemeTokens(
	themeName: string,
	outputDir: string,
	depResult: DependencyDictionary,
	platforms?: string[],
	filterLayer?: number,
	colorSpace?: ColorSpaceFormat,
): Promise<GeneratorResult> {
```

Change its transform call:

```ts
const transformResult = transformToWaveTokens(
	syntheticTree,
	undefined,
	colorSpace,
);
```

Change its `generateTokens()` call:

```ts
return generateTokens({
	themeName,
	outputDir,
	tokens: transformResult.tokens,
	resolved: syntheticTree,
	colorSpace,
	platform: platforms,
	filterLayer,
});
```

Then update the no-main call site in `processMainTheme()`:

```ts
const result = await generateThemeTokens(
	resolvedThemeName,
	outputDir,
	depResult,
	platforms,
	filterLayer,
	colorSpace as ColorSpaceFormat | undefined,
);
```

Also update the night no-main fallback branch inside `for (const pass of passes)` so it passes the pass color space:

```ts
const nightGenResult = await generateThemeTokens(
	`${resolvedThemeName}-night`,
	pass.outputDir,
	depResult,
	pass.platforms,
	pass.filterLayer,
	pass.colorSpace as ColorSpaceFormat | undefined,
);
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun test tests/token-generator.test.ts tests/themefile-group-pipeline.test.ts tests/integration/theme-service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/generator/token-generator.ts src/core/pipeline/theme-pipeline.ts src/core/pipeline/theme-service.ts src/types/index.ts tests/token-generator.test.ts tests/themefile-group-pipeline.test.ts tests/integration/theme-service.test.ts
git commit -m "feat(dt): render sketch from hex-normalized tokens"
```

---

### Task 5: Harden CSS And Sketch Generators

**Files:**
- Modify: `src/core/generator/formats/css.ts`
- Modify: `src/core/generator/formats/sketch.ts`
- Test: `tests/format-css.test.ts`
- Test: `tests/format-sketch.test.ts`

- [ ] **Step 1: Write failing CSS generator tests**

Append to `tests/format-css.test.ts`:

```ts
test('throws instead of emitting object color value', () => {
	const tokens: WaveToken[] = [
		{
			name: 'theme-color-primary',
			path: ['theme', 'color', 'primary'],
			value: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
			type: 'color',
			_order: 0,
		},
	];

	expect(() => cssVariablesFormat(tokens)).toThrow(
		'CSS output requires transformer-normalized value',
	);
});

test('formats normalized shadow and gradient colors without object leakage', () => {
	const tokens: WaveToken[] = [
		{
			name: 'theme-shadow-raised',
			path: ['theme', 'shadow', 'raised'],
			value: [
				{
					color: '#ff00ff80',
					offsetX: 0,
					offsetY: 4,
					blur: 8,
					spread: 0,
				},
			],
			type: 'shadow',
			_order: 0,
		},
		{
			name: 'theme-gradient-accent',
			path: ['theme', 'gradient', 'accent'],
			value: [{ color: '#ff000040', position: 0 }],
			type: 'gradient',
			_order: 1,
		},
	];

	const out = cssVariablesFormat(tokens);
	expect(out).not.toContain('[object Object]');
	expect(out).toContain('rgb(255 0 255 / 0.5)');
	expect(out).toContain('rgb(255 0 0 / 0.25)');
});
```

- [ ] **Step 2: Write failing Sketch generator tests**

Append to `tests/format-sketch.test.ts`:

```ts
test('throws when sketch receives non-hex color string', () => {
	const tokens: WaveToken[] = [
		{
			name: 'theme-color-primary-main',
			path: ['theme', 'color', 'primary', 'main'],
			value: 'oklch(52% 0.25 263)',
			type: 'color',
			_order: 0,
		},
	];

	expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
		'Sketch color output requires hex color',
	);
});

test('formats normalized shadow and gradient colors as hex8', () => {
	const tokens: WaveToken[] = [
		{
			name: 'theme-shadow-raised',
			path: ['theme', 'shadow', 'raised'],
			value: [
				{
					color: '#ff00ff80',
					offsetX: 0,
					offsetY: 4,
					blur: 8,
					spread: 0,
				},
			],
			type: 'shadow',
			_order: 0,
		},
		{
			name: 'theme-gradient-accent',
			path: ['theme', 'gradient', 'accent'],
			value: [{ color: '#ff000040', position: 0 }],
			type: 'gradient',
			_order: 1,
		},
	];

	const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
	expect(parsed['shadow-raised'].shadow[0].color).toBe('#ff00ff80');
	expect(parsed['gradient-accent'].gradient[0].color).toBe('#ff000040');
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
bun test tests/format-css.test.ts tests/format-sketch.test.ts
```

Expected: FAIL. CSS currently emits `[object Object]`; Sketch currently returns non-hex strings unchanged.

- [ ] **Step 4: Harden CSS formatter**

In `src/core/generator/formats/css.ts`, add this helper above `formatTokenValue()`:

```ts
function assertNoObjectColorValue(value: unknown, token: WaveToken): void {
	if (typeof value !== 'object' || value === null) return;
	throw new Error(
		`CSS output requires transformer-normalized value at ${token.path.join('.')}`,
	);
}
```

Then before `return String(tokenValue);`, add:

```ts
	assertNoObjectColorValue(tokenValue, token);
```

- [ ] **Step 5: Harden Sketch formatter**

In `src/core/generator/formats/sketch.ts`, add:

```ts
function assertHexColor(color: string, token: WaveToken): void {
	if (/^#[0-9a-fA-F]{3,4}$/.test(color)) return;
	if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) return;
	throw new Error(
		`Sketch color output requires hex color at ${tokenPathLabel(token)}`,
	);
}
```

Update `resolveSketchColorValue()` before return:

```ts
	assertHexColor(colorValue, token);
	return colorValue;
```

In `formatSketchValue()`, before every `hexToSketchColor(color)` call, call `assertHexColor(color, token)`. In `processShadowLayer()`, change signature to include token:

```ts
function processShadowLayer(
	layer: Record<string, unknown>,
	token: WaveToken,
): SketchShadowLayer {
	const color = String(layer.color);
	assertHexColor(color, token);
	return {
		x: cleanValue(layer.offsetX as number | string),
		y: cleanValue(layer.offsetY as number | string),
		blur: cleanValue(layer.blur as number | string),
		spread: cleanValue(layer.spread as number | string),
		color: hexToSketchColor(color),
	};
}
```

Then update the shadow map:

```ts
return { shadow: [...shadowArray].reverse().map((layer) => processShadowLayer(layer, token)) };
```

For gradient, check before converting:

```ts
gradient: gradientArray.map((stop) => {
	const color = String(stop.color);
	assertHexColor(color, token);
	return {
		color: hexToSketchColor(color),
		position: stop.position,
	};
}),
```

- [ ] **Step 6: Run generator tests**

Run:

```bash
bun test tests/format-css.test.ts tests/format-sketch.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/generator/formats/css.ts src/core/generator/formats/sketch.ts tests/format-css.test.ts tests/format-sketch.test.ts
git commit -m "fix(dt): reject unnormalized color values in generators"
```

---

### Task 6: Update Doctor Contrast Color Handling

**Files:**
- Modify: `src/core/doctor/contrast-evaluator.ts`
- Test: `tests/doctor-contrast-score.test.ts`

- [ ] **Step 1: Write failing doctor tests**

Append to `tests/doctor-contrast-score.test.ts`:

```ts
test('uses DTCG hex fallback for non-computable color', () => {
	const bg = {
		colorSpace: 'display-p3',
		components: [1, 1, 1],
		hex: '#ffffff',
	};
	const fg = {
		colorSpace: 'oklch',
		components: ['51.8%', 0.251, 262.6] as never,
		hex: '#0052f5',
	};
	const result = evaluateContrast(bg, fg);
	expect(result.success).toBe(true);
	expect(result.ratio).toBeGreaterThan(1);
});

test('returns invalid color error for DTCG color without computable components or fallback', () => {
	const result = evaluateContrast(
		{
			colorSpace: 'display-p3',
			components: [1, 0, 1],
		},
		'#ffffff',
	);
	expect(result.success).toBe(false);
	expect(result.error).toContain('Invalid background color value');
});

test('keeps alpha less than one unsupported after fallback', () => {
	const result = evaluateContrast(
		{
			colorSpace: 'display-p3',
			components: [1, 0, 1],
			alpha: 0.5,
			hex: '#ff00ff',
		},
		'#ffffff',
	);
	expect(result.success).toBe(false);
	expect(result.error).toContain('alpha < 1 not supported in v1');
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test tests/doctor-contrast-score.test.ts
```

Expected: FAIL. Current evaluator does not use fallback for unsupported or non-computable DTCG colors.

- [ ] **Step 3: Use normalization in contrast evaluator**

In `src/core/doctor/contrast-evaluator.ts`, import:

```ts
import { normalizeColorValue } from '../transformer/color-value.ts';
```

Replace the `if (isDtcgColorSpaceValue(value)) { ... }` block in `resolveColorToChroma()` with a normalization attempt for any non-null object. This intentionally uses the wider internal normalization semantics from `color-value.ts`, so legacy percent-string objects with a valid `hex` fallback behave the same in doctor as they do in build:

```ts
	if (typeof value === 'object' && value !== null) {
		try {
			const normalized = normalizeColorValue(value, 'hex');
			const color = chroma(normalized.value);
			return { color, alpha: normalized.alpha };
		} catch {
			return null;
		}
	}
```

Keep the existing string branch unchanged.

- [ ] **Step 4: Run doctor tests**

Run:

```bash
bun test tests/doctor-contrast-score.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/doctor/contrast-evaluator.ts tests/doctor-contrast-score.test.ts
git commit -m "fix(dt): support DTCG color fallback in contrast checks"
```

---

### Task 7: Add Orca-Like Fixture And Integration Coverage

**Files:**
- Modify: `tests/fixtures/themes/orca-realistic/custom/orca-brand.yaml`
- Modify: `tests/fixtures/themes/orca-realistic/main.yaml`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Add fixture token**

In `tests/fixtures/themes/orca-realistic/custom/orca-brand.yaml`, add `600-fallback` immediately after the existing `600` token and before `700`:

```yaml
      600-fallback:
        $value:
          colorSpace: oklch
          hex: "#0052f5"
          components: ["51.8%", 0.251, 262.6]
```

The surrounding block should remain:

```yaml
      600:
        $value: "#1872f0"
      600-fallback:
        $value:
          colorSpace: oklch
          hex: "#0052f5"
          components: ["51.8%", 0.251, 262.6]
      700:
        $value: "#1860dd"
```

- [ ] **Step 2: Reference fixture token in main theme**

In `tests/fixtures/themes/orca-realistic/main.yaml`, add `orcaFallback` under `theme.color`, immediately after `primary` and before `text`:

```yaml
    orcaFallback:
      main:
        $value: "{orca-brand.color.main.600-fallback}"
        $extensions:
          sketch:
            path: "foundation/color"
```

Then add `fallback` under the existing `theme.gradient` branch, immediately after `mask`:

```yaml
    fallback:
      $value:
        - color:
            $ref: "#/theme/color/orcaFallback/main/$value"
            alpha: 0.25
          position: 0
        - color: "#ffffff"
          position: 1
```

Finally, in the existing YAML path `theme -> style -> shadow -> raised -> $value`, replace the color reference:

```yaml
          color:
            $ref: "#/theme/color/inverse/surface/$value"
            alpha: 0.02
```

with:

```yaml
          color:
            $ref: "#/theme/color/orcaFallback/main/$value"
            alpha: 0.5
```

Keep the existing `smoothShadow` extension and numeric shadow fields unchanged.

- [ ] **Step 3: Write integration test**

Add this test to `tests/integration/theme-service.test.ts` inside `describe('Theme Service Integration', ...)`:

```ts
test('orca-realistic DTCG fallback color builds css and sketch', async () => {
	const fixtureDir = path.join(
		import.meta.dir,
		'..',
		'fixtures',
		'themes',
		'orca-realistic',
	);
	const outputDir = path.join(fixtureDir, 'theme');
	await fs.rm(outputDir, { recursive: true, force: true });

	try {
		const result = await generateTheme({
			themeName: 'orca-realistic',
			themePath: path.join(fixtureDir, 'main.yaml'),
			generateOptions: { night: false, variants: false },
		});

		expect(result.ok).toBe(true);
		const css = await fs.readFile(
			path.join(outputDir, 'css', 'orca-realistic.css'),
			'utf-8',
		);
		expect(css).toContain('--orcaFallback-main: #0052f5;');
		expect(css).toContain('rgb(0 82 245 / 0.5)');
		expect(css).toContain(
			'--fallback: linear-gradient(to right, rgb(0 82 245 / 0.25) 0%, #ffffff 100%);',
		);
		expect(css).not.toContain('[object Object]');

		const sketch = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'sketch', 'orca-realistic2sketch.json'),
				'utf-8',
			),
		);
		expect(sketch.foundation.color['orcaFallback-main']).toEqual({
			color: '#0052f5ff',
		});
		expect(JSON.stringify(sketch.foundation.shadow['shadow-raised'].shadow)).toContain(
			'#0052f5',
		);
		expect(sketch.foundation.gradient.fallback.gradient[0].color).toBe(
			'#0052f540',
		);
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});
```

The test uses the existing `generateTheme()` pattern from this file and cleans fixture output before and after the run.

- [ ] **Step 4: Run integration test**

Run:

```bash
bun test tests/integration/theme-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Optional local orca smoke**

Run only if the path exists:

```bash
if test -f /Users/teatao/Projects/my-color/orca/main.yaml; then
  pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --platform css --out .tmp/orca-css-preview --no-night --no-variants
  rg -n -- "--primary-main: #0052f5;" .tmp/orca-css-preview/orca.css
else
  echo "real orca smoke skipped: path missing"
fi
```

Expected if path exists: command exits 0 and `.tmp/orca-css-preview/orca.css` contains `--primary-main: #0052f5;`. If the path does not exist, report “real orca smoke skipped: path missing”.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/themes/orca-realistic tests/integration/theme-service.test.ts
git commit -m "test(dt): cover orca DTCG color fallback"
```

---

### Task 8: Lock Build Failure Contract For Invalid DTCG Colors

**Files:**
- Modify: `src/core/pipeline/theme-pipeline.ts`
- Test: `tests/cli-dt.test.ts`

- [ ] **Step 1: Add CLI failure tests**

Append this helper and tests inside `describe('wave dt', ...)` in `tests/cli-dt.test.ts`:

```ts
async function writeInvalidDtcgColorTheme(
	tempDir: string,
	valueLines: string[],
): Promise<void> {
	await fs.writeFile(
		path.join(tempDir, 'themefile'),
		[
			'THEME invalid-dtcg-color',
			'PARAMETER platform css',
			'',
		].join('\n'),
		'utf-8',
	);
	await fs.writeFile(
		path.join(tempDir, 'main.yaml'),
		[
			'theme:',
			'  color:',
			'    $type: color',
			'    bad:',
			'      $value:',
			...valueLines.map((line) => `        ${line}`),
			'',
		].join('\n'),
		'utf-8',
	);
}

async function expectInvalidDtcgColorBuildFailure(
	valueLines: string[],
	expectedMessage: string,
): Promise<void> {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-invalid-dtcg-'));
	try {
		await writeInvalidDtcgColorTheme(tempDir, valueLines);
		const result = await runWave([
			'dt',
			'build',
			'-f',
			path.join(tempDir, 'themefile'),
			'-o',
			path.join(tempDir, 'dist'),
		]);

		expect(result.exitCode).not.toBe(0);
		expect(`${result.stdout}\n${result.stderr}`).toContain(expectedMessage);
		expect(await Bun.file(path.join(tempDir, 'dist', 'invalid-dtcg-color.css')).exists()).toBe(false);
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
}

test('dt build rejects standalone hex object as color syntax', async () => {
	await expectInvalidDtcgColorBuildFailure(
		['hex: "#0052f5"'],
		'Unsupported color value at theme.color.bad',
	);
});

test('dt build rejects none components without hex fallback', async () => {
	await expectInvalidDtcgColorBuildFailure(
		['colorSpace: hsl', 'components: ["none", 0, 0]'],
		'Unsupported DTCG color "hsl" without a valid hex fallback at theme.color.bad',
	);
});

test('dt build rejects DTCG hex fallback with alpha channel', async () => {
	await expectInvalidDtcgColorBuildFailure(
		['colorSpace: oklch', 'components: ["none", 0, 0]', 'hex: "#0052f5ff"'],
		'DTCG color hex fallback must be #RRGGBB at theme.color.bad',
	);
});

test('dt build rejects invalid hex fallback even when components are computable', async () => {
	await expectInvalidDtcgColorBuildFailure(
		['colorSpace: oklch', 'components: [0.518, 0.251, 262.6]', 'hex: "#0052f5ff"'],
		'DTCG color hex fallback must be #RRGGBB at theme.color.bad',
	);
});

test('dt build rejects unsupported colorSpace without hex fallback', async () => {
	await expectInvalidDtcgColorBuildFailure(
		['colorSpace: display-p3', 'components: [1, 0, 1]'],
		'Unsupported DTCG color "display-p3" without a valid hex fallback at theme.color.bad',
	);
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
bun test tests/cli-dt.test.ts
```

Expected: FAIL. `ColorValueError` still escapes `processThemeDocument()` as an unclassified exception or has no stable CLI message.

- [ ] **Step 3: Convert color normalization errors into build failures**

In `src/core/pipeline/theme-pipeline.ts`, add this import:

```ts
import { ColorValueError } from '../transformer/color-value.ts';
```

Inside `processThemeDocument()` `catch (err)`, after the existing `UnresolvedReferenceError` branch and before `throw err`, add:

```ts
		if (err instanceof ColorValueError) {
			return {
				ok: false,
				reason: 'schema_error',
				message: err.message,
				exitCode: ExitCode.FORMAT_ERROR,
			};
		}
```

Do not catch generic `Error`; unexpected exceptions should still surface as implementation failures.

- [ ] **Step 4: Run CLI failure tests**

Run:

```bash
bun test tests/cli-dt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline/theme-pipeline.ts tests/cli-dt.test.ts
git commit -m "test(dt): lock invalid DTCG color build failures"
```

---

### Task 9: Preserve Tailwind Show Display Output

**Files:**
- Modify: `src/cli/commands/show.ts`
- Test: `tests/cli-show.test.ts`
- Test: `tests/resource-cache.test.ts`

- [ ] **Step 1: Strengthen `dt show tailwindcss` tests**

In `tests/cli-show.test.ts`, extend the existing `outputs flat-json for a palette by default` test after the `red.50` assertion:

```ts
		expect(parsed['tailwindcss.color.red.500']).toBe('oklch(63.7% 0.237 25.331)');
		expect(JSON.stringify(parsed)).not.toContain('"colorSpace"');
		expect(JSON.stringify(parsed)).not.toContain('"components"');
```

Then extend the existing `outputs color-space values as CSS strings in nested json` test after the `red['50'].$value` assertion:

```ts
	expect(parsed.tailwindcss.color.red['500'].$value).toBe(
		'oklch(63.7% 0.237 25.331)',
	);
	expect(typeof parsed.tailwindcss.color.red['500'].$value).toBe('string');
	expect(JSON.stringify(parsed)).not.toContain('"components"');
```

- [ ] **Step 2: Add `none` component display test**

Append this unit test to `tests/cli-show.test.ts`:

```ts
test('outputs none color components as CSS strings', async () => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-show-none-'));
	try {
		await fs.writeFile(
			path.join(tempDir, 'none-palette.yaml'),
			[
				'nonepalette:',
				'  color:',
				'    $type: color',
				'    neutral:',
				'      $value:',
				'        colorSpace: hsl',
				'        components: ["none", 0, 100]',
				'        hex: "#ffffff"',
				'',
			].join('\n'),
			'utf-8',
		);

		const { exitCode, stdout } = await runWave([
			'show',
			'palette',
			path.join(tempDir, 'none-palette.yaml'),
		]);

		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed['nonepalette.color.neutral']).toBe('hsl(none 0 100)');
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
});
```

- [ ] **Step 3: Update show color display formatter**

In `src/cli/commands/show.ts`, replace `formatColorSpaceValueForDisplay()` and add a component helper above it:

```ts
function formatColorComponentForDisplay(
	component: DtcgColorSpaceValue['components'][number] | undefined,
	options: { percent?: boolean } = {},
): string {
	if (component === undefined) return '0';
	if (component === 'none') return 'none';
	return options.percent
		? `${formatNumber(component * 100)}%`
		: formatNumber(component);
}

function formatColorSpaceValueForDisplay(value: DtcgColorSpaceValue): string {
	const [first, second, third] = value.components;
	const firstComponent = formatColorComponentForDisplay(first, {
		percent: value.colorSpace === 'oklch',
	});
	const alpha =
		value.alpha === undefined ? '' : ` / ${formatNumber(value.alpha)}`;
	return `${value.colorSpace}(${firstComponent} ${formatColorComponentForDisplay(second)} ${formatColorComponentForDisplay(third)}${alpha})`;
}
```

- [ ] **Step 4: Strengthen Tailwind v4 build cache regression**

In `tests/resource-cache.test.ts`, update the existing `tailwind v4 OKLCH cache builds to hex when colorSpace is hex` test. After `await updateTailwind('4');`, read the cache file:

```ts
const cachePath = path.join(
	tempHome,
	'.cache/wave/resources/tailwindcss.yaml',
);
const cachedResource = yaml.load(
	await fs.readFile(cachePath, 'utf-8'),
) as {
	tailwindcss: {
		color: {
			red: {
				'500': {
					$value: unknown;
				};
			};
		};
	};
};
expect(cachedResource.tailwindcss.color.red['500'].$value).toEqual({
	colorSpace: 'oklch',
	components: [0.637, 0.237, 25.331],
});
```

Then replace the loose JSON output assertion:

```ts
expect(output['theme-color-primary']).toMatch(/^#[0-9a-f]{6}$/i);
expect(output['theme-color-primary']).not.toContain('oklch');
```

with the exact assertion:

```ts
expect(output['theme-color-primary']).toBe('#fb2c36');
```

- [ ] **Step 5: Run show and cache tests**

Run:

```bash
bun test tests/cli-show.test.ts tests/resource-cache.test.ts
```

Expected: PASS. `dt show tailwindcss` outputs CSS color strings, while cached Tailwind v4 resource data remains DTCG object shaped for build.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/show.ts tests/cli-show.test.ts tests/resource-cache.test.ts
git commit -m "test(dt): preserve Tailwind show color display"
```

---

### Task 10: Update Documentation

**Files:**
- Modify: `docs/SPEC.md`
- Modify: `manual/pages/design-token.md`

- [ ] **Step 1: Locate manual design-token docs**

Run:

```bash
rg -n "dt build|design token|colorSpace|DTCG" manual docs/SPEC.md
```

Expected: paths in `manual/` and `docs/SPEC.md` that describe color token input/output.

- [ ] **Step 2: Replace `docs/SPEC.md` DTCG color section**

In `docs/SPEC.md`, replace the entire section from `## DTCG 色彩空间支持` through the `---` delimiter immediately before `## Wave 扩展` with:

````md
## DTCG 色彩空间支持

Wave 接受 DTCG Color Module 2025.10 风格颜色对象：

```yaml
$value:
  colorSpace: oklch
  components: [0.518, 0.251, 262.6]
  alpha: 1
  hex: "#0052f5"
```

- `colorSpace` 和 `components` 必填。
- `components` 可包含 number 或 `none`。
- `alpha` 可选，缺省为 1。
- `hex` 可选，只作为 fallback，且必须是 6 位 `#RRGGBB`。alpha 不写入 `hex`。
- `{ hex: "#0052f5" }` 不是合法 DTCG Color，也不是 Wave 语法。

当前可计算输出空间为 `hex`、`oklch`、`srgb`、`hsl`。其他 DTCG 标准色彩空间只有在提供合法 `hex` fallback 时才能输出；没有 fallback 时构建失败。

旧语法继续兼容：

```yaml
$value: "#000000"
```

```yaml
$value:
  color: "#000000"
  alpha: 0.5
```

颜色转换发生在 transformer 输出阶段，不发生在 parser、resource loader 或 resolver。同一个 `platform: css,sketch` pass 仍然合法；CSS/JSON/JSONC 使用 pass 指定的 `colorSpace`，Sketch 平台在生成阶段使用 hex-normalized token set，并输出 `#RRGGBBAA`。

---
````

- [ ] **Step 3: Update `manual/pages/design-token.md`**

In `manual/pages/design-token.md`, replace the whole `## 颜色和 alpha` section, from the `## 颜色和 alpha` heading through the paragraph before `## 输出格式`, with:

````md
## 颜色和 alpha

推荐用 DTCG 颜色对象描述颜色：

```yaml
primary:
  main:
    $value:
      colorSpace: oklch
      components: [0.518, 0.251, 262.6]
      hex: "#0052f5"
```

`hex` 是兼容输出用的 6 位 fallback。透明度请写在 `alpha`，不要写进 `hex`。

同一个构建可以同时输出 CSS 和 Sketch。CSS 会按 `colorSpace` 输出；Sketch 会输出 `#RRGGBBAA`。

旧语法继续可用。颜色和透明度可以分开写，`color` 和 `alpha` 都可以使用引用：

```yaml
inverse:
  surface:
    $description: 反色背景，常用于 Snackbar 或 Toast
    $value:
      color: "{tailwindcss.color.slate.900}"
      alpha: "{wave.dimension.alpha.800}"
```

构建时，Wave 会先解析引用，再按 `colorSpace` 输出最终颜色。
````

- [ ] **Step 4: Verify docs contain no stale rule**

Run:

```bash
rg -n "不支持的 colorSpace → 原样输出|components 格式错误 → 原样输出|\\[object Object\\]" docs manual
```

Expected: no stale claim that unsupported color objects are silently output as original values.

- [ ] **Step 5: Commit**

```bash
git add docs/SPEC.md manual
git commit -m "docs(dt): document DTCG color fallback contract"
```

---

### Task 11: Full Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
bun test tests/color-value.test.ts tests/color-space.test.ts tests/theme-transformer.test.ts tests/themefile-group-pipeline.test.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/doctor-contrast-score.test.ts tests/resource-cache.test.ts tests/cli-dt.test.ts tests/cli-show.test.ts tests/integration/theme-service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Run real-source smoke if available**

Run:

```bash
if test -f /Users/teatao/Projects/my-color/orca/main.yaml; then
  pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --platform css --out .tmp/orca-css-preview --no-night --no-variants
  rg -n -- "--primary-main: #0052f5;" .tmp/orca-css-preview/orca.css
  pnpm dev -- dt build -f /Users/teatao/Projects/my-color/orca/main.yaml --platform sketch --out .tmp/orca-sketch-preview --no-night --no-variants
  rg -n -- "#0052f5ff" .tmp/orca-sketch-preview
else
  echo "real orca smoke skipped: path missing"
fi
```

Expected: if local path exists, both builds exit 0 and `rg` finds expected color values. If path is missing, print the skip message.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat
git diff -- src/core/transformer/color-value.ts src/core/transformer/theme-transformer.ts src/core/pipeline/theme-pipeline.ts src/core/pipeline/theme-service.ts src/core/generator/token-generator.ts src/core/generator/formats/css.ts src/core/generator/formats/sketch.ts src/core/doctor/contrast-evaluator.ts src/cli/commands/show.ts tests/color-value.test.ts tests/color-space.test.ts tests/theme-transformer.test.ts tests/themefile-group-pipeline.test.ts tests/format-css.test.ts tests/format-sketch.test.ts tests/doctor-contrast-score.test.ts tests/resource-cache.test.ts tests/cli-dt.test.ts tests/cli-show.test.ts tests/integration/theme-service.test.ts tests/fixtures/themes/orca-realistic docs/SPEC.md manual/pages/design-token.md
```

Expected: diff is scoped to DTCG color normalization, pass colorSpace handling, generator guards, contrast fallback, tests, fixtures, and docs.

- [ ] **Step 6: Commit final verification notes if docs changed after tests**

If verification required follow-up doc edits, commit them:

```bash
git add docs/SPEC.md manual
git commit -m "docs(dt): align color docs with verified behavior"
```

If no files changed, do not create an empty commit.

---

## Self-Review

- Spec coverage: Tasks 1-3 cover DTCG object shape, fallback, old syntax, alpha, and transformer ownership. Task 4 covers per-pass Sketch hex behavior. Task 5 covers generator non-parsing and object-leak prevention. Task 6 covers doctor contrast. Task 7 covers repo fixture and real orca smoke boundary. Task 8 covers build failure behavior. Task 9 covers Tailwind display and cache regressions. Task 10 covers docs. Task 11 covers verification.
- Placeholder scan: The plan contains no forbidden placeholder steps.
- Type consistency: The plan defines `ComputableColorSpaceType`, `DtcgColorSpaceType`, `DtcgColorComponent`, `NormalizedColor`, `ColorValueError`, `normalizeColorValue()`, and `toSketchHex8()` before later tasks use them.
