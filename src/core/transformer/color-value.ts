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

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDtcgColorObjectShape(value: unknown): value is DtcgColorObjectShape {
	return (
		isObject(value) &&
		typeof value.colorSpace === 'string' &&
		supportedDtcgColorSpaces.has(value.colorSpace) &&
		Array.isArray(value.components)
	);
}

function unwrapLegacyColorSpaceObject(value: unknown):
	| {
			color: DtcgColorObjectShape;
			alpha?: unknown;
	  }
	| undefined {
	if (!isObject(value)) return undefined;
	const keys = Object.keys(value);
	const colorKeys = keys.filter(
		(key) => key !== 'alpha' && key !== '_swatchName',
	);
	if (colorKeys.length !== 1) return undefined;

	const space = colorKeys[0]!;
	if (!supportedDtcgColorSpaces.has(space)) return undefined;
	const nested = value[space];
	if (!isDtcgColorObjectShape(nested)) return undefined;
	if (nested.colorSpace !== space) return undefined;
	return { color: nested, alpha: value.alpha };
}

function parseAlpha(value: unknown, tokenPath?: string): number {
	if (value === undefined) return 1;
	const alpha = typeof value === 'string' ? parseFloat(value) : value;
	if (typeof alpha !== 'number' || Number.isNaN(alpha)) {
		throw new ColorValueError(
			`Color alpha must be a number, got ${String(value)}`,
			tokenPath,
		);
	}
	if (alpha < 0 || alpha > 1) {
		throw new ColorValueError(
			`Color alpha must be between 0 and 1, got ${alpha}`,
			tokenPath,
		);
	}
	return alpha;
}

function alphaToHex(alpha: number): string {
	return Math.round(alpha * 255)
		.toString(16)
		.padStart(2, '0');
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
		throw new ColorValueError(
			result.error ?? 'Color conversion failed',
			tokenPath,
		);
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
			throw new ColorValueError(
				'DTCG color hex fallback must be #RRGGBB',
				tokenPath,
			);
		}
	}
	if (isComputableComponents(value)) {
		const result = convertColorSpace(
			{ ...value, alpha },
			targetFormat,
			tokenPath,
		);
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
		return normalizeFromHex(
			value.hex,
			targetFormat,
			tokenPath,
			'dtcg-hex-fallback',
			alpha,
		);
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
	if (isObject(value) && '$value' in value) {
		if (value.alpha !== undefined) {
			return normalizeColorValue(
				{ color: value.$value, alpha: value.alpha },
				targetFormat,
				tokenPath,
			);
		}
		return normalizeColorValue(value.$value, targetFormat, tokenPath);
	}
	if (isDtcgColorObjectShape(value)) {
		return normalizeDtcgColor(value, targetFormat, tokenPath);
	}
	const wrappedColor = unwrapLegacyColorSpaceObject(value);
	if (wrappedColor) {
		const alpha = parseAlpha(wrappedColor.alpha, tokenPath);
		return normalizeDtcgColor(
			wrappedColor.alpha === undefined
				? wrappedColor.color
				: { ...wrappedColor.color, alpha },
			targetFormat,
			tokenPath,
		);
	}
	if (isObject(value) && 'color' in value) {
		const alpha = parseAlpha(value.alpha, tokenPath);
		const color = value.color;
		if (typeof color === 'string') {
			return normalizeFromHex(
				color,
				targetFormat,
				tokenPath,
				'legacy-color',
				alpha,
			);
		}
		if (isDtcgColorObjectShape(color)) {
			return normalizeDtcgColor({ ...color, alpha }, targetFormat, tokenPath);
		}
		const wrappedColor = unwrapLegacyColorSpaceObject(color);
		if (wrappedColor) {
			return normalizeDtcgColor(
				{ ...wrappedColor.color, alpha },
				targetFormat,
				tokenPath,
			);
		}
	}
	throw new ColorValueError('Unsupported color value', tokenPath);
}
