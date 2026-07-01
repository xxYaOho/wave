import type {
	DtcgObjectValue,
	DtcgRefValue,
	DtcgValue,
	ReferenceDataSources,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { CircularReferenceError, type UnresolvedReference } from './errors.ts';
import {
	deriveSwatchNameFromDtcgRef,
	extractValue,
	getValueAtPath,
	isDtcgValue,
	parseDtcgRef,
	REFERENCE_PATTERN,
} from './reference-utils.ts';

export function resolveDtcgRef(
	refValue: DtcgRefValue,
	sources: ReferenceDataSources,
	themeTree: ResolvedTokenGroup,
	resolutionPath: string[],
	unresolvedCollector: UnresolvedReference[],
	currentLocation: string,
	rootKeys: Set<string>,
): DtcgValue | undefined {
	const parsed = parseDtcgRef(refValue.$ref);

	if (!parsed) {
		unresolvedCollector.push({ ref: refValue.$ref, location: currentLocation });
		return undefined;
	}

	const { source, path, valuePath } = parsed;

	// 循环引用检测
	if (resolutionPath.includes(refValue.$ref)) {
		const cyclePath = [...resolutionPath, refValue.$ref];
		throw new CircularReferenceError(cyclePath);
	}

	// 根据 source 选择数据源
	let found: unknown;
	if (rootKeys.has(source)) {
		found = getValueAtPath(themeTree, [source, ...path]);
	} else {
		const dataSource = sources[source];
		if (dataSource === undefined) {
			unresolvedCollector.push({
				ref: refValue.$ref,
				location: currentLocation,
			});
			return undefined;
		}
		found = getValueAtPath(dataSource, path);
	}

	if (found === undefined) {
		unresolvedCollector.push({ ref: refValue.$ref, location: currentLocation });
		return undefined;
	}

	// 提取值 - 严格 DTCG 语义
	// #/path/$value -> 提取 $value 字段
	// #/path -> 返回找到的完整对象（可能是 token、group 或任意值）
	let extractedValue: DtcgValue | undefined;
	if (valuePath.includes('$value')) {
		// 用户明确要求 $value，必须提取 $value 字段
		extractedValue = extractValue(found);
	} else {
		// 用户没有要求 $value，返回找到的完整对象
		// 这可以是 token 对象、group 对象或任何有效的 DTCG 值
		if (isDtcgValue(found)) {
			extractedValue = found;
		} else if (typeof found === 'object' && found !== null) {
			// 返回对象本身（如 group 或带属性的 token）
			extractedValue = found as DtcgObjectValue;
		} else {
			extractedValue = undefined;
		}
	}

	if (extractedValue === undefined) {
		unresolvedCollector.push({ ref: refValue.$ref, location: currentLocation });
		return undefined;
	}

	// 属性合并：$ref 解析的值作为基础，其他属性可以覆盖
	const { $ref, ...overrides } = refValue;

	// 解析 overrides 中的外部字符串引用
	let resolvedOverrides: Record<string, unknown> = overrides;
	for (const [key, val] of Object.entries(overrides)) {
		if (typeof val === 'string') {
			const resolved = resolveExternalReference(val, sources, rootKeys);
			if (resolved !== undefined) {
				if (resolvedOverrides === overrides) {
					resolvedOverrides = { ...overrides };
				}
				resolvedOverrides[key] = resolved;
			}
		}
	}

	const swatchName = deriveSwatchNameFromDtcgRef(refValue.$ref);

	if (Object.keys(resolvedOverrides).length === 0) {
		if (
			typeof extractedValue === 'object' &&
			extractedValue !== null &&
			!Array.isArray(extractedValue)
		) {
			return { ...extractedValue, _swatchName: swatchName } as DtcgObjectValue;
		}
		return extractedValue;
	}

	// 合并策略
	if (
		typeof extractedValue === 'object' &&
		extractedValue !== null &&
		!Array.isArray(extractedValue)
	) {
		return {
			...extractedValue,
			...resolvedOverrides,
			_swatchName: swatchName,
		} as DtcgObjectValue;
	}

	// 标量值，根据上下文包装
	if ('color' in resolvedOverrides || 'alpha' in resolvedOverrides) {
		return {
			color: String(extractedValue),
			...resolvedOverrides,
			_swatchName: swatchName,
		} as DtcgObjectValue;
	}

	return {
		value: extractedValue,
		...resolvedOverrides,
		_swatchName: swatchName,
	} as DtcgObjectValue;
}

// 递归处理嵌套对象/数组中的 $ref（Pass 1：外部引用）

export type NestedValue =
	| DtcgValue
	| DtcgRefValue
	| NestedValue[]
	| { [key: string]: NestedValue | undefined };

export function resolveExternalReference(
	ref: string,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
): DtcgValue | undefined {
	const match = ref.match(REFERENCE_PATTERN);

	if (!match) {
		return undefined;
	}

	const pathStr = match[1];

	if (pathStr === undefined) {
		return undefined;
	}

	const path = pathStr.split('.');

	if (path.length < 1) {
		return undefined;
	}

	const prefix = path[0];
	const pathWithoutPrefix = path.slice(1);

	if (!prefix || pathWithoutPrefix.length < 1) {
		logger.warn(`Reference path too short: ${ref}`);
		return undefined;
	}

	if (rootKeys.has(prefix)) {
		return undefined;
	}

	const dataSource = sources[prefix];
	if (dataSource === undefined) {
		return undefined;
	}

	const found = getValueAtPath(dataSource, pathWithoutPrefix);
	const extracted = extractValue(found);
	if (extracted === undefined) {
		logger.warn(`Reference not found: ${ref}`);
	}
	return extracted;
}

export function resolveInternalReference(
	ref: string,
	themeTree: ResolvedTokenGroup,
	resolutionPath: string[],
	unresolvedCollector: UnresolvedReference[],
	currentLocation: string,
	rootKeys: Set<string>,
): DtcgValue | undefined {
	const match = ref.match(REFERENCE_PATTERN);

	if (!match) {
		return undefined;
	}

	const pathStr = match[1];

	if (pathStr === undefined) {
		return undefined;
	}

	// Check if the reference prefix belongs to this document
	const prefix = pathStr.split('.')[0]!;
	if (!rootKeys.has(prefix)) {
		return undefined;
	}

	if (resolutionPath.includes(pathStr)) {
		const cyclePath = [...resolutionPath, pathStr];
		throw new CircularReferenceError(cyclePath);
	}

	const path = pathStr.split('.');
	const found = getValueAtPath(themeTree, path);
	const extracted = extractValue(found);

	if (extracted === undefined) {
		unresolvedCollector.push({ ref, location: currentLocation });
	}

	return extracted;
}
