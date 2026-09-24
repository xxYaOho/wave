import type {
	DtcgToken,
	DtcgTokenGroup,
	ReferenceDataSources,
	ResolvedDtcgToken,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgRefValue, isDtcgToken } from '../../types/index.ts';
import {
	appendReferenceLocation,
	type ReferenceLocation,
	type ReferenceProvenanceMap,
} from '../schema/dtcg-reference-types.ts';
import type { UnresolvedReference } from './errors.ts';
import {
	deriveSwatchNameFromDtcgRef,
	deriveSwatchNameFromStringRef,
	extractDirectColorReference,
} from './reference-utils.ts';
import {
	type NestedValue,
	resolveNestedRefs,
} from './reference-value-resolver.ts';

function groupExtensionLocation(
	parentPath: ReferenceLocation,
	key: string,
): ReferenceLocation {
	const location = appendReferenceLocation(
		appendReferenceLocation(parentPath, '$extensions'),
		key,
	);
	return parentPath.label
		? location
		: { ...location, label: `.${location.label}` };
}

export function processTokenExternal(
	token: DtcgToken,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	unresolvedCollector: UnresolvedReference[],
	currentPath: ReferenceLocation = { label: '', segments: [] },
	rootKeys: Set<string>,
	provenance?: ReferenceProvenanceMap,
): ResolvedDtcgToken {
	const resolvedValue = resolveNestedRefs(
		token.$value as NestedValue,
		sources,
		themeTree,
		[],
		unresolvedCollector,
		appendReferenceLocation(currentPath, '$value'),
		rootKeys,
		provenance,
	) as ResolvedDtcgToken['$value'];

	let swatchName: string | undefined;
	if (typeof token.$value === 'string') {
		swatchName = deriveSwatchNameFromStringRef(token.$value);
	} else if (isDtcgRefValue(token.$value)) {
		swatchName = deriveSwatchNameFromDtcgRef(token.$value.$ref);
	}
	const colorReference = extractDirectColorReference(token.$value);

	const resolvedExtensions = token.$extensions
		? Object.fromEntries(
				Object.entries(token.$extensions).map(([k, v]) => [
					k,
					resolveNestedRefs(
						v as NestedValue,
						sources,
						themeTree,
						[],
						unresolvedCollector,
						appendReferenceLocation(
							appendReferenceLocation(currentPath, '$extensions'),
							k,
						),
						rootKeys,
						provenance,
					),
				]),
			)
		: undefined;

	return {
		$value: resolvedValue,
		...(token.$type !== undefined && { $type: token.$type }),
		...(token.$id !== undefined && { $id: token.$id }),
		...(token.$description !== undefined && {
			$description: token.$description,
		}),
		...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
		...(resolvedExtensions !== undefined && {
			$extensions: resolvedExtensions,
		}),
		...(swatchName !== undefined && { _swatchName: swatchName }),
		...(colorReference !== undefined && { _colorReference: colorReference }),
	};
}

export function processTokenGroupExternal(
	group: DtcgTokenGroup,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	unresolvedCollector: UnresolvedReference[],
	rootKeys: Set<string>,
	parentPath: ReferenceLocation = { label: '', segments: [] },
	provenance?: ReferenceProvenanceMap,
): ResolvedTokenGroup {
	const result: ResolvedTokenGroup = {};

	if (group.$type !== undefined) {
		result.$type = group.$type;
	}

	if (group.$description !== undefined) {
		result.$description = group.$description;
	}

	if (group.$extensions !== undefined) {
		result.$extensions = Object.fromEntries(
			Object.entries(group.$extensions).map(([key, value]) => [
				key,
				resolveNestedRefs(
					value as NestedValue,
					sources,
					themeTree,
					[],
					unresolvedCollector,
					groupExtensionLocation(parentPath, key),
					rootKeys,
					provenance,
				),
			]),
		);
	}

	for (const [key, value] of Object.entries(group)) {
		if (key === '$type' || key === '$description' || key === '$extensions') {
			continue;
		}
		const currentPath = appendReferenceLocation(parentPath, key);

		if (isDtcgToken(value)) {
			result[key] = processTokenExternal(
				value,
				sources,
				themeTree,
				unresolvedCollector,
				currentPath,
				rootKeys,
				provenance,
			);
		} else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value)
		) {
			result[key] = processTokenGroupExternal(
				value as DtcgTokenGroup,
				sources,
				themeTree,
				unresolvedCollector,
				rootKeys,
				currentPath,
				provenance,
			);
		} else {
			result[key] = value as string | number | boolean | undefined;
		}
	}

	return result;
}
