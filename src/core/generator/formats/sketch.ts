import type {
	SketchPayloadV2,
	SketchSwatchRefMode,
	WaveFormatFn,
	WaveToken,
} from '../../../types/index.ts';
import {
	assembleSketchPayload,
	buildSketchWriteTokens,
} from './sketch-payload.ts';

/**
 * Trial-period swatch binding switch (decision 6). `'ref'` emits
 * `{ "$ref": "<uuid>" }` at swatch-bindable color positions; flipping this
 * single constant to `'hex'` degrades the whole payload to HEX8 snapshots
 * if the plugin's `$ref` update path proves unstable.
 */
export const SKETCH_SWATCH_REF_MODE: SketchSwatchRefMode = 'ref';

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
		{ themeId, filterLayer, swatchRefMode: SKETCH_SWATCH_REF_MODE },
	);
	return JSON.stringify(payload, null, 2);
};
