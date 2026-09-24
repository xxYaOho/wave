import type {
	SketchPayloadV2,
	WaveFormatFn,
	WaveToken,
} from '../../../types/index.ts';
import {
	assembleSketchPayload,
	buildSketchWriteTokens,
} from './sketch-payload.ts';

export const sketchFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	const includeRootKeys = options?.includeRootKeys as string[] | undefined;
	const themeId =
		typeof options?.themeId === 'string' && options.themeId.trim() !== ''
			? options.themeId
			: undefined;
	const allTokens = [...tokens].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);
	const writeTokens = buildSketchWriteTokens(allTokens, {
		filterLayer,
		includeRootKeys,
	});
	const payload: SketchPayloadV2 = assembleSketchPayload(
		writeTokens,
		allTokens,
		{ themeId, filterLayer },
	);
	return JSON.stringify(payload, null, 2);
};
