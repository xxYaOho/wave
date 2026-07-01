import type {
	DtcgValue,
	ReferenceDataSources,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgRefValue } from '../../types/index.ts';
import type { UnresolvedReference } from './errors.ts';
import {
	isDtcgScalarValue,
	isDtcgValue,
	parseDtcgRef,
} from './reference-utils.ts';
import {
	type NestedValue,
	resolveDtcgRef,
	resolveExternalReference,
} from './reference-value-shared.ts';

export function resolveNestedRefs(
	value: NestedValue,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	resolutionPath: string[],
	unresolvedCollector: UnresolvedReference[],
	currentLocation: string,
	rootKeys: Set<string>,
): NestedValue {
	// 处理 $ref 对象（Pass 1 跳过指向文档内部根键的 $ref，留到 Pass 2 处理）
	if (isDtcgRefValue(value)) {
		const parsed = parseDtcgRef(value.$ref);
		if (parsed && rootKeys.has(parsed.source)) {
			return value;
		}
		const result = resolveDtcgRef(
			value,
			sources,
			themeTree,
			resolutionPath,
			unresolvedCollector,
			currentLocation,
			rootKeys,
		);
		return result ?? value;
	}

	// 处理字符串引用
	if (typeof value === 'string') {
		// CQ-005: Check if this is a reference pattern before attempting resolution
		const refMatch = value.match(
			/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/,
		);
		if (refMatch) {
			const refPath = refMatch[1]!;
			const prefix = refPath.split('.')[0]!;

			// Internal reference (belongs to document) - keep for Pass 2, don't treat as error
			if (rootKeys.has(prefix)) {
				return value;
			}

			// External reference - attempt to resolve
			const resolved = resolveExternalReference(value, sources, rootKeys);
			if (resolved === undefined) {
				// External reference failed to resolve - collect as error (same as $ref behavior)
				unresolvedCollector.push({
					ref: `${refPath} (unresolved: ${value})`,
					location: currentLocation,
				});
				return value as string; // Keep original but mark as unresolved
			}
			return resolved as string;
		}
		// Not a reference pattern, or inline reference - use original behavior
		const resolved = resolveExternalReference(value, sources, rootKeys);
		return resolved !== undefined ? resolved : value;
	}

	// 处理数组
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			resolveNestedRefs(
				item,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				`${currentLocation}[${index}]`,
				rootKeys,
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
			resolved[key] = resolveNestedRefs(
				val,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				`${currentLocation}.${key}`,
				rootKeys,
			);
		}
		return resolved;
	}

	// 标量值直接返回
	return value;
}

// 递归处理嵌套对象/数组中的 $ref（Pass 2：文档内部引用）

export function resolveExternalDtcgValue(
	value: DtcgValue,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	resolutionPath: string[] = [],
	unresolvedCollector: UnresolvedReference[] = [],
	currentLocation: string = '',
	rootKeys: Set<string>,
): DtcgValue {
	// 处理 $ref 对象（Pass 1 跳过指向文档内部根键的 $ref，留到 Pass 2 处理）
	if (isDtcgRefValue(value)) {
		const parsed = parseDtcgRef(value.$ref);
		if (parsed && rootKeys.has(parsed.source)) {
			return value;
		}
		return (
			resolveDtcgRef(
				value,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				currentLocation,
				rootKeys,
			) ?? value
		);
	}

	if (typeof value === 'string') {
		// CQ-005: Check if this is a reference pattern before attempting resolution
		const refMatch = value.match(
			/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/,
		);
		if (refMatch) {
			const refPath = refMatch[1]!;
			const prefix = refPath.split('.')[0]!;

			// Internal reference (belongs to document) - keep for Pass 2, don't treat as error
			if (rootKeys.has(prefix)) {
				return value;
			}

			// External reference - attempt to resolve
			const resolved = resolveExternalReference(value, sources, rootKeys);
			if (resolved === undefined) {
				// External reference failed to resolve - collect as error (same as $ref behavior)
				unresolvedCollector.push({
					ref: `${refPath} (unresolved: ${value})`,
					location: currentLocation,
				});
				return value as string; // Keep original but mark as unresolved
			}
			return resolved;
		}
		// Not a reference pattern, or inline reference - use original behavior
		const resolved = resolveExternalReference(value, sources, rootKeys);
		return resolved !== undefined ? resolved : value;
	}

	// 处理数组类型的 $value
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			resolveNestedRefs(
				item,
				sources,
				themeTree,
				resolutionPath,
				unresolvedCollector,
				`${currentLocation}[${index}]`,
				rootKeys,
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
				// 使用 resolveNestedRefs 处理数组（包括嵌套对象中的 $ref）
				const resolvedArray = val.map((item, index) => {
					return resolveNestedRefs(
						item,
						sources,
						themeTree,
						resolutionPath,
						unresolvedCollector,
						`${currentLocation}.${key}[${index}]`,
						rootKeys,
					);
				});
				resolved[key] = resolvedArray;
			} else if (isDtcgRefValue(val)) {
				const parsed = parseDtcgRef(val.$ref);
				if (parsed && rootKeys.has(parsed.source)) {
					resolved[key] = val;
					continue;
				}
				const valResolved = resolveDtcgRef(
					val,
					sources,
					themeTree,
					resolutionPath,
					unresolvedCollector,
					`${currentLocation}.${key}`,
					rootKeys,
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
			} else if (typeof val === 'string') {
				// CQ-005: Check if this is a reference pattern
				const refMatch = val.match(
					/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/,
				);
				if (refMatch) {
					const refPath = refMatch[1]!;
					const prefix = refPath.split('.')[0]!;

					// Internal reference (belongs to document) - keep for Pass 2, don't treat as error
					if (rootKeys.has(prefix)) {
						resolved[key] = val;
					} else {
						// External reference - attempt to resolve
						const valResolved = resolveExternalReference(
							val,
							sources,
							rootKeys,
						);
						if (valResolved === undefined) {
							unresolvedCollector.push({
								ref: `${refPath} (unresolved: ${val})`,
								location: `${currentLocation}.${key}`,
							});
							resolved[key] = val;
						} else if (isDtcgValue(valResolved)) {
							resolved[key] = valResolved;
						} else {
							resolved[key] = val;
						}
					}
				} else {
					const valResolved = resolveExternalReference(val, sources, rootKeys);
					if (valResolved !== undefined) {
						if (isDtcgValue(valResolved)) {
							resolved[key] = valResolved;
						} else {
							resolved[key] = val;
						}
					} else {
						resolved[key] = val;
					}
				}
			} else {
				resolved[key] = val;
			}
		}

		return resolved;
	}

	return value;
}
