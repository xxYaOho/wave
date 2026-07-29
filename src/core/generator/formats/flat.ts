import type { WaveFormatFn, WaveToken } from '../../../types/index.ts';

export interface FlatFormatOptions {
	filterLayer?: number;
}

function getFilteredName(token: WaveToken, filterLayer: number): string {
	const path = token.path;
	if (filterLayer <= 0 || path.length <= filterLayer) {
		return token.name;
	}
	return path.slice(filterLayer).join('-');
}

function isInheritColorToken(token: WaveToken): boolean {
	return token.inheritColor === true;
}

function formatInheritColorValue(token: WaveToken): unknown {
	const alpha = token.inheritColorAlpha;
	const opacity = token.inheritColorOpacity;
	if (typeof alpha === 'number' && typeof opacity === 'number') {
		return { color: '$COLOR_FOREGROUND', alpha, opacity };
	}
	if (typeof alpha === 'number') {
		return { color: '$COLOR_FOREGROUND', alpha };
	}
	if (typeof opacity === 'number') {
		return { color: '$COLOR_FOREGROUND', opacity };
	}
	return '$COLOR_FOREGROUND';
}

function buildFlatRecord(
	tokens: WaveToken[],
	filterLayer: number,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const compositeGroups: Record<string, Record<string, unknown>> = {};

	for (const token of tokens) {
		const compositePath = token._composite;
		let tokenValue: unknown;

		if (isInheritColorToken(token)) {
			tokenValue = formatInheritColorValue(token);
		} else {
			tokenValue = token.value;
		}

		if (compositePath) {
			const path = token.path;
			const propKey = path[path.length - 1]!;
			if (!compositeGroups[compositePath]) {
				compositeGroups[compositePath] = {};
			}
			compositeGroups[compositePath][propKey] = tokenValue;
		} else {
			const key = getFilteredName(token, filterLayer);
			result[key] = tokenValue;
		}
	}

	for (const [compositePath, compositeObj] of Object.entries(compositeGroups)) {
		const key = compositePath.split('.').slice(filterLayer).join('-');
		result[key] = compositeObj;
	}

	return result;
}

export const flatJsonFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	return JSON.stringify(buildFlatRecord(tokens, filterLayer), null, 2);
};

export const flatJsoncFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	const lines: string[] = ['{'];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		const key = getFilteredName(token, filterLayer);
		let tokenValue: unknown;

		if (isInheritColorToken(token)) {
			tokenValue = formatInheritColorValue(token);
		} else {
			tokenValue = token.value;
		}

		const description = token.comment;
		const isMultilineDescription =
			description &&
			typeof description === 'string' &&
			description.includes('\n');
		const comma = i < tokens.length - 1 ? ',' : '';

		if (description && typeof description === 'string' && description !== '~') {
			if (isMultilineDescription) {
				for (const descLine of description.split('\n')) {
					lines.push(`  // ${descLine}`);
				}
				lines.push(`  "${key}": ${JSON.stringify(tokenValue)}${comma}`);
			} else {
				lines.push(
					`  "${key}": ${JSON.stringify(tokenValue)}${comma} // ${description}`,
				);
			}
		} else {
			lines.push(`  "${key}": ${JSON.stringify(tokenValue)}${comma}`);
		}
	}

	lines.push('}');
	return lines.join('\n');
};
