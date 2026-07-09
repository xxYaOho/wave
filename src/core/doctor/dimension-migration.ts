export const DIMENSION_BUILD_WARNING =
	'theme.dimension is no longer a public output root; run wave dt doctor for migration guidance.';

export type DimensionMigrationFinding = {
	path: string;
	reason: 'public-root' | 'resource' | 'reference';
};

export interface DimensionMigrationOptions {
	includeDependencies?: boolean;
}

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

function walkDimensionReferences(
	value: unknown,
	path: string[],
	findings: DimensionMigrationFinding[],
): void {
	if (typeof value === 'string') {
		if (value.includes('wave.dimension.')) {
			findings.push({
				path: path.length > 0 ? path.join('.') : 'root',
				reason: 'reference',
			});
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			walkDimensionReferences(item, [...path, String(index)], findings),
		);
		return;
	}
	if (typeof value !== 'object' || value === null) {
		return;
	}
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		walkDimensionReferences(child, [...path, key], findings);
	}
}

export function findDimensionMigrationFindings(
	tree: unknown,
	options: DimensionMigrationOptions = {},
): DimensionMigrationFinding[] {
	const findings: DimensionMigrationFinding[] = [];
	for (const path of findPublicDimensionRoots(tree)) {
		findings.push({ path, reason: 'public-root' });
	}
	if (
		options.includeDependencies === true &&
		typeof tree === 'object' &&
		tree !== null &&
		!Array.isArray(tree)
	) {
		const root = tree as Record<string, unknown>;
		const config = root.$config;
		if (
			typeof config === 'object' &&
			config !== null &&
			!Array.isArray(config)
		) {
			const resource = (config as Record<string, unknown>).resource;
			if (
				typeof resource === 'object' &&
				resource !== null &&
				!Array.isArray(resource) &&
				'dimension' in resource
			) {
				findings.push({
					path: '$config.resource.dimension',
					reason: 'resource',
				});
			}
		}
	}
	if (options.includeDependencies === true) {
		walkDimensionReferences(tree, [], findings);
	}
	const seen = new Set<string>();
	return findings.filter((finding) => {
		const key = `${finding.reason}:${finding.path}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function renderDimensionMigrationAdvice(
	pathsOrFindings: string[] | DimensionMigrationFinding[],
): string {
	const findings = pathsOrFindings.map((item) =>
		typeof item === 'string'
			? { path: item, reason: 'public-root' as const }
			: item,
	);
	return [
		'theme.dimension is no longer a public output root.',
		'Move public tokens to the new roots:',
		'- theme.dimension.interaction.* -> theme.state.*',
		'- theme.dimension.shadow.* -> theme.shadow.elevation.*',
		'- theme.dimension.gradient-mask-smooth -> theme.gradient.mask.soft',
		'- theme.dimension.gradient-mask-smooth-media -> theme.gradient.mask.strong',
		'- theme.dimension.radius.* -> theme.radius.*',
		'Also remove legacy dimension resource dependencies when they only feed public output:',
		'- $config.resource.dimension',
		'- {wave.dimension.*} references',
		'Detected paths:',
		...findings.map((finding) => `- ${finding.path}`),
	].join('\n');
}
