import type {
	SketchPropertyMap,
	WaveFormatFn,
	WaveToken,
} from '../../../types/index.ts';
import {
	normalizeFontFamilyMember,
	parseTypographyDimension,
	parseTypographyLineHeight,
	parseTypographyNumber,
} from '../../typography-value.ts';

interface SketchShadowLayer {
	x: number | string;
	y: number | string;
	blur: number | string;
	spread: number | string;
	color: string;
}

function findSiblingToken(
	tokens: WaveToken[],
	currentPath: string[],
	siblingSlot: string,
): WaveToken | undefined {
	const parentPath = currentPath.slice(0, -1);
	const siblingPath = [...parentPath, siblingSlot];

	for (const token of tokens) {
		if (token.path.length === siblingPath.length) {
			const match = token.path.every((p, i) => p === siblingPath[i]);
			if (match) return token;
		}
	}
	return undefined;
}

function hexToSketchColor(hex: string): string {
	const value = hex.trim().toLowerCase();
	if (/^#[0-9a-f]{3}$/.test(value)) {
		const [, r, g, b] = value;
		return `#${r}${r}${g}${g}${b}${b}ff`;
	}
	if (/^#[0-9a-f]{4}$/.test(value)) {
		const [, r, g, b, a] = value;
		return `#${r}${r}${g}${g}${b}${b}${a}${a}`;
	}
	if (/^#[0-9a-f]{6}$/.test(value)) return `${value}ff`;
	if (/^#[0-9a-f]{8}$/.test(value)) return value;
	return hex;
}

function cleanValue(val: number | string): number | string {
	if (typeof val === 'string' && val.endsWith('px')) {
		const num = parseFloat(val);
		return Number.isNaN(num) ? val : num;
	}
	return val;
}

function tokenPathLabel(token: WaveToken): string {
	return token.path.join('.');
}

function assertHexColor(color: string, token: WaveToken): void {
	if (/^#[0-9a-fA-F]{3,4}$/.test(color)) return;
	if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) return;
	throw new Error(
		`Sketch color output requires hex color at ${tokenPathLabel(token)}`,
	);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function parseFiniteNumber(value: unknown): number | undefined {
	if (isFiniteNumber(value)) return value;
	if (typeof value !== 'string') return undefined;
	const parsed = parseFloat(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDimensionNumber(value: unknown): number | undefined {
	if (isFiniteNumber(value)) return value;
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const obj = value as Record<string, unknown>;
		if (obj.unit !== undefined && obj.unit !== 'px') return undefined;
		return parseDimensionNumber(obj.value);
	}
	if (typeof value !== 'string') return undefined;
	if (!/^-?\d+(?:\.\d+)?px$/.test(value.trim())) return undefined;
	return parseFiniteNumber(value);
}

function resolveSketchColorValue(token: WaveToken): string {
	if (token.type !== undefined && token.type !== 'color') {
		throw new Error(
			`Sketch color output requires type "color" at ${tokenPathLabel(token)}, got "${token.type}"`,
		);
	}

	const colorValue = extractColorFromValue(token.value);
	if (colorValue === undefined) {
		throw new Error(
			`Sketch color output requires a color value at ${tokenPathLabel(token)}`,
		);
	}
	assertHexColor(colorValue, token);
	return colorValue;
}

function toObjectArray(
	value: unknown,
	styleKind: string,
	token: WaveToken,
): Array<Record<string, unknown>> {
	if (Array.isArray(value)) {
		if (
			value.every(
				(item) =>
					typeof item === 'object' && item !== null && !Array.isArray(item),
			)
		) {
			return value as Array<Record<string, unknown>>;
		}
	} else if (typeof value === 'object' && value !== null) {
		return [value as Record<string, unknown>];
	}

	throw new Error(
		`Sketch ${styleKind} output requires an object or object array at ${tokenPathLabel(token)}`,
	);
}

function resolveDimensionValue(
	token: WaveToken,
	propertyKey?: string,
): unknown {
	const value = token.value;
	if (propertyKey === 'opacity') {
		if (!isFiniteNumber(value)) {
			throw new Error(
				`Sketch property opacity requires a finite number at ${tokenPathLabel(token)}`,
			);
		}
		return value;
	}

	if (propertyKey === 'cornerRadius') {
		const parsed = parseDimensionNumber(value);
		if (parsed === undefined) {
			throw new Error(
				`Sketch property cornerRadius requires a finite number or px dimension at ${tokenPathLabel(token)}`,
			);
		}
		return parsed;
	}

	return typeof value === 'string' ? parseFloat(value) : value;
}

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

function parseOutlineWidth(value: unknown): number {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return 0;
	}
	const width = (value as Record<string, unknown>).width;
	if (typeof width === 'object' && width !== null) {
		throw new Error(
			'Sketch outline output requires transformer-normalized width',
		);
	}
	const parsed = parseDimensionNumber(width);
	return parsed ?? 0;
}

function outlineColor(value: unknown, token: WaveToken): string {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return '#000000';
	}
	const color = (value as Record<string, unknown>).color;
	if (typeof color === 'object' && color !== null) {
		throw new Error(
			`Sketch outline output requires transformer-normalized color at ${tokenPathLabel(token)}`,
		);
	}
	return typeof color === 'string' ? color : '#000000';
}

const SKETCH_SYSTEM_FONT_ALIASES = new Set([
	'system',
	'system-ui',
	'-apple-system',
	'blinkmacsystemfont',
	'sans-serif',
	'serif',
	'monospace',
	'cursive',
	'fantasy',
	'ui-sans-serif',
	'ui-serif',
	'ui-monospace',
	'ui-rounded',
]);

function selectSketchFontFamily(value: unknown): string | undefined {
	if (typeof value === 'string') {
		const family = normalizeFontFamilyMember(value, false);
		if (family === undefined) {
			throw new Error('Sketch typography fontFamily is invalid');
		}
		return family;
	}
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('Sketch typography fontFamily must be a string or array');
	}
	const families = value.map((item) => {
		const family = normalizeFontFamilyMember(item);
		if (family === undefined) {
			throw new Error(
				'Sketch typography fontFamily array members must be non-empty strings',
			);
		}
		return family;
	});
	if (families.some((family) => family.toLowerCase() === 'pingfang sc')) {
		return 'PingFang SC';
	}
	return families.find(
		(family) => !SKETCH_SYSTEM_FONT_ALIASES.has(family.toLowerCase()),
	);
}

function formatSketchTypography(token: WaveToken): unknown {
	const value = token.value;
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(
			`Sketch typography requires an object at ${tokenPathLabel(token)}`,
		);
	}
	const obj = value as Record<string, unknown>;
	const textStyle: Record<string, unknown> = {};
	try {
		const fontFamily = selectSketchFontFamily(obj.fontFamily);
		if (fontFamily !== undefined) textStyle.fontFamily = fontFamily;

		const fontSize = parseTypographyDimension(obj.fontSize);
		if (fontSize === undefined || fontSize.value <= 0) {
			throw new Error('fontSize is invalid');
		}
		textStyle.fontSize = fontSize.value;

		const fontWeight = parseTypographyNumber(obj.fontWeight);
		if (fontWeight === undefined || fontWeight <= 0) {
			throw new Error('fontWeight is invalid');
		}
		textStyle.fontWeight = fontWeight;

		const lineHeight = parseTypographyLineHeight(obj.lineHeight);
		if (lineHeight === undefined || lineHeight.value <= 0) {
			throw new Error('lineHeight is invalid');
		}
		const resolvedLineHeight = lineHeight.unit
			? lineHeight.value
			: fontSize.value * lineHeight.value;
		textStyle.lineHeight = Math.round(resolvedLineHeight * 1000) / 1000;

		const letterSpacing = parseTypographyDimension(obj.letterSpacing);
		if (letterSpacing === undefined) {
			throw new Error('letterSpacing is invalid');
		}
		textStyle.kerning = letterSpacing.value;
	} catch (error) {
		throw new Error(
			`Sketch typography output failed at ${tokenPathLabel(token)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return { textStyle };
}

function pickSketchProperty(
	property: SketchPropertyMap | undefined,
): keyof SketchPropertyMap | undefined {
	if (property?.opacity === true) return 'opacity';
	if (property?.cornerRadius === true) return 'cornerRadius';
	return undefined;
}

function dimensionPropertyKey(token: WaveToken): string | undefined {
	return pickSketchProperty(token._sketch?.property);
}

function isRadiusSketchPath(token: WaveToken): boolean {
	const sketchPath = token._sketch?.path;
	if (!sketchPath) return false;
	const parts = sketchPath.split('/').filter(Boolean);
	return parts[parts.length - 1] === 'radius';
}

function extractColorFromValue(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>;
		if ('_color' in obj && typeof obj._color === 'string') return obj._color;
		if ('color' in obj && typeof obj.color === 'string') return obj.color;
	}
	return undefined;
}

function resolveSketchColor(
	token: WaveToken,
	allTokens: WaveToken[],
): { color: string; opacity?: number; alpha?: number; swatchName?: string } {
	const path = token.path;
	const value = token.value as
		| { color?: string; opacity?: number; _color?: string }
		| string
		| undefined;

	let colorValue: string | undefined;
	let opacityValue: number | undefined;
	let alphaValue: number | undefined;
	let swatchName: string | undefined;

	if (token.inheritColor === true) {
		const siblingSlot = token.inheritColorSiblingSlot;
		opacityValue = token.inheritColorOpacity;
		alphaValue = token.inheritColorAlpha;

		if (siblingSlot) {
			const siblingToken = findSiblingToken(allTokens, path, siblingSlot);
			if (siblingToken) {
				colorValue = extractColorFromValue(siblingToken.value);
				swatchName = siblingToken._swatchName;
			}
		}

		if (!colorValue) colorValue = '#ff00ff';
	} else {
		if (typeof value === 'string') {
			colorValue = value;
		} else if (
			typeof value === 'object' &&
			value !== null &&
			'color' in value
		) {
			colorValue = value.color!;
		}

		if (
			!colorValue &&
			typeof value === 'object' &&
			value !== null &&
			'_color' in value
		) {
			colorValue = String(value._color);
		}

		if (!colorValue) colorValue = '#ff00ff';

		if (typeof value === 'object' && value !== null && 'opacity' in value) {
			opacityValue = value.opacity as number;
		} else if (token.currentColorOpacity !== undefined) {
			opacityValue = token.currentColorOpacity;
		}

		swatchName = token._swatchName;
	}

	return {
		color: colorValue,
		...(typeof opacityValue === 'number' && { opacity: opacityValue }),
		...(typeof alphaValue === 'number' && { alpha: alphaValue }),
		...(swatchName !== undefined && { swatchName }),
	};
}

function getFilteredName(token: WaveToken, filterLayer: number): string {
	const path = token.path;
	if (filterLayer <= 0 || path.length <= filterLayer) {
		return token.name;
	}
	return path.slice(filterLayer).join('-');
}

function buildOutputPath(token: WaveToken, filterLayer: number): string[] {
	const leafKey = getFilteredName(token, filterLayer);
	const sketchPath = token._sketch?.path;
	if (!sketchPath) return [leafKey];
	return [...sketchPath.split('/').filter(Boolean), leafKey];
}

function shouldIncludeSketchToken(
	token: WaveToken,
	includeRootKeys?: string[],
): boolean {
	if (!includeRootKeys || includeRootKeys.length === 0) return true;
	const root = token.path[0] === 'theme' ? token.path[1] : token.path[0];
	return root !== undefined && includeRootKeys.includes(root);
}

function setNestedValue(
	root: Record<string, unknown>,
	parts: string[],
	value: unknown,
	token: WaveToken,
): void {
	let current = root;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i]!;
		const next = current[part];
		if (next === undefined) {
			current[part] = {};
			current = current[part] as Record<string, unknown>;
			continue;
		}
		if (typeof next !== 'object' || next === null || Array.isArray(next)) {
			throw new Error(
				`Duplicate Sketch output path "${parts.slice(0, i + 1).join('/')}" at ${tokenPathLabel(token)}`,
			);
		}
		current = next as Record<string, unknown>;
	}

	const leaf = parts[parts.length - 1]!;
	if (current[leaf] !== undefined) {
		throw new Error(
			`Duplicate Sketch output path "${parts.join('/')}" at ${tokenPathLabel(token)}`,
		);
	}
	current[leaf] = value;
}

function formatSketchValue(token: WaveToken, allTokens: WaveToken[]): unknown {
	const propertyKey = dimensionPropertyKey(token);
	if (propertyKey) {
		if (propertyKey === 'cornerRadius') {
			return { corners: { radii: resolveDimensionValue(token, propertyKey) } };
		}
		return { [propertyKey]: resolveDimensionValue(token, propertyKey) };
	}

	if (token.type === 'typography') {
		return formatSketchTypography(token);
	}

	if (token.type === 'color' || token.inheritColor === true) {
		const { color, opacity, alpha } = resolveSketchColor(token, allTokens);
		assertHexColor(color, token);
		if (typeof opacity === 'number' || typeof alpha === 'number') {
			return {
				color: hexToSketchColor(color),
				...(typeof opacity === 'number' && { opacity }),
				...(typeof alpha === 'number' && { alpha }),
			};
		}
		if (token.inheritColor === true) {
			return { color: hexToSketchColor(color) };
		}
		return { color: hexToSketchColor(resolveSketchColorValue(token)) };
	}

	if (token.type === 'border' && token._outline) {
		const width = parseOutlineWidth(token.value);
		const offset = token._outline.offset;
		const color = outlineColor(token.value, token);
		assertHexColor(color, token);
		return {
			shadow: [
				{
					x: 0,
					y: 0,
					blur: 0,
					spread: width + offset,
					color: hexToSketchColor(color),
				},
				{
					x: 0,
					y: 0,
					blur: 0,
					spread: offset,
					color: '#ffffffff',
				},
			],
		};
	}

	if (token.type === 'shadow') {
		const shadowArray = toObjectArray(token.value, 'shadow', token);
		return {
			shadow: [...shadowArray]
				.reverse()
				.map((layer) => processShadowLayer(layer, token)),
		};
	}

	if (token.type === 'gradient') {
		const gradientArray = toObjectArray(token.value, 'gradient', token);
		return {
			gradient: gradientArray.map((stop) => {
				const color = String(stop.color);
				assertHexColor(color, token);
				return {
					color: hexToSketchColor(color),
					position: stop.position,
				};
			}),
		};
	}

	if (
		(token.type === 'number' || token.type === 'dimension') &&
		isRadiusSketchPath(token)
	) {
		const parsed = parseDimensionNumber(token.value);
		if (parsed === undefined) {
			throw new Error(
				`Sketch radius path requires a finite number or px dimension at ${tokenPathLabel(token)}`,
			);
		}
		return { corners: { radii: parsed } };
	}

	return { value: resolveDimensionValue(token) };
}

export const sketchFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	const includeRootKeys = options?.includeRootKeys as string[] | undefined;
	const result: Record<string, unknown> = {};
	const allTokens = [...tokens].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);
	const emissionTokens = allTokens.filter(
		(token) =>
			shouldIncludeSketchToken(token, includeRootKeys) &&
			token._sketch?.skip !== true,
	);

	for (const token of emissionTokens) {
		if (token.value === undefined) continue;
		const outputPath = buildOutputPath(token, filterLayer);
		const value = formatSketchValue(token, allTokens);
		setNestedValue(result, outputPath, value, token);
	}

	return JSON.stringify(result, null, 2);
};
