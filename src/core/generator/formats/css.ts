import type { WaveFormatFn, WaveToken } from '../../../types/index.ts';
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

	return String(tokenValue);
}

function getGroupCommentPaths(tokenPath: string[]): string[] {
	const paths: string[] = [];
	for (let i = 1; i < tokenPath.length; i++) {
		paths.push(tokenPath.slice(0, i).join('.'));
	}
	return paths;
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

	for (const token of sortedTokens) {
		const key = getFilteredName(token, filterLayer);
		const cssValue = formatTokenValue(token);

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

	lines.push('}');
	return lines.join('\n');
};
