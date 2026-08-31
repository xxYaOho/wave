import type { WaveToken } from '../../../types/index.ts';

export function formatFlatTokenValue(token: WaveToken): unknown {
	if (token.inheritColor !== true) return token.value;

	const value: Record<string, unknown> = { color: '$COLOR_FOREGROUND' };
	if (typeof token.inheritColorAlpha === 'number') {
		value.alpha = token.inheritColorAlpha;
	}
	if (typeof token.inheritColorOpacity === 'number') {
		value.opacity = token.inheritColorOpacity;
	}
	return Object.keys(value).length === 1 ? '$COLOR_FOREGROUND' : value;
}
