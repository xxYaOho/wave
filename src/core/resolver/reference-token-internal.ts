import type {
	ReferenceDataSources,
	ResolvedDtcgToken,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgRefValue } from '../../types/index.ts';
import type { UnresolvedReference } from './errors.ts';
import {
	deriveSwatchNameFromDtcgRef,
	deriveSwatchNameFromStringRef,
} from './reference-utils.ts';
import {
	type NestedValue,
	resolveNestedInternalRefs,
} from './reference-value-resolver.ts';

export function processTokenInternal(
	token: ResolvedDtcgToken,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	currentPath: string,
	unresolvedCollector: UnresolvedReference[],
	rootKeys: Set<string>,
): ResolvedDtcgToken {
	const resolutionPath = currentPath ? [currentPath] : [];
	const resolvedValue = resolveNestedInternalRefs(
		token.$value as NestedValue,
		sources,
		themeTree,
		resolutionPath,
		unresolvedCollector,
		currentPath,
		rootKeys,
	) as ResolvedDtcgToken['$value'];

	let swatchName: string | undefined;
	if (typeof token.$value === 'string') {
		swatchName = deriveSwatchNameFromStringRef(token.$value);
	} else if (isDtcgRefValue(token.$value)) {
		swatchName = deriveSwatchNameFromDtcgRef(token.$value.$ref);
	}
	// 多轮 internal 解析时，若当前轮次无法推导 swatchName，保留已有的
	if (swatchName === undefined && token._swatchName !== undefined) {
		swatchName = token._swatchName;
	}

	const resolvedExtensions = token.$extensions
		? Object.fromEntries(
				Object.entries(token.$extensions).map(([k, v]) => [
					k,
					resolveNestedInternalRefs(
						v as NestedValue,
						sources,
						themeTree,
						resolutionPath,
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

export function processTokenGroupInternal(
	group: ResolvedTokenGroup,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	parentPath: string,
	unresolvedCollector: UnresolvedReference[],
	rootKeys: Set<string>,
): ResolvedTokenGroup {
	const result: ResolvedTokenGroup = {};

	if (group.$type !== undefined) {
		result.$type = group.$type;
	}

	if (group.$description !== undefined) {
		result.$description = group.$description;
	}

	if (group.$extensions !== undefined) {
		const resolutionPath = parentPath ? [parentPath] : [];
		result.$extensions = Object.fromEntries(
			Object.entries(group.$extensions).map(([key, value]) => [
				key,
				resolveNestedInternalRefs(
					value as NestedValue,
					sources,
					themeTree,
					resolutionPath,
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

		if (typeof value === 'object' && value !== null && '$value' in value) {
			result[key] = processTokenInternal(
				value as ResolvedDtcgToken,
				sources,
				themeTree,
				currentPath,
				unresolvedCollector,
				rootKeys,
			);
		} else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value)
		) {
			result[key] = processTokenGroupInternal(
				value as ResolvedTokenGroup,
				sources,
				themeTree,
				currentPath,
				unresolvedCollector,
				rootKeys,
			);
		} else {
			result[key] = value;
		}
	}

	return result;
}
