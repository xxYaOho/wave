/**
 * Sketch payload meta identities for Token Manage series import
 * (`currentByBaseId`).
 *
 * Prefer the document `$id` when registered; otherwise derive from the
 * `$config.theme` stem so main builds never emit a null `baseId`.
 */
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
}): { themeId?: string; baseId: string } {
	const stem =
		nonEmptyId(input.themeStem) ??
		nonEmptyId(input.mainThemeId) ??
		nonEmptyId(input.documentThemeId) ??
		'theme';
	const mainId = nonEmptyId(input.mainThemeId) ?? stem;
	if (input.isDefault) {
		const themeId = nonEmptyId(input.documentThemeId) ?? stem;
		return { themeId, baseId: themeId };
	}
	const themeId = nonEmptyId(input.documentThemeId);
	return themeId === undefined
		? { baseId: mainId }
		: { themeId, baseId: mainId };
}
