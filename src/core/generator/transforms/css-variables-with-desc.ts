import type {
	Dictionary,
	Format,
	TransformedToken,
} from 'style-dictionary/types';
import { gradientToCss, shadowToCss } from './css-var.ts';

export interface CssVariablesWithDescOptions {
	filterLayer?: number;
	groupComments?: Record<string, string>;
	includeRootKeys?: string[];
}

function getFilteredName(token: TransformedToken, filterLayer: number): string {
	const path = token.path;
	if (filterLayer <= 0 || path.length <= filterLayer) {
		return token.name;
	}
	return path.slice(filterLayer).join('-');
}

function isShadowToken(token: TransformedToken): boolean {
	return token.type === 'shadow' || token.$type === 'shadow';
}

function isGradientToken(token: TransformedToken): boolean {
	return token.type === 'gradient' || token.$type === 'gradient';
}

function formatTokenValue(token: TransformedToken): string {
	// inheritColor v1: check inheritColor metadata first
	const inheritColor = (token as Record<string, unknown>).inheritColor;
	const inheritColorOpacity = (token as Record<string, unknown>)
		.inheritColorOpacity;
	const inheritColorAlpha = (token as Record<string, unknown>)
		.inheritColorAlpha;

	if (inheritColor === true) {
		const numericValue =
			typeof inheritColorAlpha === 'number'
				? inheritColorAlpha
				: inheritColorOpacity;
		if (typeof numericValue === 'number') {
			const percent = Math.round(numericValue * 100);
			return `color-mix(in srgb, currentColor ${percent}%, transparent)`;
		}
		// Plain inheritColor without opacity/alpha
		return 'currentColor';
	}

	// Legacy currentColor support (deprecated)
	const currentColorOpacity = (token as Record<string, unknown>)
		.currentColorOpacity;
	if (typeof currentColorOpacity === 'number') {
		const percent = Math.round(currentColorOpacity * 100);
		return `color-mix(in srgb, currentColor ${percent}%, transparent)`;
	}

	const tokenValue = token.$value ?? token.value;

	// currentColor shadow: replace color with color-mix
	const currentColorShadowAlpha = (token as Record<string, unknown>)
		.currentColorShadowAlpha;
	if (
		typeof currentColorShadowAlpha === 'number' &&
		Array.isArray(tokenValue)
	) {
		const percent = Math.round(currentColorShadowAlpha * 100);
		const layers = (tokenValue as unknown[]).map((layer) => {
			if (typeof layer !== 'object' || layer === null) return layer;
			const l = { ...layer } as Record<string, unknown>;
			l.color = `color-mix(in srgb, currentColor ${percent}%, transparent)`;
			return l;
		});
		return shadowToCss(layers);
	}

	if (isShadowToken(token) && Array.isArray(tokenValue)) {
		return shadowToCss(tokenValue);
	}

	if (isGradientToken(token) && Array.isArray(tokenValue)) {
		return gradientToCss(tokenValue);
	}

	return String(tokenValue);
}

function getGroupCommentPaths(tokenPath: string[]): string[] {
	const paths: string[] = [];
	// path = ['theme', 'color', 'inverse', 'surface']
	// group paths: 'theme.color.inverse', 'theme.color', 'theme'
	for (let i = 1; i < tokenPath.length; i++) {
		paths.push(tokenPath.slice(0, i).join('.'));
	}
	return paths;
}

function shouldInclude(
	token: TransformedToken,
	includeRootKeys?: string[],
): boolean {
	if (!includeRootKeys || includeRootKeys.length === 0) return true;
	const rootKey = token.path[1];
	return typeof rootKey === 'string' && includeRootKeys.includes(rootKey);
}

function formatCssVariables(
	tokens: TransformedToken[],
	filterLayer: number = 0,
	groupComments: Record<string, string> = {},
	includeRootKeys?: string[],
): string {
	console.log(
		'formatCssVariables called, includeRootKeys:',
		includeRootKeys,
		'token count:',
		tokens.length,
		'sample paths:',
		tokens.slice(0, 3).map((t) => t.path),
	);
	const lines: string[] = [':root {'];

	// 按 includeRootKeys 过滤后再排序
	const filtered = includeRootKeys
		? tokens.filter((t) => shouldInclude(t, includeRootKeys))
		: tokens;
	const sortedTokens = [...filtered].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);
	const emittedGroups = new Set<string>();

	for (const token of sortedTokens) {
		const key = getFilteredName(token, filterLayer);
		const cssValue = formatTokenValue(token);

		// 输出 group 级别的 description（第一次遇到该 group 的 token 时）
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

		const description =
			token.$description || token.description || token.comment;
		if (description && typeof description === 'string' && description !== '~') {
			const isMultilineDescription = description.includes('\n');
			if (isMultilineDescription) {
				const descLines = description.split('\n');
				for (const descLine of descLines) {
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

	lines.push('}');
	return lines.join('\n');
}

export const cssVariablesWithDescFormat: Format = {
	name: 'wave/css-variables',
	format: ({
		dictionary,
		options,
	}: {
		dictionary: Dictionary;
		options: Record<string, unknown>;
	}) => {
		const filterLayer = (options?.filterLayer as number) ?? 0;
		const groupComments =
			(options?.groupComments as Record<string, string>) ?? {};
		const includeRootKeys = options?.includeRootKeys as string[] | undefined;
		return formatCssVariables(
			dictionary.allTokens,
			filterLayer,
			groupComments,
			includeRootKeys,
		);
	},
};

export default cssVariablesWithDescFormat;
