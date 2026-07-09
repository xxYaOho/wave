export const DIMENSION_BUILD_WARNING =
	'theme.dimension is no longer a public output root; run wave dt doctor for migration guidance.';

export function findPublicDimensionRoots(tree: unknown): string[] {
	if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) {
		return [];
	}
	const root = tree as Record<string, unknown>;
	const theme = root.theme;
	if (typeof theme !== 'object' || theme === null || Array.isArray(theme)) {
		return [];
	}
	const dimension = (theme as Record<string, unknown>).dimension;
	if (
		typeof dimension !== 'object' ||
		dimension === null ||
		Array.isArray(dimension)
	) {
		return [];
	}
	return Object.keys(dimension as Record<string, unknown>)
		.filter((key) => !key.startsWith('$'))
		.map((key) => `theme.dimension.${key}`);
}

export function renderDimensionMigrationAdvice(paths: string[]): string {
	return [
		'theme.dimension is no longer a public output root.',
		'Move public tokens to the new roots:',
		'- theme.dimension.interaction.* -> theme.state.*',
		'- theme.dimension.shadow.* -> theme.shadow.elevation.*',
		'- theme.dimension.gradient-mask-smooth -> theme.gradient.mask.soft',
		'- theme.dimension.gradient-mask-smooth-media -> theme.gradient.mask.strong',
		'- theme.dimension.radius.* -> theme.radius.*',
		'Detected paths:',
		...paths.map((path) => `- ${path}`),
	].join('\n');
}
