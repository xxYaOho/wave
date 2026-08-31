import type {
	DtcgTokenGroup,
	ReferenceDataSources,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import type { ReferenceProvenanceMap } from '../schema/dtcg-reference-types.ts';
import {
	type UnresolvedReference,
	UnresolvedReferenceError,
} from './errors.ts';
import {
	collectInternalReferences,
	groupHasInternalReferences,
	processTokenGroupExternal,
	processTokenGroupInternal,
} from './reference-token-processor.ts';
import { inferRootKeys } from './reference-utils.ts';

export interface ReferenceResolutionResult {
	tree: ResolvedTokenGroup;
	provenance: ReferenceProvenanceMap;
	rootKeys: ReadonlySet<string>;
}

export function resolveReferences(
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
): ReferenceResolutionResult {
	const rootKeys = inferRootKeys(tree);
	const provenance: ReferenceProvenanceMap = new Map();

	// 首先创建一个空的 themeTree 占位符，用于 Pass 1
	// Pass 1 完成后，themeTree 会被更新为解析后的结果
	const emptyThemeTree: ResolvedTokenGroup = {};

	// Pass 1: Resolve external references (leonardo.*, wave.*, 以及所有 #/.../$value 格式的 $ref)
	const pass1Unresolved: UnresolvedReference[] = [];
	let result = processTokenGroupExternal(
		tree,
		sources,
		emptyThemeTree,
		pass1Unresolved,
		rootKeys,
		{ label: '', segments: [] },
		provenance,
	);

	if (pass1Unresolved.length > 0) {
		throw new UnresolvedReferenceError(pass1Unresolved);
	}

	// Pass 2: Resolve internal references (文档内部根 key 下的引用)
	const unresolvedCollector: UnresolvedReference[] = [];
	const unresolvedSet = new Set<string>();
	let maxIterations = 10;
	while (groupHasInternalReferences(result, rootKeys) && maxIterations > 0) {
		result = processTokenGroupInternal(
			result,
			sources,
			result,
			{ label: '', segments: [] },
			unresolvedCollector,
			rootKeys,
			provenance,
		);
		maxIterations--;
	}

	// CQ-006: Treat iteration exhaustion as failure (potential multi-node cycle)
	if (maxIterations === 0 && groupHasInternalReferences(result, rootKeys)) {
		// Collect remaining unresolved references for error message
		const remainingRefs = collectInternalReferences(result, rootKeys);
		const rootKeyLabel = [...rootKeys].join('|');
		throw new UnresolvedReferenceError(
			remainingRefs.map((ref) => ({
				ref,
				location: rootKeyLabel,
				message: `Reference resolution exhausted after max iterations (possible circular reference): ${ref}`,
			})),
		);
	}

	if (unresolvedCollector.length > 0) {
		const uniqueReferences = unresolvedCollector.filter((item) => {
			const key = `${item.ref}|${item.location}`;
			if (unresolvedSet.has(key)) {
				return false;
			}
			unresolvedSet.add(key);
			return true;
		});
		throw new UnresolvedReferenceError(uniqueReferences);
	}

	return { tree: result, provenance, rootKeys };
}
