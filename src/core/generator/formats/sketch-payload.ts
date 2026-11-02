import type {
	SketchAsset,
	SketchAssetKind,
	SketchColorAsset,
	SketchLayerAsset,
	SketchLayerShadow,
	SketchPayloadV2,
	SketchPropertyMap,
	SketchTextAsset,
	SketchTextPayload,
	WaveToken,
} from '../../../types/index.ts';
import {
	normalizeFontFamilyMember,
	type ParsedTypographyDimension,
	parseTypographyDimension,
	parseTypographyLineHeight,
	parseTypographyNumber,
} from '../../typography-value.ts';

/**
 * Sketch payload v2 assembler (sync-token protocol 10a/10b).
 *
 * Emits `{ meta, assets }`: one flat manifest keyed by explicit
 * `uuid / name / kind` records instead of the v1 nested tree. Hard switch:
 * there is no v1 compatibility path.
 */

export interface SketchPayloadAssembleOptions {
	themeId?: string | undefined;
	baseId?: string | undefined;
	/** Appearance mode; defaults to `day` when omitted (prefer explicit). */
	mode?: 'day' | 'night' | undefined;
	filterLayer: number;
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

/** Folds opacity/alpha modifiers into the HEX8 alpha channel. */
function foldHexAlpha(hex8: string, modifiers: number[]): string {
	const alphaByte = Number.parseInt(hex8.slice(7, 9), 16);
	const folded = modifiers.reduce(
		(acc, modifier) => acc * modifier,
		Number.isNaN(alphaByte) ? 255 : alphaByte,
	);
	const clamped = Math.max(0, Math.min(255, Math.round(folded)));
	return `${hex8.slice(0, 7)}${clamped.toString(16).padStart(2, '0')}`;
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
): SketchLayerShadow {
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

function isSketchFontWeightScale(value: number): boolean {
	return (
		Number.isInteger(value) && value >= 100 && value <= 900 && value % 100 === 0
	);
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
): { color: string; opacity?: number; alpha?: number } {
	const path = token.path;
	const value = token.value as
		| { color?: string; opacity?: number; _color?: string }
		| string
		| undefined;

	let colorValue: string | undefined;
	let opacityValue: number | undefined;
	let alphaValue: number | undefined;

	if (token.inheritColor === true) {
		const siblingSlot = token.inheritColorSiblingSlot;
		opacityValue = token.inheritColorOpacity;
		alphaValue = token.inheritColorAlpha;

		if (siblingSlot) {
			const siblingToken = findSiblingToken(allTokens, path, siblingSlot);
			if (siblingToken) {
				colorValue = extractColorFromValue(siblingToken.value);
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
	}

	return {
		color: colorValue,
		...(typeof opacityValue === 'number' && { opacity: opacityValue }),
		...(typeof alphaValue === 'number' && { alpha: alphaValue }),
	};
}

function getFilteredName(token: WaveToken, filterLayer: number): string {
	const path = token.path;
	if (filterLayer <= 0 || path.length <= filterLayer) {
		return token.name;
	}
	return path.slice(filterLayer).join('-');
}

/**
 * v2 asset name: `sketch.path` prefix joined with the filterLayer-trimmed
 * leaf, connected by slashes (decision 7). Slashes are plain data — names
 * never form a tree, so prefix overlap between two names is legal.
 */
function buildAssetName(token: WaveToken, filterLayer: number): string {
	const leafKey = getFilteredName(token, filterLayer);
	const sketchPath = token._sketch?.path;
	if (!sketchPath) return leafKey;
	return [...sketchPath.split('/').filter(Boolean), leafKey].join('/');
}

/**
 * Name uniqueness inside one payload, inheriting the v1 hard-error semantics.
 * Only exact equality collides; the orca-test "shadow" vs "shadow/elevation-*"
 * prefix shape is a legal coexistence under flat names.
 */
function assertUniqueAssetNames(
	writeTokens: WaveToken[],
	filterLayer: number,
): void {
	const owners = new Map<string, WaveToken>();
	for (const token of writeTokens) {
		const name = buildAssetName(token, filterLayer);
		const owner = owners.get(name);
		if (owner !== undefined) {
			throw new Error(
				`Duplicate Sketch asset name "${name}" at ${tokenPathLabel(token)} conflicts with ${tokenPathLabel(owner)}`,
			);
		}
		owners.set(name, token);
	}
}

function assembleColorAsset(
	token: WaveToken,
	allTokens: WaveToken[],
): SketchColorAsset {
	if (token.inheritColor !== true) {
		// Preserved non-hex color objects must fail with the field-specific
		// reason ("none" components / non-hex value) before the type check.
		if (extractColorFromValue(token.value) === undefined) {
			formatSketchColorValue(token, token.value, 'color');
		}
		// Validates the declared type and hex representability (v1 parity).
		resolveSketchColorValue(token);
	}
	const { color, opacity, alpha } = resolveSketchColor(token, allTokens);
	assertHexColor(color, token);
	let hex = hexToSketchColor(color);
	// Alpha/opacity overrides stay HEX8: folded into the alpha channel
	// (decision 6 — color records carry a single `color` field).
	const modifiers = [opacity, alpha].filter(isFiniteNumber);
	if (modifiers.length > 0) hex = foldHexAlpha(hex, modifiers);

	return {
		...(token.id !== undefined && { uuid: token.id }),
		name: '',
		kind: 'color',
		color: hex,
	};
}

function assembleTextAsset(token: WaveToken): SketchTextAsset {
	const value = token.value;
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(
			`Sketch typography requires an object at ${tokenPathLabel(token)}`,
		);
	}
	let text: SketchTextPayload;
	try {
		const obj = value as Record<string, unknown>;
		const payload: SketchTextPayload = {
			fontSize: 0,
			fontWeight: 0,
			lineHeight: 0,
			kerning: 0,
		};

		const fontFamily = selectSketchFontFamily(obj.fontFamily);
		if (fontFamily !== undefined) payload.fontFamily = fontFamily;

		const fontSize = parseTypographyDimension(obj.fontSize);
		if (fontSize === undefined || fontSize.value <= 0) {
			throw new Error('fontSize is invalid');
		}
		const sketchFontSize = toSketchTypographyLength(fontSize, token);
		payload.fontSize = sketchFontSize;

		const fontWeight = parseTypographyNumber(obj.fontWeight);
		if (fontWeight === undefined || fontWeight <= 0) {
			throw new Error('fontWeight is invalid');
		}
		if (!isSketchFontWeightScale(fontWeight)) {
			throw new Error(
				`fontWeight ${fontWeight} is off the Sketch 100-900 integer-hundred scale`,
			);
		}
		payload.fontWeight = fontWeight;

		const lineHeight = parseTypographyLineHeight(obj.lineHeight);
		if (lineHeight === undefined || lineHeight.value <= 0) {
			throw new Error('lineHeight is invalid');
		}
		payload.lineHeight = Math.ceil(
			lineHeight.unit
				? toSketchTypographyLength(lineHeight, token)
				: sketchFontSize * lineHeight.value,
		);

		const letterSpacing = parseTypographyDimension(obj.letterSpacing);
		if (letterSpacing === undefined) {
			throw new Error('letterSpacing is invalid');
		}
		payload.kerning = toSketchTypographyLength(letterSpacing, token);

		text = payload;
	} catch (error) {
		throw new Error(
			`Sketch typography output failed at ${tokenPathLabel(token)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return {
		...(token.id !== undefined && { uuid: token.id }),
		name: '',
		kind: 'text',
		text,
	};
}

function assembleLayerAsset(token: WaveToken): SketchLayerAsset {
	const propertyKey = dimensionPropertyKey(token);
	const asset: SketchLayerAsset = {
		...(token.id !== undefined && { uuid: token.id }),
		name: '',
		kind: 'layer',
	};

	if (propertyKey === 'opacity') {
		asset.opacity = resolveDimensionValue(token, propertyKey) as number;
		return asset;
	}
	if (propertyKey === 'cornerRadius') {
		asset.corners = {
			radii: resolveDimensionValue(token, propertyKey) as number,
		};
		return asset;
	}

	if (token.type === 'color' || token.inheritColor === true) {
		// Color with a sketch property is handled above; plain colors never
		// reach the layer branch (kind stays color). Defensive only.
		throw new Error(
			`Sketch layer output cannot represent color token at ${tokenPathLabel(token)}`,
		);
	}

	if (token.type === 'border' && token._outline) {
		const width = parseOutlineWidth(token.value, token);
		const offset = token._outline.offset;
		const color = outlineColor(token.value, token);
		assertHexColor(color, token);
		asset.shadows = [
			{
				x: 0,
				y: 0,
				blur: 0,
				spread: width + offset,
				color: formatSketchColorValue(token, color, 'outline color'),
			},
			{ x: 0, y: 0, blur: 0, spread: offset, color: '#ffffffff' },
		];
		return asset;
	}

	if (token.type === 'shadow') {
		const shadowArray = toObjectArray(token.value, 'shadow', token);
		asset.shadows = [...shadowArray]
			.reverse()
			.map((layer) => processShadowLayer(layer, token));
		return asset;
	}

	if (token.type === 'gradient') {
		const gradientArray = toObjectArray(token.value, 'gradient', token);
		asset.gradient = gradientArray.map((stop) => ({
			color: formatSketchColorValue(token, stop.color, 'gradient.color'),
			// DTCG gradient stops are number-validated at the schema layer.
			position: stop.position as number,
		}));
		return asset;
	}

	if (
		(token.type === 'number' || token.type === 'dimension') &&
		isRadiusSketchPath(token)
	) {
		asset.corners = {
			radii: parseSketchNativeLength(token.value, token, 'radius'),
		};
		return asset;
	}

	throw new Error(
		`Sketch payload v2 has no layer mapping for token at ${tokenPathLabel(token)} (type "${token.type ?? 'unknown'}")`,
	);
}

function shouldIncludeSketchToken(
	token: WaveToken,
	includeRootKeys?: string[],
): boolean {
	if (!includeRootKeys || includeRootKeys.length === 0) return true;
	const root = token.path[0] === 'theme' ? token.path[1] : token.path[0];
	return root !== undefined && includeRootKeys.includes(root);
}

/**
 * Writable token set: root-key scope, skip exclusions, and value-less slots
 * are excluded before name uniqueness and assembly (v1 preflight parity).
 */
export function buildSketchWriteTokens(
	allTokens: WaveToken[],
	options: { filterLayer: number; includeRootKeys?: string[] | undefined },
): WaveToken[] {
	return allTokens.filter(
		(token) =>
			shouldIncludeSketchToken(token, options.includeRootKeys) &&
			token._sketch?.skip !== true &&
			token.value !== undefined,
	);
}

/**
 * Builds the flat v2 manifest. Record order follows the source order of the
 * filtered token list; syncable kinds are color / text / layer. Ordinary
 * borders, generic dimensions, transitions, and unknown payloads produce no
 * record (payload scope = syncable assets only).
 */
export function assembleSketchPayload(
	writeTokens: WaveToken[],
	allTokens: WaveToken[],
	options: SketchPayloadAssembleOptions,
): SketchPayloadV2 {
	const { filterLayer } = options;
	assertUniqueAssetNames(writeTokens, filterLayer);

	const assets: SketchAsset[] = [];
	for (const token of writeTokens) {
		const name = buildAssetName(token, filterLayer);
		const kind = sketchAssetKind(token);
		if (kind === undefined) continue;

		let asset: SketchAsset;
		if (kind === 'color') {
			asset = assembleColorAsset(token, allTokens);
		} else if (kind === 'text') {
			asset = assembleTextAsset(token);
		} else {
			asset = assembleLayerAsset(token);
		}
		asset.name = name;
		assets.push(asset);
	}

	return {
		meta: {
			themeId: options.themeId ?? null,
			// Token Manage groups series by baseId (currentByBaseId). Main builds
			// historically omitted baseId; fall back to themeId so the series key
			// is never null when the document has an identity.
			baseId: options.baseId ?? options.themeId ?? null,
			// Day/Night share themeId; Token Manage distinguishes via mode.
			mode: options.mode === 'night' ? 'night' : 'day',
			version: 2,
		},
		assets,
	};
}

/**
 * Kind triage covering every syncable token shape (decision 6 / Task-2).
 * Returns undefined for shapes that exit the payload: ordinary borders,
 * generic dimensions, transitions, and unknown payloads produce no record
 * (payload scope = syncable assets only).
 */
export function sketchAssetKind(token: WaveToken): SketchAssetKind | undefined {
	if (dimensionPropertyKey(token) !== undefined) return 'layer';
	if (token.type === 'typography') return 'text';
	if (token.type === 'color' || token.inheritColor === true) return 'color';
	if (
		(token.type === 'border' && token._outline) ||
		token.type === 'shadow' ||
		token.type === 'gradient' ||
		((token.type === 'number' || token.type === 'dimension') &&
			isRadiusSketchPath(token))
	) {
		return 'layer';
	}
	return undefined;
}
