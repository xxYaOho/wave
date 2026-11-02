/**
 * Sketch payload meta identities for Token Manage series import
 * (`currentByBaseId`).
 *
 * Prefer the document `$id` when registered; otherwise derive from the
 * `$config.theme` stem so main builds never emit a null `baseId`.
 * Day and Night share the same `themeId` / `baseId`; distinguish with
 * `meta.mode` (`day` | `night`). Overlay files remain `*@night.yaml`.
 */
export type SketchThemeMode = 'day' | 'night';

function nonEmptyId(value: string | undefined): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

export function sketchPassIds(input: {
	isDefault: boolean;
	documentThemeId?: string | undefined;
	mainThemeId?: string | undefined;
	themeStem: string;
}): { themeId?: string; baseId: string; mode: 'day' } {
	const stem =
		nonEmptyId(input.themeStem) ??
		nonEmptyId(input.mainThemeId) ??
		nonEmptyId(input.documentThemeId) ??
		'theme';
	const mainId = nonEmptyId(input.mainThemeId) ?? stem;
	if (input.isDefault) {
		const themeId = nonEmptyId(input.documentThemeId) ?? stem;
		return { themeId, baseId: themeId, mode: 'day' };
	}
	const themeId = nonEmptyId(input.documentThemeId);
	return themeId === undefined
		? { baseId: mainId, mode: 'day' }
		: { themeId, baseId: mainId, mode: 'day' };
}

/**
 * Night Sketch identity: same `themeId` / `baseId` as Day; `mode` = `night`.
 */
export function sketchNightPassIds(input: {
	isDefault: boolean;
	documentThemeId?: string | undefined;
	mainThemeId?: string | undefined;
	themeStem: string;
}): { themeId?: string; baseId: string; mode: 'night' } {
	const day = sketchPassIds(input);
	return { themeId: day.themeId, baseId: day.baseId, mode: 'night' };
}
