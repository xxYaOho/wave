import type {
	DtcgToken,
	DtcgTokenGroup,
	ReferenceDataSources,
	ResolvedDtcgToken,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgRefValue, isDtcgToken } from '../../types/index.ts';
import type { UnresolvedReference } from './errors.ts';
import {
	deriveSwatchNameFromDtcgRef,
	deriveSwatchNameFromStringRef,
} from './reference-utils.ts';
import {
	type NestedValue,
	resolveExternalDtcgValue,
	resolveNestedRefs,
} from './reference-value-resolver.ts';

export function processTokenExternal(
	token: DtcgToken,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	unresolvedCollector: UnresolvedReference[],
	currentPath: string = '',
	rootKeys: Set<string>,
): ResolvedDtcgToken {
	const resolvedValue = resolveExternalDtcgValue(
		token.$value,
		sources,
		themeTree,
		[],
		unresolvedCollector,
		currentPath,
		rootKeys,
	);

	let swatchName: string | undefined;
	if (typeof token.$value === 'string') {
		swatchName = deriveSwatchNameFromStringRef(token.$value);
	} else if (isDtcgRefValue(token.$value)) {
		swatchName = deriveSwatchNameFromDtcgRef(token.$value.$ref);
	}

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
						`${currentPath}.$extensions.${k}`,
						rootKeys,
					),
				]),
			)
		: undefined;

	return {
		$value: resolvedValue,
		...(token.$type !== undefined && { $type: token.$type }),
		...(token.$description !== undefined && {
			$description: token.$description,
		}),
		...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
		...(resolvedExtensions !== undefined && {
			$extensions: resolvedExtensions,
		}),
		...(swatchName !== undefined && { _swatchName: swatchName }),
	};
}

export function processTokenGroupExternal(
	group: DtcgTokenGroup,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	unresolvedCollector: UnresolvedReference[],
	rootKeys: Set<string>,
	parentPath: string = '',
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
					`${parentPath}.$extensions.${key}`,
					rootKeys,
				),
			]),
		);
	}

	for (const [key, value] of Object.entries(group)) {
		if (key === '$type' || key === '$description' || key === '$extensions') {
			continue;
		}
		const currentPath = parentPath ? `${parentPath}.${key}` : key;

		if (isDtcgToken(value)) {
			result[key] = processTokenExternal(
				value,
				sources,
				themeTree,
				unresolvedCollector,
				currentPath,
				rootKeys,
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
			);
		} else {
			result[key] = value as string | number | boolean | undefined;
		}
	}

	return result;
}
