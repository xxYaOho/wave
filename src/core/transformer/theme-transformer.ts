import chroma from 'chroma-js';
import {
	type ColorSpaceFormat,
	type DtcgValue,
	isResolvedToken,
	type ResolvedDtcgToken,
	type ResolvedTokenGroup,
	type TypographyDefaults,
	type WaveToken,
} from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { parseDimension } from '../token-values/dimension.ts';
import { parseDuration } from '../token-values/duration.ts';
import { normalizeFontWeight } from '../token-values/font-weight.ts';
import {
	type NormalizedCustomStrokeStyle,
	normalizeStrokeStyle,
} from '../token-values/stroke-style.ts';
import {
	hasTypographyRemDimension,
	materializeTypographyValue,
	mergeTypographyDefaults,
	missingTypographyFields,
	parseTypographyBaseFontSize,
	parseTypographyDimension,
	parseTypographyLineHeight,
	typographyDefaultsFromExtensions,
} from '../typography-value.ts';
import { formatColorOutput, isDtcgColorSpaceValue } from './color-space.ts';
import { normalizeColorValue } from './color-value.ts';
import { sampleCubicBezier } from './cubic-bezier.ts';
import { applyInheritColorExtension } from './inherit-color-extension.ts';
import { roundTo } from './number-format.ts';
import {
	setTokenReferenceLineage,
	type TokenReferenceLineage,
	type TransformReferenceContext,
	tokenReferenceLineage,
	typographyDefaultReferenceLineage,
} from './reference-lineage.ts';
import {
	getOutlineExtension,
	parseSketchExtension,
} from './sketch-extension.ts';

interface InheritedExtensions {
	sketchPath?: string;
	sketchSkip?: boolean;
	typographyDefaults?: TypographyDefaults;
	typographyBaseFontSize?: number;
	typographyDefaultLineage?: ReadonlyMap<string, TokenReferenceLineage>;
}

function mergeTypographyDefaultLineage(
	inherited: ReadonlyMap<string, TokenReferenceLineage> | undefined,
	localDefaults: TypographyDefaults | undefined,
	local: ReadonlyMap<string, TokenReferenceLineage>,
): ReadonlyMap<string, TokenReferenceLineage> {
	const merged = new Map(inherited);
	for (const field of Object.keys(localDefaults ?? {})) merged.delete(field);
	for (const [field, lineage] of local) merged.set(field, lineage);
	return merged;
}

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

function isLegacyColorSpaceWrapperObject(value: unknown): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const keys = Object.keys(value);
	const colorKeys = keys.filter(
		(key) => key !== 'alpha' && key !== '_swatchName',
	);
	if (colorKeys.length !== 1) return false;
	const space = colorKeys[0]!;
	const nested = (value as Record<string, unknown>)[space];
	return (
		typeof nested === 'object' &&
		nested !== null &&
		!Array.isArray(nested) &&
		'colorSpace' in nested &&
		'components' in nested &&
		(nested as { colorSpace?: unknown }).colorSpace === space
	);
}

function isDtcgTokenValueObject(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'$value' in value
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
			isLegacyColorSpaceWrapperObject(value) ||
			isDtcgTokenValueObject(value) ||
			isLegacyColorObject(value) ||
			isStandaloneHexObject(value))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valuePath(tokenPath: string | undefined, field?: string): string {
	if (!tokenPath) return field ?? '<unknown>';
	return field ? `${tokenPath}.${field}` : tokenPath;
}

function normalizeDimensionOutput(value: unknown, path?: string): string {
	const parsed = parseDimension(value, { defaultUnit: 'px' });
	if (!parsed.ok) {
		throw new Error(
			`Invalid dimension at ${path ?? '<unknown>'}: ${parsed.message}`,
		);
	}
	return `${parsed.value.value}${parsed.value.unit}`;
}

function normalizeDurationOutput(value: unknown, path?: string): string {
	const parsed = parseDuration(value);
	if (!parsed.ok) {
		throw new Error(
			`Invalid duration at ${path ?? '<unknown>'}: ${parsed.message}`,
		);
	}
	return `${parsed.value.value}${parsed.value.unit}`;
}

function normalizeFontWeightOutput(value: unknown, path?: string): number {
	const normalized = normalizeFontWeight(value);
	if (!normalized.ok) {
		throw new Error(
			`Invalid fontWeight at ${path ?? '<unknown>'}: ${normalized.message}`,
		);
	}
	return normalized.value;
}

function normalizeStrokeStyleOutput(value: unknown, path?: string): DtcgValue {
	const normalized = normalizeStrokeStyle(value);
	if (!normalized.ok) {
		throw new Error(
			`Invalid strokeStyle at ${path ?? '<unknown>'}: ${normalized.message}`,
		);
	}
	if (typeof normalized.value === 'string') return normalized.value;
	const style = normalized.value as NormalizedCustomStrokeStyle;
	return {
		dashArray: style.dashArray.map((member) =>
			normalizeDimensionOutput(member, path ? `${path}.dashArray` : undefined),
		),
		lineCap: style.lineCap,
	};
}

function normalizeNestedColor(
	value: unknown,
	targetFormat: ColorSpaceFormat,
	path?: string,
): unknown {
	return typeof value === 'string' ||
		isDtcgColorSpaceValue(value) ||
		isDtcgColorObjectCandidate(value) ||
		isLegacyColorSpaceWrapperObject(value) ||
		isDtcgTokenValueObject(value) ||
		isLegacyColorObject(value) ||
		isStandaloneHexObject(value)
		? normalizeColorValue(value, targetFormat, path).value
		: value;
}

function normalizeBorderValue(
	value: unknown,
	targetFormat: ColorSpaceFormat,
	tokenPath?: string,
): DtcgValue {
	if (!isRecord(value)) return value as DtcgValue;
	return {
		...value,
		color: normalizeNestedColor(
			value.color,
			targetFormat,
			valuePath(tokenPath, 'color'),
		) as DtcgValue,
		width: normalizeDimensionOutput(value.width, valuePath(tokenPath, 'width')),
		style: normalizeStrokeStyleOutput(
			value.style,
			valuePath(tokenPath, 'style'),
		),
	};
}

function normalizeTransitionValue(
	value: unknown,
	tokenPath?: string,
): DtcgValue {
	if (!isRecord(value)) return value as DtcgValue;
	return {
		...value,
		duration: normalizeDurationOutput(
			value.duration,
			valuePath(tokenPath, 'duration'),
		),
		delay: normalizeDurationOutput(value.delay, valuePath(tokenPath, 'delay')),
	};
}

function normalizeTypographyValue(
	value: unknown,
	targetFormat: ColorSpaceFormat,
	tokenPath?: string,
): DtcgValue {
	if (!isRecord(value)) return value as DtcgValue;
	const fontSize = parseTypographyDimension(value.fontSize);
	const letterSpacing = parseTypographyDimension(value.letterSpacing);
	const lineHeight = parseTypographyLineHeight(value.lineHeight);
	if (!fontSize) {
		throw new Error(
			`Invalid typography fontSize at ${valuePath(tokenPath, 'fontSize')}`,
		);
	}
	if (!letterSpacing) {
		throw new Error(
			`Invalid typography letterSpacing at ${valuePath(tokenPath, 'letterSpacing')}`,
		);
	}
	if (!lineHeight) {
		throw new Error(
			`Invalid typography lineHeight at ${valuePath(tokenPath, 'lineHeight')}`,
		);
	}
	return {
		...value,
		...(value.color !== undefined && {
			color: normalizeNestedColor(
				value.color,
				targetFormat,
				valuePath(tokenPath, 'color'),
			) as DtcgValue,
		}),
		fontSize: normalizeDimensionOutput(
			fontSize,
			valuePath(tokenPath, 'fontSize'),
		),
		fontWeight: normalizeFontWeightOutput(
			value.fontWeight,
			valuePath(tokenPath, 'fontWeight'),
		),
		letterSpacing: normalizeDimensionOutput(
			letterSpacing,
			valuePath(tokenPath, 'letterSpacing'),
		),
		lineHeight: lineHeight.unit
			? normalizeDimensionOutput(lineHeight, valuePath(tokenPath, 'lineHeight'))
			: lineHeight.value,
	};
}

function processValue(
	value: DtcgValue,
	targetFormat: ColorSpaceFormat = 'hex',
	tokenPath?: string,
	typeValue?: string,
): DtcgValue {
	if (shouldNormalizeScalarColor(value, typeValue)) {
		return normalizeColorValue(value, targetFormat, tokenPath)
			.value as DtcgValue;
	}

	if (typeValue === 'dimension') {
		return normalizeDimensionOutput(value, tokenPath);
	}
	if (typeValue === 'duration') {
		return normalizeDurationOutput(value, tokenPath);
	}
	if (typeValue === 'fontWeight') {
		return normalizeFontWeightOutput(value, tokenPath);
	}
	if (typeValue === 'strokeStyle') {
		return normalizeStrokeStyleOutput(value, tokenPath);
	}
	if (typeValue === 'border') {
		return normalizeBorderValue(value, targetFormat, tokenPath);
	}
	if (typeValue === 'transition') {
		return normalizeTransitionValue(value, tokenPath);
	}
	if (typeValue === 'typography') {
		return normalizeTypographyValue(value, targetFormat, tokenPath);
	}

	if (
		Array.isArray(value) &&
		(typeValue === 'shadow' || typeValue === 'gradient')
	) {
		return value.map((item, index) =>
			processArrayItem(
				item,
				targetFormat,
				tokenPath ? `${tokenPath}[${index}]` : `[${index}]`,
				typeValue,
			),
		) as unknown as DtcgValue;
	}
	if (typeValue === 'shadow' && isRecord(value)) {
		return processArrayItem(
			value,
			targetFormat,
			tokenPath,
			typeValue,
		) as DtcgValue;
	}
	return value;
}

// 处理数组中的每个元素（用于 shadow 和 gradient）
function processArrayItem(
	item: unknown,
	targetFormat: ColorSpaceFormat,
	itemPath?: string,
	parentType?: string,
): unknown {
	if (typeof item !== 'object' || item === null) {
		return item;
	}

	const result: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(item)) {
		if (
			(parentType === 'shadow' ||
				parentType === 'gradient' ||
				parentType === 'border') &&
			key === 'color' &&
			(typeof val === 'string' ||
				isDtcgColorSpaceValue(val) ||
				isDtcgColorObjectCandidate(val) ||
				isLegacyColorSpaceWrapperObject(val) ||
				isDtcgTokenValueObject(val) ||
				isLegacyColorObject(val) ||
				isStandaloneHexObject(val))
		) {
			result[key] = normalizeNestedColor(
				val,
				targetFormat,
				itemPath ? `${itemPath}.color` : undefined,
			);
		} else if (
			parentType === 'shadow' &&
			(key === 'offsetX' ||
				key === 'offsetY' ||
				key === 'blur' ||
				key === 'spread')
		) {
			result[key] = normalizeDimensionOutput(
				val,
				itemPath ? `${itemPath}.${key}` : undefined,
			);
		} else {
			result[key] = val;
		}
	}
	return result;
}

function extractColorAlpha(color: string): number {
	try {
		return chroma(color).alpha();
	} catch {
		return 1;
	}
}

function applyColorAlpha(
	color: string,
	alpha: number,
	targetFormat: ColorSpaceFormat,
): string {
	try {
		return formatColorOutput(chroma(color), targetFormat, alpha);
	} catch {
		return color;
	}
}

function deriveSmoothGradient(
	processedValue: unknown,
	extension: unknown,
	targetFormat: ColorSpaceFormat,
	tokenPath?: string,
): unknown {
	if (!Array.isArray(processedValue) || processedValue.length !== 2) {
		throw new Error(
			`smoothGradient requires exactly 2 stops (found ${Array.isArray(processedValue) ? processedValue.length : 'non-array'}${tokenPath ? ` at ${tokenPath}` : ''})`,
		);
	}

	const ext = extension as { cubicBezier?: unknown; step?: unknown };
	if (
		!Array.isArray(ext.cubicBezier) ||
		ext.cubicBezier.length !== 4 ||
		!ext.cubicBezier.every((n) => typeof n === 'number')
	) {
		throw new Error(
			`smoothGradient.cubicBezier must be an array of 4 numbers${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}
	const cubicBezier = ext.cubicBezier as [number, number, number, number];

	if (!Number.isInteger(ext.step) || (ext.step as number) < 2) {
		throw new Error(
			`smoothGradient.step must be an integer >= 2${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}
	const step = ext.step as number;

	const start = processedValue[0] as Record<string, unknown>;
	const end = processedValue[1] as Record<string, unknown>;

	if (typeof start.color !== 'string' || typeof end.color !== 'string') {
		throw new Error(
			`smoothGradient requires convertible string colors${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}

	const startColor = start.color;
	const endColor = end.color;
	const startAlpha = extractColorAlpha(startColor);
	const endAlpha = extractColorAlpha(endColor);
	const startPos = typeof start.position === 'number' ? start.position : 0;
	const endPos = typeof end.position === 'number' ? end.position : 1;

	const ratios = sampleCubicBezier(cubicBezier, step);
	const midIndex = Math.floor(step / 2);

	const derived = [];
	for (let i = 0; i < step; i++) {
		const t = i / (step - 1);
		const position = roundTo(startPos + (endPos - startPos) * t, 2);
		const ratio = ratios[i]!;
		const alpha = roundTo(startAlpha + (endAlpha - startAlpha) * ratio, 2);
		// v1: do not generate intermediate blended colors; use endpoint colors only
		const baseColor = i < midIndex ? startColor : endColor;

		derived.push({
			color: applyColorAlpha(baseColor, alpha, targetFormat),
			position,
		});
	}

	return derived;
}

function materializeGradientEndpoints(
	value: unknown,
	tokenPath?: string,
): unknown {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(
			`gradient requires at least one stop${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}

	const stops = value.map((stop) => {
		const item = stop as Record<string, unknown>;
		const position = item.position as number;
		return {
			...item,
			position: Math.min(1, Math.max(0, position)),
		};
	});

	if (stops.length === 1) {
		const stop = stops[0]!;
		return [
			{ ...stop, position: 0 },
			{ ...stop, position: 1 },
		];
	}

	let minimum = stops[0]!;
	let maximum = stops[0]!;
	for (const stop of stops.slice(1)) {
		if (stop.position < minimum.position) minimum = stop;
		if (stop.position >= maximum.position) maximum = stop;
	}

	return [
		...(stops.some((stop) => stop.position === 0)
			? []
			: [{ ...minimum, position: 0 }]),
		...stops,
		...(stops.some((stop) => stop.position === 1)
			? []
			: [{ ...maximum, position: 1 }]),
	];
}

function interpolateShadowValue(base: unknown, coeff: number): string | number {
	if (typeof base === 'string') {
		const match = base.trim().match(/^(-?\d+(\.\d+)?)\s*([a-z%]*)$/i);
		if (match) {
			const rawValue = match[1];
			if (rawValue === undefined) {
				return base;
			}
			const value = parseFloat(rawValue);
			const unit = match[3] || '';
			if (unit === 'rem') {
				return `${roundTo(value * coeff, 3)}rem`;
			}
			return `${Math.round(value * coeff)}${unit}`;
		}
		return base;
	}
	if (typeof base === 'number') {
		return Math.round(base * coeff);
	}
	return 0;
}

function parseShadowLength(value: unknown): { value: number; unit: string } {
	if (typeof value === 'number') {
		return { value, unit: '' };
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const obj = value as Record<string, unknown>;
		if (typeof obj.value === 'number') {
			return {
				value: obj.value,
				unit: typeof obj.unit === 'string' ? obj.unit : '',
			};
		}
	}
	if (typeof value === 'string') {
		const match = value.trim().match(/^(-?\d+(\.\d+)?)\s*([a-z%]*)$/i);
		if (match?.[1] !== undefined) {
			return {
				value: parseFloat(match[1]),
				unit: match[3] || '',
			};
		}
	}
	return { value: 0, unit: '' };
}

function formatShadowLengthValue(value: number, unit: string): string | number {
	if (unit === 'rem') {
		return `${roundTo(value, 3)}rem`;
	}
	if (unit !== '') {
		return `${Math.round(value)}${unit}`;
	}
	return Math.round(value);
}

function interpolateShadowLength(
	from: unknown,
	to: unknown,
	ratio: number,
): string | number {
	const start = parseShadowLength(from);
	const end = parseShadowLength(to);
	const unit = end.unit || start.unit;
	const value = start.value + (end.value - start.value) * ratio;
	return formatShadowLengthValue(value, unit);
}

function extractTargetAlpha(
	target: Record<string, unknown>,
): number | undefined {
	if (typeof target.alpha === 'number') {
		return target.alpha;
	}
	if (typeof target.alpha === 'string') {
		const parsed = parseFloat(target.alpha);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	if (typeof target.color === 'string') {
		return extractColorAlpha(target.color);
	}
	return undefined;
}

function isZeroLength(value: unknown): boolean {
	const parsed = parseShadowLength(value);
	return parsed.value === 0;
}

function isUsefulShadowLayer(layer: Record<string, unknown>): boolean {
	const alpha =
		typeof layer.color === 'string' ? extractColorAlpha(layer.color) : 1;
	const hasGeometry = !(
		isZeroLength(layer.offsetX) &&
		isZeroLength(layer.offsetY) &&
		isZeroLength(layer.blur) &&
		isZeroLength(layer.spread)
	);
	return alpha > 0 && hasGeometry;
}

function filterUsefulShadowLayers(
	layers: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
	return layers.filter(isUsefulShadowLayer);
}

function hasPreservedColorObject(
	value: unknown,
	typeValue: string | undefined,
): boolean {
	if (typeValue === 'color') return isDtcgColorObjectCandidate(value);
	if (
		typeValue !== 'border' &&
		typeValue !== 'typography' &&
		typeValue !== 'shadow' &&
		typeValue !== 'gradient'
	) {
		return false;
	}
	const items = Array.isArray(value) ? value : [value];
	return items.some(
		(item) => isRecord(item) && isDtcgColorObjectCandidate(item.color),
	);
}

function deriveSmoothShadow(
	processedValue: unknown,
	extension: unknown,
	targetFormat: ColorSpaceFormat,
	tokenPath?: string,
): unknown {
	if (
		typeof processedValue !== 'object' ||
		processedValue === null ||
		Array.isArray(processedValue)
	) {
		throw new Error(
			`smoothShadow requires a single shadow layer object${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}

	const ext = extension as { cubicBezier?: unknown; step?: unknown };
	if (
		!Array.isArray(ext.cubicBezier) ||
		ext.cubicBezier.length !== 4 ||
		!ext.cubicBezier.every((n) => typeof n === 'number')
	) {
		throw new Error(
			`smoothShadow.cubicBezier must be an array of 4 numbers${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}
	const cubicBezier = ext.cubicBezier as [number, number, number, number];
	const hasTarget =
		typeof (extension as Record<string, unknown>).target === 'object' &&
		(extension as Record<string, unknown>).target !== null &&
		!Array.isArray((extension as Record<string, unknown>).target);

	if (!Number.isInteger(ext.step) || (ext.step as number) < 1) {
		throw new Error(
			`smoothShadow.step must be an integer >= 1${tokenPath ? ` at ${tokenPath}` : ''}`,
		);
	}
	const step = ext.step as number;

	const layer = processedValue as Record<string, unknown>;
	if (typeof layer.color !== 'string') {
		throw new Error(
			`smoothShadow requires a convertible string color${tokenPath ? ` at ${tokenPath}.color` : ''}`,
		);
	}
	const baseColor = layer.color;
	const baseAlpha = extractColorAlpha(baseColor);
	const hasInset = typeof layer.inset === 'boolean';

	if (hasTarget) {
		if (step < 2) {
			throw new Error(
				`smoothShadow.step must be an integer >= 2 when target is provided${tokenPath ? ` at ${tokenPath}` : ''}`,
			);
		}

		const target = (extension as { target: Record<string, unknown> }).target;
		const targetAlpha = extractTargetAlpha(target) ?? baseAlpha;
		const ratios = sampleCubicBezier(cubicBezier, step);
		const derived = ratios.map((ratio) => ({
			color: applyColorAlpha(
				baseColor,
				roundTo(baseAlpha + (targetAlpha - baseAlpha) * ratio, 2),
				targetFormat,
			),
			offsetX: interpolateShadowLength(layer.offsetX, target.offsetX, ratio),
			offsetY: interpolateShadowLength(layer.offsetY, target.offsetY, ratio),
			blur: interpolateShadowLength(layer.blur, target.blur, ratio),
			spread: interpolateShadowLength(layer.spread, target.spread, ratio),
			...(hasInset && { inset: layer.inset }),
		}));

		return filterUsefulShadowLayers(derived);
	}

	// Sample step+1 points and drop the last one (zero layer)
	const ratios = sampleCubicBezier(cubicBezier, step + 1);
	const visibleRatios = ratios.slice(0, step);

	const derived = [];
	// Iterate backwards to produce layers ordered from small to large
	for (let i = visibleRatios.length - 1; i >= 0; i--) {
		const ratio = visibleRatios[i]!;
		const coeff = 1 - ratio;

		derived.push({
			color: applyColorAlpha(
				baseColor,
				roundTo(baseAlpha * coeff, 2),
				targetFormat,
			),
			offsetX: interpolateShadowValue(layer.offsetX, coeff),
			offsetY: interpolateShadowValue(layer.offsetY, coeff),
			blur: interpolateShadowValue(layer.blur, coeff),
			spread: interpolateShadowValue(layer.spread, coeff),
			...(hasInset && { inset: layer.inset }),
		});
	}

	return derived;
}

function transformToken(
	token: ResolvedDtcgToken,
	parentType: string | undefined,
	order: number,
	targetColorSpace: ColorSpaceFormat = 'hex',
	tokenPath?: string,
	inheritedExtensions: InheritedExtensions = {},
): {
	partial: Omit<WaveToken, 'name' | 'path'>;
	preserveReferenceLineage: boolean;
} {
	const typeValue = token.$type ?? parentType;
	let preserveReferenceLineage = true;
	let sourceValue: DtcgValue = token.$value;
	let typographyUsesRem = false;
	const sketchColorReference =
		typeValue === 'typography' || typeValue === 'border'
			? token._sketchColorReference
			: undefined;
	if (typeValue === 'typography') {
		const materialized = materializeTypographyValue(
			inheritedExtensions.typographyDefaults,
			token.$value,
		);
		const missing = missingTypographyFields(materialized);
		if (missing.length > 0) {
			throw new Error(
				`Materialized typography at ${tokenPath ?? '<unknown>'} is missing required fields: ${missing.join(', ')}`,
			);
		}
		sourceValue = materialized as DtcgValue;
		typographyUsesRem = hasTypographyRemDimension(materialized);
	}
	let processedValue = processValue(
		sourceValue,
		targetColorSpace,
		tokenPath,
		typeValue,
	);
	const typographyColor =
		typeValue === 'typography' &&
		isRecord(processedValue) &&
		typeof processedValue.color === 'string'
			? processedValue.color
			: undefined;

	// smoothShadow derivation
	const smoothShadow = token.$extensions?.smoothShadow;
	if (smoothShadow !== undefined && typeValue === 'shadow') {
		preserveReferenceLineage = false;
		processedValue = deriveSmoothShadow(
			processedValue,
			smoothShadow,
			targetColorSpace,
			tokenPath,
		) as DtcgValue;
	}

	// smoothGradient derivation
	const smoothGradient = token.$extensions?.smoothGradient;
	if (smoothGradient !== undefined && typeValue === 'gradient') {
		preserveReferenceLineage = false;
		processedValue = deriveSmoothGradient(
			processedValue,
			smoothGradient,
			targetColorSpace,
			tokenPath,
		) as DtcgValue;
	}
	if (typeValue === 'gradient') {
		const stopCount = Array.isArray(processedValue)
			? processedValue.length
			: undefined;
		processedValue = materializeGradientEndpoints(
			processedValue,
			tokenPath,
		) as DtcgValue;
		if (
			stopCount !== undefined &&
			Array.isArray(processedValue) &&
			processedValue.length !== stopCount
		) {
			preserveReferenceLineage = false;
		}
	}
	// inheritColor extension (v1)
	let inheritColor: boolean | undefined;
	let inheritColorOpacity: number | undefined;
	let inheritColorAlpha: number | undefined;
	let inheritColorSiblingSlot: string | undefined;
	const inheritColorExt = token.$extensions?.inheritColor;
	if (inheritColorExt !== undefined && typeValue === 'color') {
		preserveReferenceLineage = false;
		const result = applyInheritColorExtension(inheritColorExt, processedValue);
		processedValue = result.value;
		inheritColor = result.metadata.inheritColor;
		inheritColorOpacity = result.metadata.inheritColorOpacity;
		inheritColorAlpha = result.metadata.inheritColorAlpha;
		inheritColorSiblingSlot = result.metadata.inheritColorSiblingSlot;
	}

	// currentColor extension (deprecated, use inheritColor instead)
	let currentColorOpacity: number | undefined;
	let currentColorShadowAlpha: number | undefined;
	const currentColorExt = token.$extensions?.currentColor;
	if (
		currentColorExt !== undefined &&
		typeof currentColorExt === 'object' &&
		currentColorExt !== null
	) {
		const extObj = currentColorExt as Record<string, unknown>;

		// opacity — for non-shadow tokens
		const opacityData = extObj.opacity;
		if (opacityData !== undefined && typeValue !== 'shadow') {
			const opacityRaw =
				typeof opacityData === 'object' &&
				opacityData !== null &&
				'$value' in (opacityData as object)
					? (opacityData as Record<string, unknown>).$value
					: opacityData;
			if (
				typeof opacityRaw === 'number' &&
				opacityRaw >= 0 &&
				opacityRaw <= 1
			) {
				// 保存原始颜色值供后续使用（如 sketch 格式）
				const originalColor =
					typeof processedValue === 'string' ? processedValue : undefined;
				processedValue = {
					opacity: opacityRaw,
					...(originalColor !== undefined && { _color: originalColor }),
				};
				currentColorOpacity = opacityRaw;
				preserveReferenceLineage = false;
			}
		}

		// shadow — for shadow tokens
		const shadowData = extObj.shadow;
		if (shadowData !== undefined && typeValue === 'shadow') {
			const shadowRaw =
				typeof shadowData === 'object' &&
				shadowData !== null &&
				'$value' in (shadowData as object)
					? (shadowData as Record<string, unknown>).$value
					: shadowData;
			if (
				typeof shadowRaw === 'object' &&
				shadowRaw !== null &&
				!Array.isArray(shadowRaw)
			) {
				const processedLayer = processArrayItem(
					shadowRaw,
					targetColorSpace,
					tokenPath,
					'shadow',
				) as Record<string, unknown>;
				const layerColor = processedLayer.color;
				if (typeof layerColor === 'string') {
					const alpha = extractColorAlpha(layerColor);
					processedLayer.color = { opacity: roundTo(alpha, 2) };
					currentColorShadowAlpha = alpha;
				}
				processedValue = [processedLayer as DtcgValue];
				preserveReferenceLineage = false;
			}
		}
	}

	const sketchExtension = parseSketchExtension(token.$extensions);
	const mergedSketchExtension =
		inheritedExtensions.sketchPath !== undefined ||
		inheritedExtensions.sketchSkip !== undefined
			? {
					...(inheritedExtensions.sketchPath !== undefined && {
						path: inheritedExtensions.sketchPath,
					}),
					...(inheritedExtensions.sketchSkip !== undefined && {
						skip: inheritedExtensions.sketchSkip,
					}),
					...sketchExtension,
				}
			: sketchExtension;
	const outlineData = getOutlineExtension(token.$extensions);
	const outline =
		typeValue === 'border' &&
		typeof outlineData === 'object' &&
		outlineData !== null &&
		!Array.isArray(outlineData) &&
		typeof (outlineData as Record<string, unknown>).offset === 'number'
			? { offset: (outlineData as { offset: number }).offset }
			: undefined;

	const sdValue: Omit<WaveToken, 'name' | 'path'> = {
		value: processedValue,
		_order: order,
		// inheritColor v1 metadata
		...(inheritColor !== undefined && { inheritColor }),
		...(inheritColorOpacity !== undefined && { inheritColorOpacity }),
		...(inheritColorAlpha !== undefined && { inheritColorAlpha }),
		...(inheritColorSiblingSlot !== undefined && { inheritColorSiblingSlot }),
		// Legacy currentColor metadata (deprecated)
		...(currentColorOpacity !== undefined && { currentColorOpacity }),
		...(currentColorShadowAlpha !== undefined && { currentColorShadowAlpha }),
		// Original referenced token path for sketch variable mapping
		...(token._swatchName !== undefined && { _swatchName: token._swatchName }),
		...(token._colorReference !== undefined && {
			_colorReference: token._colorReference,
		}),
		...(sketchColorReference !== undefined && {
			_sketchColorReference: sketchColorReference,
		}),
		...(hasPreservedColorObject(processedValue, typeValue) && {
			_targetColorSpace: targetColorSpace,
		}),
		...(typographyColor !== undefined && { _typographyColor: typographyColor }),
		...(typeValue === 'typography' &&
			typographyUsesRem && {
				_typographyBaseFontSize:
					inheritedExtensions.typographyBaseFontSize ?? 16,
			}),
		...(mergedSketchExtension !== undefined && {
			_sketch: mergedSketchExtension,
		}),
		...(outline !== undefined && { _outline: outline }),
	};

	if (typeValue !== undefined) {
		sdValue.type = typeValue;
	}

	// Token identity: only non-empty $id strings count; empty slots stay a
	// source-level concern and never surface as WaveToken.id.
	if (typeof token.$id === 'string' && token.$id.trim() !== '') {
		sdValue.id = token.$id;
	}

	if (token.$description !== undefined) {
		sdValue.comment = token.$description;
	}

	if (token.$deprecated !== undefined) {
		sdValue.deprecated = token.$deprecated;
	}

	return { partial: sdValue, preserveReferenceLineage };
}

export interface WaveTokenResult {
	tokens: WaveToken[];
	groupComments: Record<string, string>;
}

function buildWaveToken(
	path: string[],
	rest: Omit<WaveToken, 'name' | 'path'>,
): WaveToken {
	return {
		name: path.join('-').toLowerCase(),
		path,
		...rest,
	};
}

/**
 * Walk a resolved DTCG token tree and emit a flat WaveToken[] plus group
 * descriptions. Replaces the SD-shaped {tree, order} output of
 * `transformToSDFormat` with a Wave-native shape consumed directly by formats.
 */
export function transformToWaveTokens(
	resolved: ResolvedTokenGroup,
	parentType?: string,
	targetColorSpace: ColorSpaceFormat = 'hex',
	referenceContext?: TransformReferenceContext,
): WaveTokenResult {
	const tokens: WaveToken[] = [];
	const groupComments: Record<string, string> = {};
	let orderCounter = 0;

	function bindReferenceLineage(
		waveToken: WaveToken,
		sourceToken: ResolvedDtcgToken,
		tokenPath: readonly string[],
		inherited: InheritedExtensions,
		preserve: boolean,
	): void {
		if (!preserve || !referenceContext) return;
		const direct = tokenReferenceLineage(tokenPath, resolved, referenceContext);
		const explicitValue = isRecord(sourceToken.$value)
			? sourceToken.$value
			: undefined;
		const inheritedLineage = [
			...(inherited.typographyDefaultLineage?.entries() ?? []),
		]
			.filter(
				([field]) => !explicitValue || !Object.hasOwn(explicitValue, field),
			)
			.map(([, lineage]) => lineage);
		setTokenReferenceLineage(waveToken, [...direct, ...inheritedLineage]);
	}

	function walk(
		group: ResolvedTokenGroup,
		inheritedType: string | undefined,
		path: string[],
		inheritedExtensions: InheritedExtensions = {},
	): void {
		const groupType =
			group.$type ??
			(path[path.length - 1] === 'color' ? 'color' : inheritedType);
		const groupSketchExtension = parseSketchExtension(group.$extensions);
		const localTypographyDefaults =
			groupType === 'typography'
				? typographyDefaultsFromExtensions(group.$extensions)
				: undefined;
		const localTypographyDefaultLineage =
			groupType === 'typography'
				? typographyDefaultReferenceLineage(path, resolved, referenceContext)
				: new Map<string, TokenReferenceLineage>();
		const localTypographyBaseFontSize =
			path.join('.') === 'theme.font'
				? parseTypographyBaseFontSize(group.$extensions)
				: undefined;
		const childInheritedExtensions: InheritedExtensions = {
			...inheritedExtensions,
			...(groupSketchExtension?.path !== undefined && {
				sketchPath: groupSketchExtension.path,
			}),
			...(groupSketchExtension?.skip !== undefined && {
				sketchSkip: groupSketchExtension.skip,
			}),
			...(groupType === 'typography'
				? {
						typographyDefaults: mergeTypographyDefaults(
							inheritedExtensions.typographyDefaults,
							localTypographyDefaults,
						),
					}
				: { typographyDefaults: undefined }),
			...(groupType === 'typography'
				? {
						typographyDefaultLineage: mergeTypographyDefaultLineage(
							inheritedExtensions.typographyDefaultLineage,
							localTypographyDefaults,
							localTypographyDefaultLineage,
						),
					}
				: { typographyDefaultLineage: undefined }),
			...(groupType === 'typography'
				? {
						typographyBaseFontSize:
							localTypographyBaseFontSize ??
							inheritedExtensions.typographyBaseFontSize,
					}
				: { typographyBaseFontSize: undefined }),
		};

		if (group.$description !== undefined && path.length > 0) {
			groupComments[path.join('.')] = group.$description;
		}

		for (const key of Object.keys(group)) {
			if (key.startsWith('$')) continue;
			const value = group[key];
			if (value === undefined || value === null) continue;
			if (typeof value !== 'object') continue;

			const childPath = [...path, key];
			const childPathStr = childPath.join('.');

			if (isResolvedToken(value)) {
				const transformed = transformToken(
					value,
					groupType,
					orderCounter++,
					targetColorSpace,
					childPathStr,
					childInheritedExtensions,
				);
				const waveToken = buildWaveToken(childPath, transformed.partial);
				bindReferenceLineage(
					waveToken,
					value,
					childPath,
					childInheritedExtensions,
					transformed.preserveReferenceLineage,
				);
				tokens.push(waveToken);
				continue;
			}

			const child = value as ResolvedTokenGroup;
			if (child.$extensions?.composite === true) {
				const compositeType = child.$type ?? groupType;
				const compositeSketchExtension = parseSketchExtension(
					child.$extensions,
				);
				const compositeInheritedExtensions: InheritedExtensions = {
					...childInheritedExtensions,
					...(compositeSketchExtension?.path !== undefined && {
						sketchPath: compositeSketchExtension.path,
					}),
					...(compositeSketchExtension?.skip !== undefined && {
						sketchSkip: compositeSketchExtension.skip,
					}),
					...(compositeType === 'typography'
						? {
								typographyDefaults: mergeTypographyDefaults(
									childInheritedExtensions.typographyDefaults,
									typographyDefaultsFromExtensions(child.$extensions),
								),
							}
						: { typographyDefaults: undefined }),
					...(compositeType === 'typography'
						? {
								typographyDefaultLineage: mergeTypographyDefaultLineage(
									childInheritedExtensions.typographyDefaultLineage,
									typographyDefaultsFromExtensions(child.$extensions),
									typographyDefaultReferenceLineage(
										childPath,
										resolved,
										referenceContext,
									),
								),
							}
						: { typographyDefaultLineage: undefined }),
					...(compositeType === 'typography'
						? {
								typographyBaseFontSize:
									childInheritedExtensions.typographyBaseFontSize,
							}
						: { typographyBaseFontSize: undefined }),
				};
				for (const propKey of Object.keys(child)) {
					if (propKey.startsWith('$')) continue;
					const propValue = child[propKey];
					if (
						propValue === undefined ||
						propValue === null ||
						typeof propValue !== 'object'
					) {
						continue;
					}
					if (!isResolvedToken(propValue)) continue;
					const transformed = transformToken(
						propValue,
						compositeType,
						orderCounter++,
						targetColorSpace,
						`${childPathStr}.${propKey}`,
						compositeInheritedExtensions,
					);
					transformed.partial._composite = childPathStr;
					const propPath = [...childPath, propKey];
					const waveToken = buildWaveToken(propPath, transformed.partial);
					bindReferenceLineage(
						waveToken,
						propValue,
						propPath,
						compositeInheritedExtensions,
						transformed.preserveReferenceLineage,
					);
					tokens.push(waveToken);
				}
				continue;
			}

			walk(child, groupType, childPath, childInheritedExtensions);
		}
	}

	walk(resolved, parentType, []);

	// Single-pass identity uniqueness: a duplicated $id keeps its first
	// occurrence in document order; later occurrences are cleared with a
	// warning. Derived expansions (smoothShadow / inheritColor) are not
	// separate records and never participate in this check.
	const firstById = new Map<string, WaveToken>();
	for (const token of tokens) {
		if (token.id === undefined) continue;
		const first = firstById.get(token.id);
		if (first === undefined) {
			firstById.set(token.id, token);
			continue;
		}
		logger.warn(
			`Duplicate token $id "${token.id}": keeping "${first.path.join('.')}", clearing "${token.path.join('.')}"`,
		);
		token.id = undefined;
	}

	return { tokens, groupComments };
}
