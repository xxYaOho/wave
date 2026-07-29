import type {
	SketchPropertyMap,
	WaveFormatFn,
	WaveToken,
} from '../../../types/index.ts';
import { REFERENCE_PATTERN } from '../../resolver/reference-utils.ts';
import {
	normalizeFontFamilyMember,
	type ParsedTypographyDimension,
	parseTypographyDimension,
	parseTypographyLineHeight,
	parseTypographyNumber,
} from '../../typography-value.ts';

interface SketchShadowLayer {
	x: number;
	y: number;
	blur: number;
	spread: number;
	color: string;
	inset?: boolean;
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

function tokenPathLabel(token: WaveToken): string {
	return token.path.join('.');
}

function sketchPlatformError(token: WaveToken, reason: string): Error {
	return new Error(
		`Sketch output failed at ${tokenPathLabel(token)} (type "${token.type ?? 'unknown'}", _targetColorSpace "${token._targetColorSpace ?? 'hex'}"): ${reason}`,
	);
}

function roundTo(value: number, places: number): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function toSketchTypographyLength(
	dimension: ParsedTypographyDimension,
	token: WaveToken,
): number {
	if (dimension.unit === 'em' || dimension.unit === '%') {
		throw sketchPlatformError(
			token,
			`unit "${dimension.unit}" cannot be represented by a Sketch numeric typography property`,
		);
	}
	if (dimension.unit !== 'rem') return dimension.value;
	const baseFontSize = token._typographyBaseFontSize;
	if (
		baseFontSize === undefined ||
		!Number.isFinite(baseFontSize) ||
		baseFontSize <= 0
	) {
		throw new Error('rem dimensions require typography baseFontSize');
	}
	return roundTo(dimension.value * baseFontSize, 3);
}

function assertHexColor(color: string, token: WaveToken): void {
	if (/^#[0-9a-fA-F]{3,4}$/.test(color)) return;
	if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) return;
	throw sketchPlatformError(
		token,
		`color "${color}" cannot be represented as Sketch HEX8`,
	);
}

function formatSketchColorValue(
	token: WaveToken,
	value: unknown,
	field: string,
): string {
	if (typeof value !== 'string') {
		const hasNone =
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			Array.isArray((value as Record<string, unknown>).components) &&
			((value as Record<string, unknown>).components as unknown[]).includes(
				'none',
			);
		throw sketchPlatformError(
			token,
			hasNone
				? `${field} contains "none" and has no hex fallback for Sketch`
				: `${field} is not a transformer-normalized hex color`,
		);
	}
	assertHexColor(value, token);
	return hexToSketchColor(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function parseSketchNativeLength(
	value: unknown,
	token: WaveToken,
	field: string,
): number {
	if (isFiniteNumber(value)) return value;
	if (typeof value === 'string') {
		const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|pt)$/);
		if (match) return Number(match[1]);
	}
	throw sketchPlatformError(
		token,
		`${field} requires a finite number or px/pt dimension; received ${JSON.stringify(value)}`,
	);
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
		return parseSketchNativeLength(value, token, 'property.cornerRadius');
	}

	return typeof value === 'string' ? parseFloat(value) : value;
}

function processShadowLayer(
	layer: Record<string, unknown>,
	token: WaveToken,
): SketchShadowLayer {
	return {
		x: parseSketchNativeLength(layer.offsetX, token, 'shadow.offsetX'),
		y: parseSketchNativeLength(layer.offsetY, token, 'shadow.offsetY'),
		blur: parseSketchNativeLength(layer.blur, token, 'shadow.blur'),
		spread: parseSketchNativeLength(layer.spread, token, 'shadow.spread'),
		color: formatSketchColorValue(token, layer.color, 'shadow.color'),
		...(typeof layer.inset === 'boolean' && { inset: layer.inset }),
	};
}

function parseOutlineWidth(value: unknown, token: WaveToken): number {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return 0;
	}
	const width = (value as Record<string, unknown>).width;
	if (typeof width === 'object' && width !== null) {
		throw sketchPlatformError(
			token,
			'Sketch outline output requires transformer-normalized width',
		);
	}
	if (width === undefined) return 0;
	return parseSketchNativeLength(width, token, 'outline.width');
}

function outlineColor(value: unknown, token: WaveToken): string {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return '#000000';
	}
	const color = (value as Record<string, unknown>).color;
	if (typeof color === 'object' && color !== null) {
		throw sketchPlatformError(
			token,
			'Sketch outline output requires transformer-normalized color',
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

function formatSketchColorSlot(
	token: WaveToken,
	color: unknown,
	colorReferencePaths: Map<string, string>,
): string {
	const reference = token._sketchColorReference;
	if (reference !== undefined) {
		const referencePath = colorReferencePaths.get(reference);
		if (referencePath !== undefined) return `@${referencePath}`;
		if (isInternalSketchColorReference(reference)) {
			throw new Error(
				`Sketch color reference target is not emitted at ${tokenPathLabel(token)}`,
			);
		}
	}
	return formatSketchColorValue(token, color, 'composite color');
}

function formatSketchTypography(
	token: WaveToken,
	colorReferencePaths: Map<string, string>,
): unknown {
	const value = token.value;
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(
			`Sketch typography requires an object at ${tokenPathLabel(token)}`,
		);
	}
	const obj = value as Record<string, unknown>;
	const textStyle: Record<string, unknown> = {};
	try {
		if (obj.color !== undefined && token._typographyColor === undefined) {
			formatSketchColorValue(token, obj.color, 'typography.color');
			throw new Error('typography.color is missing formatter metadata');
		}
		const fontFamily = selectSketchFontFamily(obj.fontFamily);
		if (fontFamily !== undefined) textStyle.fontFamily = fontFamily;

		const fontSize = parseTypographyDimension(obj.fontSize);
		if (fontSize === undefined || fontSize.value <= 0) {
			throw new Error('fontSize is invalid');
		}
		const sketchFontSize = toSketchTypographyLength(fontSize, token);
		textStyle.fontSize = sketchFontSize;

		const fontWeight = parseTypographyNumber(obj.fontWeight);
		if (fontWeight === undefined || fontWeight <= 0) {
			throw new Error('fontWeight is invalid');
		}
		textStyle.fontWeight = fontWeight;

		const lineHeight = parseTypographyLineHeight(obj.lineHeight);
		if (lineHeight === undefined || lineHeight.value <= 0) {
			throw new Error('lineHeight is invalid');
		}
		textStyle.lineHeight = Math.ceil(
			lineHeight.unit
				? toSketchTypographyLength(lineHeight, token)
				: sketchFontSize * lineHeight.value,
		);

		const letterSpacing = parseTypographyDimension(obj.letterSpacing);
		if (letterSpacing === undefined) {
			throw new Error('letterSpacing is invalid');
		}
		textStyle.kerning = toSketchTypographyLength(letterSpacing, token);

		if (token._typographyColor !== undefined) {
			textStyle.textColor = formatSketchColorSlot(
				token,
				token._typographyColor,
				colorReferencePaths,
			);
		}
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

function encodeJsonPointerSegment(segment: string): string {
	return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function hasSafeCurlyPath(path: string[]): boolean {
	return (
		path.every((segment) => !segment.includes('.')) &&
		REFERENCE_PATTERN.test(`{${path.join('.')}}`)
	);
}

function colorReferenceAliases(token: WaveToken): string[] {
	const pointer = token.path.map(encodeJsonPointerSegment).join('/');
	const aliases = [`#/${pointer}`, `#/${pointer}/$value`];
	if (hasSafeCurlyPath(token.path)) {
		aliases.unshift(`{${token.path.join('.')}}`);
	}
	return aliases;
}

function isInternalSketchColorReference(reference: string): boolean {
	return reference.startsWith('{theme.') || reference.startsWith('#/theme/');
}

function buildSketchColorReferencePaths(
	writeTokens: WaveToken[],
	filterLayer: number,
): Map<string, string> {
	const aliases = new Map<string, WaveToken>();
	const colorReferencePaths = new Map<string, string>();

	for (const token of writeTokens) {
		if (token.type !== 'color') continue;
		const referencePath = buildSketchReferencePath(token, filterLayer);

		for (const alias of colorReferenceAliases(token)) {
			const aliasOwner = aliases.get(alias);
			if (aliasOwner !== undefined && aliasOwner !== token) {
				throw new Error(
					`Duplicate Sketch color reference alias "${alias}" at ${tokenPathLabel(token)}`,
				);
			}
			aliases.set(alias, token);
			colorReferencePaths.set(alias, referencePath);
		}
	}

	return colorReferencePaths;
}

function buildOutputPath(token: WaveToken, filterLayer: number): string[] {
	const leafKey = getFilteredName(token, filterLayer);
	const sketchPath = token._sketch?.path;
	if (!sketchPath) return [leafKey];
	return [...sketchPath.split('/').filter(Boolean), leafKey];
}

function buildSketchReferencePath(
	token: WaveToken,
	filterLayer: number,
): string {
	return `/${buildOutputPath(token, filterLayer)
		.map(encodeJsonPointerSegment)
		.join('/')}`;
}

interface SketchOutputEntry {
	token: WaveToken;
	path: string[];
}

function compareOutputPaths(left: string[], right: string[]): number {
	const sharedLength = Math.min(left.length, right.length);
	for (let i = 0; i < sharedLength; i++) {
		if (left[i] === right[i]) continue;
		return left[i]! < right[i]! ? -1 : 1;
	}
	return left.length - right.length;
}

function assertUniqueSketchOutputPaths(
	writeTokens: WaveToken[],
	filterLayer: number,
): void {
	const entries: SketchOutputEntry[] = writeTokens
		.map((token) => ({ token, path: buildOutputPath(token, filterLayer) }))
		.sort((left, right) => compareOutputPaths(left.path, right.path));

	for (let i = 1; i < entries.length; i++) {
		const previous = entries[i - 1]!;
		const current = entries[i]!;
		const previousIsPrefix = previous.path.every(
			(segment, index) => segment === current.path[index],
		);
		if (!previousIsPrefix) continue;

		throw new Error(
			`Duplicate Sketch output path "${previous.path.join('/')}" conflicts with "${current.path.join('/')}" at ${tokenPathLabel(current.token)}`,
		);
	}
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

function formatSketchValue(
	token: WaveToken,
	allTokens: WaveToken[],
	colorReferencePaths: Map<string, string>,
): unknown {
	const propertyKey = dimensionPropertyKey(token);
	if (propertyKey) {
		if (propertyKey === 'cornerRadius') {
			return { corners: { radii: resolveDimensionValue(token, propertyKey) } };
		}
		return { [propertyKey]: resolveDimensionValue(token, propertyKey) };
	}

	if (token.type === 'typography') {
		return formatSketchTypography(token, colorReferencePaths);
	}

	if (token.type === 'color' || token.inheritColor === true) {
		if (
			token.type === 'color' &&
			token.inheritColor !== true &&
			extractColorFromValue(token.value) === undefined
		) {
			formatSketchColorValue(token, token.value, 'color');
		}
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
		const width = parseOutlineWidth(token.value, token);
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
					color: formatSketchColorSlot(token, color, colorReferencePaths),
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

	if (token.type === 'border') {
		if (
			typeof token.value !== 'object' ||
			token.value === null ||
			Array.isArray(token.value)
		) {
			throw sketchPlatformError(token, 'border requires a normalized object');
		}
		const value = token.value as Record<string, unknown>;
		return {
			value: {
				...value,
				color: formatSketchColorSlot(token, value.color, colorReferencePaths),
			},
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
				return {
					color: formatSketchColorValue(token, stop.color, 'gradient.color'),
					position: stop.position,
				};
			}),
		};
	}

	if (
		(token.type === 'number' || token.type === 'dimension') &&
		isRadiusSketchPath(token)
	) {
		const parsed = parseSketchNativeLength(token.value, token, 'radius');
		return { corners: { radii: parsed } };
	}

	return { value: token.value };
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
	const writeTokens = allTokens.filter(
		(token) =>
			shouldIncludeSketchToken(token, includeRootKeys) &&
			token._sketch?.skip !== true &&
			token.value !== undefined,
	);
	assertUniqueSketchOutputPaths(writeTokens, filterLayer);
	const colorReferencePaths = buildSketchColorReferencePaths(
		writeTokens,
		filterLayer,
	);

	for (const token of writeTokens) {
		const outputPath = buildOutputPath(token, filterLayer);
		const value = formatSketchValue(token, allTokens, colorReferencePaths);
		setNestedValue(result, outputPath, value, token);
	}

	return JSON.stringify(result, null, 2);
};
