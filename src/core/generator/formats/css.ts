import type { WaveFormatFn, WaveToken } from '../../../types/index.ts';
import { formatDashArray } from '../../stroke-style.ts';
import {
	normalizeFontFamilyMember,
	parseTypographyDimension,
	parseTypographyLineHeight,
	parseTypographyNumber,
} from '../../typography-value.ts';
import { formatCssLength, gradientToCss, shadowToCss } from './utils.ts';

export interface CssVariablesFormatOptions {
	filterLayer?: number;
	groupComments?: Record<string, string>;
	includeRootKeys?: string[];
}

function getFilteredName(token: WaveToken, filterLayer: number): string {
	const path = token.path;
	if (filterLayer <= 0 || path.length <= filterLayer) {
		return token.name;
	}
	return path.slice(filterLayer).join('-');
}

function isShadowToken(token: WaveToken): boolean {
	return token.type === 'shadow';
}

function isGradient(token: WaveToken): boolean {
	return token.type === 'gradient';
}

function isTypography(token: WaveToken): boolean {
	return token.type === 'typography';
}

function isOutlineBorder(token: WaveToken): boolean {
	return token.type === 'border' && token._outline !== undefined;
}

function publicRootKey(token: WaveToken): string | undefined {
	return token.path[0] === 'theme' ? token.path[1] : token.path[0];
}

function isCssLengthToken(token: WaveToken): boolean {
	const root = publicRootKey(token);
	return token.type === 'dimension' && (root === 'radius' || root === 'border');
}

function assertNoObjectColorValue(value: unknown, token: WaveToken): void {
	if (typeof value !== 'object' || value === null) return;
	throw new Error(
		`CSS output requires transformer-normalized value at ${token.path.join('.')}`,
	);
}

function assertCompositeColorsAreNormalized(token: WaveToken): void {
	const items = Array.isArray(token.value) ? token.value : [token.value];
	for (const item of items) {
		if (typeof item !== 'object' || item === null || Array.isArray(item)) {
			continue;
		}
		assertNoObjectColorValue((item as Record<string, unknown>).color, token);
	}
}

function formatTokenValue(token: WaveToken): string {
	if (token.inheritColor === true) {
		const numericValue = token.inheritColorAlpha ?? token.inheritColorOpacity;
		if (typeof numericValue === 'number') {
			const percent = Math.round(numericValue * 100);
			return `color-mix(in srgb, currentColor ${percent}%, transparent)`;
		}
		return 'currentColor';
	}

	if (typeof token.currentColorOpacity === 'number') {
		const percent = Math.round(token.currentColorOpacity * 100);
		return `color-mix(in srgb, currentColor ${percent}%, transparent)`;
	}

	const tokenValue = token.value;

	if (
		typeof token.currentColorShadowAlpha === 'number' &&
		Array.isArray(tokenValue)
	) {
		const percent = Math.round(token.currentColorShadowAlpha * 100);
		const layers = (tokenValue as unknown[]).map((layer) => {
			if (typeof layer !== 'object' || layer === null) return layer;
			const l = { ...layer } as Record<string, unknown>;
			l.color = `color-mix(in srgb, currentColor ${percent}%, transparent)`;
			return l;
		});
		return shadowToCss(layers);
	}

	if (isShadowToken(token)) {
		assertCompositeColorsAreNormalized(token);
		return shadowToCss(tokenValue);
	}

	if (isGradient(token) && Array.isArray(tokenValue)) {
		assertCompositeColorsAreNormalized(token);
		return gradientToCss(tokenValue);
	}

	if (token.type === 'color') {
		assertNoObjectColorValue(tokenValue, token);
	}

	if (isCssLengthToken(token)) {
		return formatCssLength(tokenValue);
	}
	if (token.type === 'fontFamily') {
		return formatFontFamily(tokenValue);
	}

	return String(tokenValue);
}

const SIMPLE_FONT_FAMILY_PATTERN = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
const CSS_WIDE_KEYWORDS = new Set([
	'inherit',
	'initial',
	'unset',
	'revert',
	'revert-layer',
]);

function formatFontFamily(value: unknown): string {
	if (typeof value === 'string') {
		const family = normalizeFontFamilyMember(value, false);
		if (family === undefined) {
			throw new Error('CSS typography fontFamily must be a non-empty string');
		}
		return family;
	}
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('CSS typography fontFamily must be a string or array');
	}
	return value
		.map((item) => {
			const family = normalizeFontFamilyMember(item);
			if (family === undefined) {
				throw new Error(
					'CSS typography fontFamily array members must be non-empty strings',
				);
			}
			if (
				SIMPLE_FONT_FAMILY_PATTERN.test(family) &&
				!CSS_WIDE_KEYWORDS.has(family.toLowerCase())
			) {
				return family;
			}
			return `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
		})
		.join(', ');
}

function formatTypographyDimension(
	value: unknown,
	field: 'fontSize' | 'lineHeight' | 'letterSpacing',
): string {
	const parsed =
		field === 'lineHeight'
			? parseTypographyLineHeight(value)
			: parseTypographyDimension(value);
	if (parsed === undefined) {
		throw new Error(`CSS typography ${field} has an invalid value`);
	}
	if (parsed.unit) return `${parsed.value}${parsed.unit}`;
	if (field === 'lineHeight') return String(parsed.value);
	if (field === 'letterSpacing' && parsed.value === 0) return '0';
	return `${parsed.value}px`;
}

function formatTypographyWeight(value: unknown): string {
	const parsed = parseTypographyNumber(value);
	if (parsed === undefined || parsed <= 0) {
		throw new Error('CSS typography fontWeight has an invalid value');
	}
	return String(parsed);
}

interface TypographyCssReferences {
	familyKey?: string;
	colorKey?: string;
	colorValue?: string;
}

function typographyLines(
	key: string,
	value: unknown,
	references: TypographyCssReferences = {},
): string[] {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return [];
	}
	const obj = value as Record<string, unknown>;
	const family = obj.fontFamily;
	const size = obj.fontSize;
	const weight = obj.fontWeight;
	const lineHeight = obj.lineHeight;
	const letterSpacing = obj.letterSpacing;
	const lines: string[] = [];

	if (family !== undefined && references.familyKey === undefined) {
		lines.push(`  --${key}-family: ${formatFontFamily(family)};`);
	}
	if (size !== undefined) {
		lines.push(
			`  --${key}-size: ${formatTypographyDimension(size, 'fontSize')};`,
		);
	}
	if (weight !== undefined) {
		lines.push(`  --${key}-weight: ${formatTypographyWeight(weight)};`);
	}
	if (lineHeight !== undefined) {
		lines.push(
			`  --${key}-line-height: ${formatTypographyDimension(lineHeight, 'lineHeight')};`,
		);
	}
	if (letterSpacing !== undefined) {
		lines.push(
			`  --${key}-letter-spacing: ${formatTypographyDimension(letterSpacing, 'letterSpacing')};`,
		);
	}
	if (references.colorKey !== undefined) {
		lines.push(`  --${key}-color: var(--${references.colorKey});`);
	} else if (references.colorValue !== undefined) {
		lines.push(`  --${key}-color: ${references.colorValue};`);
	}
	const familyExpression = references.familyKey
		? `var(--${references.familyKey})`
		: `var(--${key}-family)`;
	lines.push(
		`  --${key}: var(--${key}-weight) var(--${key}-size) / var(--${key}-line-height) ${familyExpression};`,
	);
	return lines;
}

function colorReferenceAliases(token: WaveToken): string[] {
	const dotted = token.path.join('.');
	const pointer = token.path
		.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1'))
		.join('/');
	return [`{${dotted}}`, `#/${pointer}`, `#/${pointer}/$value`];
}

interface FormattedBorderValue {
	value: string;
	dashArray?: string;
}

function formatBorderValue(value: unknown): FormattedBorderValue {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return { value: String(value) };
	}
	const obj = value as Record<string, unknown>;
	if (typeof obj.width === 'object' && obj.width !== null) {
		throw new Error('CSS output requires transformer-normalized value');
	}
	if (typeof obj.color === 'object' && obj.color !== null) {
		throw new Error('CSS output requires transformer-normalized value');
	}
	const width = formatCssLength(obj.width);
	let style = 'solid';
	let dashArray: string | undefined;
	if (typeof obj.style === 'string') {
		style = obj.style;
	} else if (typeof obj.style === 'object' && obj.style !== null) {
		const styleObject = obj.style as Record<string, unknown>;
		dashArray = formatDashArray(styleObject.dashArray);
		style = 'dashed';
	} else if (obj.style !== undefined) {
		throw new Error('CSS border style must be a string or dashArray object');
	}
	const color =
		typeof obj.color === 'string' || typeof obj.color === 'number'
			? String(obj.color)
			: 'currentColor';
	return { value: `${width} ${style} ${color}`, dashArray };
}

function getGroupCommentPaths(tokenPath: string[]): string[] {
	const paths: string[] = [];
	for (let i = 1; i < tokenPath.length; i++) {
		paths.push(tokenPath.slice(0, i).join('.'));
	}
	return paths;
}

function pushGroupComments(
	lines: string[],
	token: WaveToken,
	groupComments: Record<string, string>,
	emittedGroups: Set<string>,
): void {
	const groupPaths = getGroupCommentPaths(token.path);
	for (const gp of groupPaths) {
		if (!emittedGroups.has(gp) && groupComments[gp]) {
			const comment = groupComments[gp];
			const isMultiline = comment.includes('\n');
			if (isMultiline) {
				for (const line of comment.split('\n')) {
					lines.push(`  /* ${line} */`);
				}
			} else {
				lines.push(`  /* ${comment} */`);
			}
			emittedGroups.add(gp);
		}
	}
}

function pushTokenDeclaration(
	lines: string[],
	key: string,
	token: WaveToken,
	cssValue: string,
): void {
	const description = token.comment;
	if (description && typeof description === 'string' && description !== '~') {
		const isMultilineDescription = description.includes('\n');
		if (isMultilineDescription) {
			for (const descLine of description.split('\n')) {
				lines.push(`  /* ${descLine} */`);
			}
			lines.push(`  --${key}: ${cssValue};`);
		} else {
			lines.push(`  --${key}: ${cssValue}; /* ${description} */`);
		}
	} else {
		lines.push(`  --${key}: ${cssValue};`);
	}
}

function shouldInclude(token: WaveToken, includeRootKeys?: string[]): boolean {
	if (!includeRootKeys || includeRootKeys.length === 0) return true;
	const root = publicRootKey(token);
	return root !== undefined && includeRootKeys.includes(root);
}

export const cssVariablesFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	const groupComments =
		(options?.groupComments as Record<string, string>) ?? {};
	const includeRootKeys = options?.includeRootKeys as string[] | undefined;

	const lines: string[] = [':root {'];

	const filtered = includeRootKeys
		? tokens.filter((t) => shouldInclude(t, includeRootKeys))
		: tokens;
	const sortedTokens = [...filtered].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);
	const emittedGroups = new Set<string>();
	const tokenKeys = new Set(
		sortedTokens.map((token) => getFilteredName(token, filterLayer)),
	);
	const familyKeys = new Map<string, string>();
	const colorKeys = new Map<string, string>();
	for (const token of sortedTokens) {
		const key = getFilteredName(token, filterLayer);
		if (token.type === 'fontFamily') {
			const family = formatFontFamily(token.value);
			if (!familyKeys.has(family)) familyKeys.set(family, key);
		}
		if (token.type === 'color') {
			for (const alias of colorReferenceAliases(token)) {
				colorKeys.set(alias, key);
			}
		}
	}

	for (const token of sortedTokens) {
		const key = getFilteredName(token, filterLayer);
		pushGroupComments(lines, token, groupComments, emittedGroups);

		if (isTypography(token)) {
			const value = token.value as Record<string, unknown>;
			const family = formatFontFamily(value.fontFamily);
			lines.push(
				...typographyLines(key, token.value, {
					familyKey: familyKeys.get(family),
					colorKey:
						token._colorReference === undefined
							? undefined
							: colorKeys.get(token._colorReference),
					colorValue: token._typographyColor,
				}),
			);
			continue;
		}

		if (token.type === 'border') {
			const border = formatBorderValue(token.value);
			pushTokenDeclaration(lines, key, token, border.value);
			if (border.dashArray !== undefined) {
				const companionKey = `${key}-dash-array`;
				if (tokenKeys.has(companionKey)) {
					throw new Error(
						`CSS border companion --${companionKey} collides with a real token key`,
					);
				}
				lines.push(`  --${companionKey}: ${border.dashArray};`);
			}
			if (isOutlineBorder(token)) {
				lines.push(
					`  --${key}-offset: ${formatCssLength(token._outline!.offset)};`,
				);
			}
			continue;
		}

		const cssValue = formatTokenValue(token);
		pushTokenDeclaration(lines, key, token, cssValue);
	}

	lines.push('}');
	return lines.join('\n');
};
