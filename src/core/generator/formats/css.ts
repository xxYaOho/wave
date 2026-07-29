import {
	type DtcgColorSpaceValue,
	isDtcgColorSpaceValue,
	type WaveFormatFn,
	type WaveToken,
} from '../../../types/index.ts';
import { formatDashArray } from '../../stroke-style.ts';
import { normalizeFontWeight } from '../../token-values/font-weight.ts';
import {
	normalizeFontFamilyMember,
	parseTypographyDimension,
	parseTypographyLineHeight,
	parseTypographyNumber,
} from '../../typography-value.ts';
import {
	cssLengthNumber,
	formatCssLength,
	gradientToCss,
	shadowToCss,
} from './utils.ts';

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

function valueShape(value: unknown): string {
	return Array.isArray(value)
		? 'array'
		: value === null
			? 'null'
			: typeof value;
}

function platformError(token: WaveToken, reason: string): Error {
	return new Error(
		`CSS platform error at ${token.path.join('.')} (type ${token.type ?? 'unknown'}, shape ${valueShape(token.value)}): ${reason}`,
	);
}

function colorPlatformError(token: WaveToken, reason: string): Error {
	return new Error(
		`Color cannot be represented for platform=css at ${token.path.join('.')} (target colorSpace ${token._targetColorSpace ?? 'unknown'}): ${reason}`,
	);
}

function formatComponent(component: number | 'none'): string {
	return component === 'none' ? component : String(component);
}

function formatDtcgColorForCss(
	value: DtcgColorSpaceValue,
	token: WaveToken,
): string {
	if (value.components.length !== 3) {
		throw colorPlatformError(
			token,
			'color must contain exactly three components',
		);
	}
	if (
		value.components.some(
			(component) =>
				component !== 'none' &&
				(typeof component !== 'number' || !Number.isFinite(component)),
		)
	) {
		throw colorPlatformError(token, 'color components must be finite or none');
	}
	if (
		value.alpha !== undefined &&
		(!Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1)
	) {
		throw colorPlatformError(token, 'color alpha must be between 0 and 1');
	}
	const [first, second, third] = value.components;
	if (first === undefined || second === undefined || third === undefined) {
		throw colorPlatformError(token, 'color components are incomplete');
	}
	const alpha = value.alpha === undefined ? '' : ` / ${value.alpha}`;
	const component = (item: number | 'none') => formatComponent(item);
	switch (value.colorSpace) {
		case 'hsl':
			return `hsl(${component(first)} ${second === 'none' ? 'none' : `${second * 100}%`} ${third === 'none' ? 'none' : `${third * 100}%`}${alpha})`;
		case 'hwb':
			return `hwb(${component(first)} ${second === 'none' ? 'none' : `${second * 100}%`} ${third === 'none' ? 'none' : `${third * 100}%`}${alpha})`;
		case 'lab':
		case 'lch':
		case 'oklab':
		case 'oklch':
			return `${value.colorSpace}(${component(first)} ${component(second)} ${component(third)}${alpha})`;
		default:
			return `color(${value.colorSpace} ${component(first)} ${component(second)} ${component(third)}${alpha})`;
	}
}

function formatCssColor(value: unknown, token: WaveToken): string {
	if (typeof value === 'string' || typeof value === 'number')
		return String(value);
	if (isDtcgColorSpaceValue(value)) return formatDtcgColorForCss(value, token);
	throw colorPlatformError(token, `unsupported color ${valueShape(value)}`);
}

function withFormattedCompositeColors(token: WaveToken): unknown {
	const items = Array.isArray(token.value) ? token.value : [token.value];
	const formatted = items.map((item) => {
		if (typeof item !== 'object' || item === null || Array.isArray(item)) {
			throw platformError(token, 'composite member must be an object');
		}
		const member = item as Record<string, unknown>;
		return { ...member, color: formatCssColor(member.color, token) };
	});
	return Array.isArray(token.value) ? formatted : formatted[0];
}

function formatDuration(
	value: unknown,
	token: WaveToken,
	field: string,
	requireNonNegative = false,
): string {
	if (typeof value !== 'string') {
		throw platformError(token, `${field} must be a normalized duration`);
	}
	const match = value
		.trim()
		.match(/^(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)(ms|s)$/i);
	if (!match?.[1] || !match[2]) {
		throw platformError(token, `${field} must use ms or s`);
	}
	if (requireNonNegative && Number(match[1]) < 0) {
		throw platformError(token, `${field} must be non-negative`);
	}
	return `${match[1]}${match[2]}`;
}

function formatCubicBezier(value: unknown, token: WaveToken): string {
	if (
		!Array.isArray(value) ||
		value.length !== 4 ||
		!value.every(
			(member) => typeof member === 'number' && Number.isFinite(member),
		) ||
		(value[0] as number) < 0 ||
		(value[0] as number) > 1 ||
		(value[2] as number) < 0 ||
		(value[2] as number) > 1
	) {
		throw platformError(
			token,
			'cubicBezier must contain four valid coordinates',
		);
	}
	return `cubic-bezier(${value.join(', ')})`;
}

function assertNonNegativeLength(
	value: unknown,
	token: WaveToken,
	field: string,
): string {
	const formatted = formatCssLength(value);
	const numeric = cssLengthNumber(value);
	if (numeric === undefined || numeric < 0) {
		throw platformError(token, `${field} must be a non-negative CSS length`);
	}
	return formatted;
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
		return formatShadowValue(layers, token);
	}

	if (isShadowToken(token)) {
		return formatShadowValue(withFormattedCompositeColors(token), token);
	}

	if (isGradient(token) && Array.isArray(tokenValue)) {
		return gradientToCss(withFormattedCompositeColors(token));
	}

	if (token.type === 'color') {
		return formatCssColor(tokenValue, token);
	}

	if (token.type === 'dimension') {
		return formatCssLength(tokenValue);
	}
	if (token.type === 'duration')
		return formatDuration(tokenValue, token, 'duration');
	if (token.type === 'cubicBezier') return formatCubicBezier(tokenValue, token);
	if (token.type === 'fontWeight') {
		const parsed = normalizeFontWeight(tokenValue);
		if (!parsed.ok) throw platformError(token, parsed.message);
		return String(parsed.value);
	}
	if (token.type === 'fontFamily') {
		return formatFontFamily(tokenValue);
	}
	if (token.type === 'transition')
		return formatTransitionValue(tokenValue, token);

	if (
		tokenValue === null ||
		typeof tokenValue === 'string' ||
		typeof tokenValue === 'number' ||
		typeof tokenValue === 'boolean'
	) {
		return String(tokenValue);
	}
	throw platformError(
		token,
		'unknown composite values require a dedicated formatter',
	);
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
		if (family.includes(',')) return family;
		if (
			SIMPLE_FONT_FAMILY_PATTERN.test(family) &&
			!CSS_WIDE_KEYWORDS.has(family.toLowerCase())
		) {
			return family;
		}
		return `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
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
	token: WaveToken,
): string {
	const parsed =
		field === 'lineHeight'
			? parseTypographyLineHeight(value)
			: parseTypographyDimension(value);
	if (parsed === undefined) {
		throw new Error(`CSS typography ${field} has an invalid value`);
	}
	if (field !== 'letterSpacing' && parsed.value < 0) {
		throw platformError(token, `typography ${field} must be non-negative`);
	}
	if (parsed.unit) return `${parsed.value}${parsed.unit}`;
	if (field === 'lineHeight') return String(parsed.value);
	if (field === 'letterSpacing' && parsed.value === 0) return '0';
	return `${parsed.value}px`;
}

function formatTypographyWeight(value: unknown): string {
	const numeric = parseTypographyNumber(value);
	const parsed = normalizeFontWeight(numeric);
	if (!parsed.ok) {
		throw new Error('CSS typography fontWeight has an invalid value');
	}
	return String(parsed.value);
}

interface TypographyCssReferences {
	familyKey?: string;
	colorKey?: string;
	colorValue?: string;
}

function typographyLines(
	key: string,
	value: unknown,
	token: WaveToken,
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
			`  --${key}-size: ${formatTypographyDimension(size, 'fontSize', token)};`,
		);
	}
	if (weight !== undefined) {
		lines.push(`  --${key}-weight: ${formatTypographyWeight(weight)};`);
	}
	if (lineHeight !== undefined) {
		lines.push(
			`  --${key}-line-height: ${formatTypographyDimension(lineHeight, 'lineHeight', token)};`,
		);
	}
	if (letterSpacing !== undefined) {
		lines.push(
			`  --${key}-letter-spacing: ${formatTypographyDimension(letterSpacing, 'letterSpacing', token)};`,
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
	lineCap?: string;
}

function formatBorderValue(
	value: unknown,
	token: WaveToken,
): FormattedBorderValue {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw platformError(token, 'border must be an object');
	}
	const obj = value as Record<string, unknown>;
	const width = assertNonNegativeLength(obj.width, token, 'border width');
	let style = 'solid';
	let dashArray: string | undefined;
	let lineCap: string | undefined;
	if (typeof obj.style === 'string') {
		style = obj.style;
	} else if (typeof obj.style === 'object' && obj.style !== null) {
		const styleObject = obj.style as Record<string, unknown>;
		dashArray = formatDashArray(styleObject.dashArray);
		if (
			styleObject.lineCap !== 'round' &&
			styleObject.lineCap !== 'butt' &&
			styleObject.lineCap !== 'square'
		) {
			throw platformError(
				token,
				'border lineCap must be round, butt, or square',
			);
		}
		lineCap = styleObject.lineCap;
		style = 'dashed';
	} else if (obj.style !== undefined) {
		throw new Error('CSS border style must be a string or dashArray object');
	}
	const color =
		obj.color === undefined ? 'currentColor' : formatCssColor(obj.color, token);
	return { value: `${width} ${style} ${color}`, dashArray, lineCap };
}

interface FormattedStrokeStyle {
	value: string;
	dashArray?: string;
	lineCap?: string;
}

function formatStrokeStyleValue(
	value: unknown,
	token: WaveToken,
): FormattedStrokeStyle {
	if (typeof value === 'string') return { value };
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw platformError(token, 'strokeStyle must be a string or object');
	}
	const style = value as Record<string, unknown>;
	if (
		style.lineCap !== 'round' &&
		style.lineCap !== 'butt' &&
		style.lineCap !== 'square'
	) {
		throw platformError(
			token,
			'strokeStyle lineCap must be round, butt, or square',
		);
	}
	return {
		value: 'dashed',
		dashArray: formatDashArray(style.dashArray),
		lineCap: style.lineCap,
	};
}

function formatTransitionValue(value: unknown, token: WaveToken): string {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw platformError(token, 'transition must be an object');
	}
	const transition = value as Record<string, unknown>;
	return [
		formatDuration(transition.duration, token, 'transition duration', true),
		formatCubicBezier(transition.timingFunction, token),
		formatDuration(transition.delay, token, 'transition delay'),
	].join(' ');
}

function formatShadowValue(value: unknown, token: WaveToken): string {
	const layers = Array.isArray(value) ? value : [value];
	for (const [index, layer] of layers.entries()) {
		if (typeof layer !== 'object' || layer === null || Array.isArray(layer)) {
			throw platformError(token, `shadow layer ${index} must be an object`);
		}
		assertNonNegativeLength(
			(layer as Record<string, unknown>).blur,
			token,
			`shadow layer ${index} blur`,
		);
	}
	return shadowToCss(value);
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

function findTypographyBaseFontSize(tokens: WaveToken[]): number | undefined {
	let baseFontSize: number | undefined;
	let baseToken: WaveToken | undefined;

	for (const token of tokens) {
		if (token.type !== 'typography') continue;
		const candidate = token._typographyBaseFontSize;
		if (candidate === undefined) continue;
		if (!Number.isFinite(candidate) || candidate <= 0) {
			throw new Error(
				`CSS typography baseFontSize must be a finite positive number at ${token.path.join('.')}`,
			);
		}
		if (baseFontSize === undefined) {
			baseFontSize = candidate;
			baseToken = token;
			continue;
		}
		if (candidate !== baseFontSize) {
			throw new Error(
				`CSS typography baseFontSize conflicts between ${baseToken!.path.join('.')} (${baseFontSize}) and ${token.path.join('.')} (${candidate})`,
			);
		}
	}

	return baseFontSize;
}

function cssCompanionSuffixes(token: WaveToken): string[] {
	if (token.type === 'strokeStyle') {
		return typeof token.value === 'object' &&
			token.value !== null &&
			!Array.isArray(token.value)
			? ['dash-array', 'line-cap']
			: [];
	}
	if (
		token.type !== 'border' ||
		typeof token.value !== 'object' ||
		token.value === null
	) {
		return [];
	}
	const style = (token.value as Record<string, unknown>).style;
	return typeof style === 'object' && style !== null && !Array.isArray(style)
		? ['dash-array', 'line-cap']
		: [];
}

function preflightCssKeys(tokens: WaveToken[], filterLayer: number): void {
	const owners = new Map<string, string>();
	for (const token of tokens) {
		const key = getFilteredName(token, filterLayer);
		const owner = token.path.join('.');
		const existing = owners.get(key);
		if (existing !== undefined) {
			throw new Error(
				`CSS variable --${key} collides between ${existing} and ${owner}`,
			);
		}
		owners.set(key, owner);
	}
	for (const token of tokens) {
		const key = getFilteredName(token, filterLayer);
		for (const suffix of cssCompanionSuffixes(token)) {
			const companionKey = `${key}-${suffix}`;
			const owner = `${token.path.join('.')} companion`;
			const existing = owners.get(companionKey);
			if (existing !== undefined) {
				throw new Error(
					`CSS companion --${companionKey} collides between ${existing} and ${owner}`,
				);
			}
			owners.set(companionKey, owner);
		}
	}
}

export const cssVariablesFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	const groupComments =
		(options?.groupComments as Record<string, string>) ?? {};
	const includeRootKeys = options?.includeRootKeys as string[] | undefined;

	const filtered = includeRootKeys
		? tokens.filter((t) => shouldInclude(t, includeRootKeys))
		: tokens;
	const sortedTokens = [...filtered].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);
	preflightCssKeys(sortedTokens, filterLayer);
	const baseFontSize = findTypographyBaseFontSize(sortedTokens);
	const lines: string[] = [':root {'];
	if (baseFontSize !== undefined) {
		lines.push(`  font-size: ${baseFontSize}px;`);
	}
	const emittedGroups = new Set<string>();
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
			if (
				typeof token.value !== 'object' ||
				token.value === null ||
				Array.isArray(token.value)
			) {
				throw platformError(token, 'typography must be an object');
			}
			const value = token.value as Record<string, unknown>;
			if (
				value.color !== undefined &&
				token._typographyColor === undefined &&
				!isDtcgColorSpaceValue(value.color)
			) {
				throw new Error(
					`CSS typography color is not normalized at ${token.path.join('.')}`,
				);
			}
			const family = formatFontFamily(value.fontFamily);
			lines.push(
				...typographyLines(key, token.value, token, {
					familyKey: familyKeys.get(family),
					colorKey:
						token._colorReference === undefined
							? undefined
							: colorKeys.get(token._colorReference),
					colorValue:
						token._typographyColor ??
						(value.color === undefined
							? undefined
							: formatCssColor(value.color, token)),
				}),
			);
			continue;
		}

		if (token.type === 'border') {
			const border = formatBorderValue(token.value, token);
			pushTokenDeclaration(lines, key, token, border.value);
			if (border.dashArray !== undefined) {
				const companionKey = `${key}-dash-array`;
				lines.push(`  --${companionKey}: ${border.dashArray};`);
			}
			if (border.lineCap !== undefined) {
				lines.push(`  --${key}-line-cap: ${border.lineCap};`);
			}
			if (isOutlineBorder(token)) {
				lines.push(
					`  --${key}-offset: ${formatCssLength(token._outline!.offset)};`,
				);
			}
			continue;
		}

		if (token.type === 'strokeStyle') {
			const style = formatStrokeStyleValue(token.value, token);
			pushTokenDeclaration(lines, key, token, style.value);
			if (style.dashArray !== undefined) {
				lines.push(`  --${key}-dash-array: ${style.dashArray};`);
			}
			if (style.lineCap !== undefined) {
				lines.push(`  --${key}-line-cap: ${style.lineCap};`);
			}
			continue;
		}

		const cssValue = formatTokenValue(token);
		pushTokenDeclaration(lines, key, token, cssValue);
	}

	lines.push('}');
	return lines.join('\n');
};
