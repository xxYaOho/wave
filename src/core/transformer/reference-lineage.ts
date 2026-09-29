import type { ResolvedTokenGroup, WaveToken } from '../../types/index.ts';
import type {
	ReferencePathSegment,
	ReferenceProvenance,
	ReferenceProvenanceMap,
} from '../schema/dtcg-reference-types.ts';
import { TYPOGRAPHY_FIELDS } from '../typography-value.ts';

export interface TokenReferenceLineage {
	valuePath: readonly ReferencePathSegment[];
	targetPath: readonly string[];
}

export interface TransformReferenceContext {
	provenance: ReferenceProvenanceMap;
	rootKeys: ReadonlySet<string>;
}

const referencesByToken = new WeakMap<
	WaveToken,
	readonly TokenReferenceLineage[]
>();

export function setTokenReferenceLineage(
	token: WaveToken,
	lineage: readonly TokenReferenceLineage[],
): void {
	referencesByToken.set(token, lineage);
}

export function getTokenReferenceLineage(
	token: WaveToken,
): readonly TokenReferenceLineage[] {
	return referencesByToken.get(token) ?? [];
}

function hasPrefix(
	path: readonly ReferencePathSegment[],
	prefix: readonly ReferencePathSegment[],
): boolean {
	return (
		path.length >= prefix.length &&
		prefix.every((segment, index) => Object.is(segment, path[index]))
	);
}

function isResolvedTokenAtPath(
	resolved: ResolvedTokenGroup,
	path: readonly string[],
): boolean {
	let current: unknown = resolved;
	for (const segment of path) {
		if (
			typeof current !== 'object' ||
			current === null ||
			Array.isArray(current)
		) {
			return false;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return (
		typeof current === 'object' &&
		current !== null &&
		!Array.isArray(current) &&
		'$value' in current
	);
}

function targetTokenPath(
	resolved: ResolvedTokenGroup,
	targetSegments: readonly string[],
): readonly string[] | undefined {
	const valueIndex = targetSegments.indexOf('$value');
	if (valueIndex >= 0 && valueIndex !== targetSegments.length - 1) {
		return undefined;
	}
	const tokenPath =
		valueIndex === targetSegments.length - 1
			? targetSegments.slice(0, -1)
			: [...targetSegments];
	return isResolvedTokenAtPath(resolved, tokenPath) ? tokenPath : undefined;
}

function eligibleTarget(
	entry: ReferenceProvenance,
	resolved: ResolvedTokenGroup,
	rootKeys: ReadonlySet<string>,
): readonly string[] | undefined {
	if (
		entry.scope !== 'internal' ||
		!entry.identity ||
		entry.targetSegments[0] !== 'theme' ||
		!rootKeys.has('theme')
	) {
		return undefined;
	}
	return targetTokenPath(resolved, entry.targetSegments);
}

export function tokenReferenceLineage(
	tokenPath: readonly string[],
	resolved: ResolvedTokenGroup,
	context: TransformReferenceContext | undefined,
): readonly TokenReferenceLineage[] {
	if (!context) return [];
	const prefix: readonly ReferencePathSegment[] = [...tokenPath, '$value'];
	const lineage: TokenReferenceLineage[] = [];
	for (const entry of context.provenance.values()) {
		if (!hasPrefix(entry.consumerSegments, prefix)) continue;
		const targetPath = eligibleTarget(entry, resolved, context.rootKeys);
		if (!targetPath) continue;
		lineage.push({
			valuePath: entry.consumerSegments.slice(prefix.length),
			targetPath,
		});
	}
	return lineage;
}

export function typographyDefaultReferenceLineage(
	groupPath: readonly string[],
	resolved: ResolvedTokenGroup,
	context: TransformReferenceContext | undefined,
): ReadonlyMap<string, TokenReferenceLineage> {
	const lineage = new Map<string, TokenReferenceLineage>();
	if (!context) return lineage;
	const prefix: readonly ReferencePathSegment[] = [
		...groupPath,
		'$extensions',
		'typography',
	];
	for (const entry of context.provenance.values()) {
		if (
			entry.consumerSegments.length !== prefix.length + 1 ||
			!hasPrefix(entry.consumerSegments, prefix)
		) {
			continue;
		}
		const field = entry.consumerSegments[prefix.length];
		if (
			typeof field !== 'string' ||
			!TYPOGRAPHY_FIELDS.some((candidate) => candidate === field)
		)
			continue;
		const targetPath = eligibleTarget(entry, resolved, context.rootKeys);
		if (!targetPath) continue;
		lineage.set(field, { valuePath: [field], targetPath });
	}
	return lineage;
}
