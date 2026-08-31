import type {
	DtcgValue,
	ReferenceDataSources,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgRefValue } from '../../types/index.ts';
import {
	appendReferenceLocation,
	type ReferenceLocation,
	type ReferenceProvenanceMap,
} from '../schema/dtcg-reference-types.ts';
import type { UnresolvedReference } from './errors.ts';
import {
	isDtcgScalarValue,
	isDtcgValue,
	parseDtcgRef,
} from './reference-utils.ts';
import {
	type NestedValue,
	resolveDtcgRef,
	resolveInternalReference,
} from './reference-value-shared.ts';

export function resolveNestedInternalRefs(
	value: NestedValue,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	resolutionPath: string[],
	unresolvedCollector: UnresolvedReference[],
	currentLocation: ReferenceLocation,
	rootKeys: Set<string>,
	provenance?: ReferenceProvenanceMap,
): NestedValue {
	// 处理 $ref 对象 - 只处理指向文档内部根键的 $ref
	if (isDtcgRefValue(value)) {
		const parsed = parseDtcgRef(value.$ref);
		if (parsed && rootKeys.has(parsed.source)) {
			return (
				resolveDtcgRef(
					value,
					sources,
					themeTree,
					resolutionPath,
					unresolvedCollector,
					currentLocation,
					rootKeys,
					provenance,
				) ?? value
			);
		}
		// 对于非文档内部根键的 $ref，返回原值（已经在 Pass 1 中处理）
		return value;
	}

	// 处理字符串引用
	if (typeof value === 'string') {
		const resolved = resolveInternalReference(
			value,
			themeTree,
			resolutionPath,
			unresolvedCollector,
			currentLocation,
			rootKeys,
			provenance,
		);
		return resolved !== undefined ? resolved : value;
	}

	// 处理数组
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			resolveNestedInternalRefs(
				item,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				appendReferenceLocation(currentLocation, index),
				rootKeys,
				provenance,
			),
		);
	}

	// 处理对象
	if (typeof value === 'object' && value !== null) {
		const resolved: { [key: string]: NestedValue } = {};
		for (const [key, val] of Object.entries(value)) {
			if (val === undefined) {
				continue;
			}
			resolved[key] = resolveNestedInternalRefs(
				val,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				appendReferenceLocation(currentLocation, key),
				rootKeys,
				provenance,
			);
		}
		return resolved;
	}

	// 标量值直接返回
	return value;
}

export function resolveInternalDtcgValue(
	value: DtcgValue,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	resolutionPath: string[],
	unresolvedCollector: UnresolvedReference[],
	currentLocation: ReferenceLocation,
	rootKeys: Set<string>,
	provenance?: ReferenceProvenanceMap,
): DtcgValue {
	// 处理 $ref 对象 - 只处理指向文档内部根键的 $ref
	if (isDtcgRefValue(value)) {
		const parsed = parseDtcgRef(value.$ref);
		if (parsed && rootKeys.has(parsed.source)) {
			return (
				resolveDtcgRef(
					value,
					sources,
					themeTree,
					resolutionPath,
					unresolvedCollector,
					currentLocation,
					rootKeys,
					provenance,
				) ?? value
			);
		}
		// 对于非文档内部根键的 $ref，返回原值（已经在 Pass 1 中处理）
		return value;
	}

	if (typeof value === 'string') {
		const resolved = resolveInternalReference(
			value,
			themeTree,
			resolutionPath,
			unresolvedCollector,
			currentLocation,
			rootKeys,
			provenance,
		);
		return resolved !== undefined ? resolved : value;
	}

	// 处理数组类型的 $value
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			resolveNestedInternalRefs(
				item,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				appendReferenceLocation(currentLocation, index),
				rootKeys,
				provenance,
			),
		) as unknown as DtcgValue;
	}

	if (typeof value === 'object' && value !== null) {
		const resolved: Record<string, NestedValue> = {};

		for (const [key, val] of Object.entries(value)) {
			if (val === undefined) {
				continue;
			}
			if (Array.isArray(val)) {
				// 使用 resolveNestedInternalRefs 处理数组（包括嵌套对象中的 $ref）
				const resolvedArray = val.map((item, index) =>
					resolveNestedInternalRefs(
						item,
						sources,
						themeTree,
						resolutionPath,
						unresolvedCollector,
						appendReferenceLocation(
							appendReferenceLocation(currentLocation, key),
							index,
						),
						rootKeys,
						provenance,
					),
				);
				resolved[key] = resolvedArray;
			} else if (isDtcgRefValue(val)) {
				const parsed = parseDtcgRef(val.$ref);
				if (parsed && rootKeys.has(parsed.source)) {
					const valResolved = resolveDtcgRef(
						val,
						sources,
						themeTree,
						resolutionPath,
						unresolvedCollector,
						appendReferenceLocation(currentLocation, key),
						rootKeys,
						provenance,
					);
					if (valResolved !== undefined) {
						if (isDtcgScalarValue(valResolved)) {
							resolved[key] = valResolved;
						} else if (
							typeof valResolved === 'object' &&
							!Array.isArray(valResolved)
						) {
							resolved[key] = valResolved;
						} else {
							resolved[key] = val;
						}
					} else {
						resolved[key] = val;
					}
				} else {
					resolved[key] = val;
				}
			} else if (typeof val === 'string') {
				const valResolved = resolveInternalReference(
					val,
					themeTree,
					resolutionPath,
					unresolvedCollector,
					appendReferenceLocation(currentLocation, key),
					rootKeys,
					provenance,
				);
				if (valResolved !== undefined) {
					if (isDtcgValue(valResolved)) {
						resolved[key] = valResolved;
					} else {
						resolved[key] = val;
					}
				} else {
					resolved[key] = val;
				}
			} else {
				resolved[key] = val;
			}
		}

		return resolved;
	}

	return value;
}
