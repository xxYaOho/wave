import { logger } from '../../utils/logger.ts';
import { ExitCode } from '../../types/index.ts';
import type {
  DtcgScalarValue,
  DtcgToken,
  DtcgTokenGroup,
  DtcgValue,
  DtcgObjectValue,
  DtcgRefValue,
  ReferenceDataSources,
  ResolvedDtcgToken,
  ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgToken, isDtcgRefValue } from '../../types/index.ts';

const REFERENCE_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/;

// JSON Pointer 解析（RFC 6901）
function parseJsonPointer(pointer: string): string[] | null {
  if (!pointer.startsWith('#')) {
    return null;
  }
  const path = pointer.slice(1);
  if (path === '') {
    return [];
  }
  if (!path.startsWith('/')) {
    return null;
  }
  return path.slice(1).split('/').map(decodeJsonPointerSegment);
}

// 解码 JSON Pointer 段（~1 -> /, ~0 -> ~）
function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

// 解析后的 $ref 结构
interface ParsedDtcgRef {
  source: string;
  path: string[];
  valuePath: string[];
}

// 解析 DTCG $ref 路径
function parseDtcgRef(ref: string): ParsedDtcgRef | null {
  const segments = parseJsonPointer(ref);
  if (!segments || segments.length < 1) {
    return null;
  }
  const source = segments[0];
  if (!source) {
    return null;
  }
  const path = segments.slice(1);
  const valuePath: string[] = [];
  if (path.length > 0 && path[path.length - 1] === '$value') {
    valuePath.push('$value');
    return { source, path: path.slice(0, -1), valuePath };
  }
  return { source, path, valuePath };
}

export class CircularReferenceError extends Error {
  public readonly exitCode = ExitCode.INVALID_PARAMETER;
  constructor(public readonly path: string[]) {
    super(`Circular reference detected: ${path.join(' -> ')}`);
    this.name = 'CircularReferenceError';
  }
}

export interface UnresolvedReference {
  ref: string;
  location: string;
}

export class UnresolvedReferenceError extends Error {
  public readonly exitCode = ExitCode.INVALID_PARAMETER;
  constructor(public readonly references: UnresolvedReference[]) {
    const details = references.map(r => `  - ${r.ref} at ${r.location}`).join('\n');
    super(`Unresolved theme references found:\n${details}`);
    this.name = 'UnresolvedReferenceError';
  }
}

function getValueAtPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;

  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

function isDtcgScalarValue(value: unknown): value is DtcgScalarValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isDtcgValue(value: unknown): value is DtcgValue {
  if (isDtcgScalarValue(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isDtcgValue);
  }

  if (typeof value === 'object' && value !== null) {
    for (const [, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        if (!val.every(isDtcgValue)) {
          return false;
        }
      } else if (!isDtcgValue(val)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function extractValue(found: unknown): DtcgValue | undefined {
  if (found === null || found === undefined) {
    return undefined;
  }

  if (typeof found === 'object' && found !== null && '$value' in found) {
    const token = found as { $value: unknown };
    if (isDtcgValue(token.$value)) {
      return token.$value;
    }
    return undefined;
  }

  if (isDtcgValue(found)) {
    return found;
  }

  return undefined;
}

function deriveSwatchNameFromDtcgRef(ref: string): string | undefined {
  const parsed = parseDtcgRef(ref);
  if (!parsed) return undefined;
  const { source, path } = parsed;
  if (path.length === 0) return undefined;
  return [source, ...path].join('/').replace(/\./g, '-');
}

function deriveSwatchNameFromStringRef(value: string): string | undefined {
  const match = value.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
  if (!match) return undefined;
  const pathStr = match[1];
  if (!pathStr) return undefined;
  return pathStr.replace(/\./g, '-');
}

function inferRootKeys(tree: DtcgTokenGroup): Set<string> {
  const keys = Object.keys(tree).filter((k) => !k.startsWith('$'));
  return new Set(keys.length > 0 ? keys : ['theme']);
}

// 解析 DTCG $ref 引用
function resolveDtcgRef(
  refValue: DtcgRefValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string,
  rootKeys: Set<string>
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
      unresolvedCollector.push({ ref: refValue.$ref, location: currentLocation });
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
    if (typeof extractedValue === 'object' && extractedValue !== null && !Array.isArray(extractedValue)) {
      return { ...extractedValue, _swatchName: swatchName } as DtcgObjectValue;
    }
    return extractedValue;
  }

  // 合并策略
  if (typeof extractedValue === 'object' && extractedValue !== null && !Array.isArray(extractedValue)) {
    return { ...extractedValue, ...resolvedOverrides, _swatchName: swatchName } as DtcgObjectValue;
  }

  // 标量值，根据上下文包装
  if ('color' in resolvedOverrides || 'alpha' in resolvedOverrides) {
    return { color: String(extractedValue), ...resolvedOverrides, _swatchName: swatchName } as DtcgObjectValue;
  }

  return { value: extractedValue, ...resolvedOverrides, _swatchName: swatchName } as DtcgObjectValue;
}

// 递归处理嵌套对象/数组中的 $ref（Pass 1：外部引用）
type NestedValue = DtcgScalarValue | DtcgRefValue | NestedValue[] | { [key: string]: NestedValue };

function resolveNestedRefs(
  value: NestedValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string,
  rootKeys: Set<string>
): NestedValue {
  // 处理 $ref 对象（Pass 1 跳过指向文档内部根键的 $ref，留到 Pass 2 处理）
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed && rootKeys.has(parsed.source)) {
      return value;
    }
    const result = resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys);
    return result ?? value;
  }

  // 处理字符串引用
  if (typeof value === 'string') {
    // CQ-005: Check if this is a reference pattern before attempting resolution
    const refMatch = value.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
    if (refMatch) {
      const refPath = refMatch[1]!;
      const prefix = refPath.split('.')[0];

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
      resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKeys)
    );
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    const resolved: { [key: string]: NestedValue } = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveNestedRefs(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKeys);
    }
    return resolved;
  }

  // 标量值直接返回
  return value;
}

// 递归处理嵌套对象/数组中的 $ref（Pass 2：文档内部引用）
function resolveNestedInternalRefs(
  value: NestedValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string,
  rootKeys: Set<string>
): NestedValue {
  // 处理 $ref 对象 - 只处理指向文档内部根键的 $ref
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed && rootKeys.has(parsed.source)) {
      return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys) ?? value;
    }
    // 对于非文档内部根键的 $ref，返回原值（已经在 Pass 1 中处理）
    return value;
  }

  // 处理字符串引用
  if (typeof value === 'string') {
    const resolved = resolveInternalReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedInternalRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKeys)
    );
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    const resolved: { [key: string]: NestedValue } = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveNestedInternalRefs(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKeys);
    }
    return resolved;
  }

  // 标量值直接返回
  return value;
}

function resolveExternalReference(ref: string, sources: ReferenceDataSources, rootKeys: Set<string>): DtcgValue | undefined {
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

  if (pathWithoutPrefix.length < 1) {
    logger.warn(`Reference path too short: ${ref}`);
    return undefined;
  }

  if (rootKeys.has(prefix) || !prefix) {
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

function resolveInternalReference(
  ref: string,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string,
  rootKeys: Set<string>
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
  const prefix = pathStr.split('.')[0];
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

function resolveExternalDtcgValue(
  value: DtcgValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[] = [],
  unresolvedCollector: UnresolvedReference[] = [],
  currentLocation: string = '',
  rootKeys: Set<string>
): DtcgValue {
  // 处理 $ref 对象（Pass 1 跳过指向文档内部根键的 $ref，留到 Pass 2 处理）
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed && rootKeys.has(parsed.source)) {
      return value;
    }
    return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys) ?? value;
  }

  if (typeof value === 'string') {
    // CQ-005: Check if this is a reference pattern before attempting resolution
    const refMatch = value.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
    if (refMatch) {
      const refPath = refMatch[1]!;
      const prefix = refPath.split('.')[0];

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
      resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKeys)
    ) as unknown as DtcgValue;
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, NestedValue> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        // 使用 resolveNestedRefs 处理数组（包括嵌套对象中的 $ref）
        const resolvedArray = val.map((item, index) => {
          return resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}[${index}]`, rootKeys);
        });
        resolved[key] = resolvedArray;
      } else if (isDtcgRefValue(val)) {
        const parsed = parseDtcgRef(val.$ref);
        if (parsed && rootKeys.has(parsed.source)) {
          resolved[key] = val;
          continue;
        }
        const valResolved = resolveDtcgRef(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKeys);
        if (valResolved !== undefined) {
          if (isDtcgScalarValue(valResolved)) {
            resolved[key] = valResolved;
          } else if (typeof valResolved === 'object' && !Array.isArray(valResolved)) {
            resolved[key] = valResolved;
          } else {
            resolved[key] = val;
          }
        } else {
          resolved[key] = val;
        }
      } else if (typeof val === 'string') {
        // CQ-005: Check if this is a reference pattern
        const refMatch = val.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
        if (refMatch) {
          const refPath = refMatch[1]!;
          const prefix = refPath.split('.')[0];

          // Internal reference (belongs to document) - keep for Pass 2, don't treat as error
          if (rootKeys.has(prefix)) {
            resolved[key] = val;
          } else {
            // External reference - attempt to resolve
            const valResolved = resolveExternalReference(val, sources, rootKeys);
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

function resolveInternalDtcgValue(
  value: DtcgValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string,
  rootKeys: Set<string>
): DtcgValue {
  // 处理 $ref 对象 - 只处理指向文档内部根键的 $ref
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed && rootKeys.has(parsed.source)) {
      return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys) ?? value;
    }
    // 对于非文档内部根键的 $ref，返回原值（已经在 Pass 1 中处理）
    return value;
  }

  if (typeof value === 'string') {
    const resolved = resolveInternalReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组类型的 $value
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedInternalRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKeys)
    ) as unknown as DtcgValue;
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, NestedValue> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        // 使用 resolveNestedInternalRefs 处理数组（包括嵌套对象中的 $ref）
        const resolvedArray = val.map((item, index) =>
          resolveNestedInternalRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}[${index}]`, rootKeys)
        );
        resolved[key] = resolvedArray;
      } else if (isDtcgRefValue(val)) {
        const parsed = parseDtcgRef(val.$ref);
        if (parsed && rootKeys.has(parsed.source)) {
          const valResolved = resolveDtcgRef(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKeys);
          if (valResolved !== undefined) {
            if (isDtcgScalarValue(valResolved)) {
              resolved[key] = valResolved;
            } else if (typeof valResolved === 'object' && !Array.isArray(valResolved)) {
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
        const valResolved = resolveInternalReference(val, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKeys);
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

function processTokenExternal(
  token: DtcgToken,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  unresolvedCollector: UnresolvedReference[],
  currentPath: string = '',
  rootKeys: Set<string>
): ResolvedDtcgToken {
  const resolvedValue = resolveExternalDtcgValue(
    token.$value, sources, themeTree, [], unresolvedCollector, currentPath, rootKeys
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
            rootKeys
          ),
        ])
      )
    : undefined;

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
    ...(resolvedExtensions !== undefined && { $extensions: resolvedExtensions }),
    ...(swatchName !== undefined && { _swatchName: swatchName }),
  };
}

function processTokenGroupExternal(
  group: DtcgTokenGroup,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  unresolvedCollector: UnresolvedReference[],
  rootKeys: Set<string>
): ResolvedTokenGroup {
  const result: ResolvedTokenGroup = {};

  if (group.$type !== undefined) {
    result.$type = group.$type;
  }

  if (group.$description !== undefined) {
    result.$description = group.$description;
  }

  if (group.$extensions !== undefined) {
    result.$extensions = group.$extensions;
  }

  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description' || key === '$extensions') {
      continue;
    }

    if (isDtcgToken(value)) {
      result[key] = processTokenExternal(value, sources, themeTree, unresolvedCollector, key, rootKeys);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupExternal(value as DtcgTokenGroup, sources, themeTree, unresolvedCollector, rootKeys);
    } else {
      result[key] = value as string | number | boolean | undefined;
    }
  }

  return result;
}

function processTokenInternal(
  token: ResolvedDtcgToken,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  currentPath: string,
  unresolvedCollector: UnresolvedReference[],
  rootKeys: Set<string>
): ResolvedDtcgToken {
  const resolutionPath = currentPath ? [currentPath] : [];
  const resolvedValue = resolveInternalDtcgValue(token.$value, sources, themeTree, resolutionPath, unresolvedCollector, currentPath, rootKeys);

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
            rootKeys
          ),
        ])
      )
    : undefined;

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
    ...(resolvedExtensions !== undefined && { $extensions: resolvedExtensions }),
    ...(swatchName !== undefined && { _swatchName: swatchName }),
  };
}

function processTokenGroupInternal(
  group: ResolvedTokenGroup,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  parentPath: string,
  unresolvedCollector: UnresolvedReference[],
  rootKeys: Set<string>
): ResolvedTokenGroup {
  const result: ResolvedTokenGroup = {};

  if (group.$type !== undefined) {
    result.$type = group.$type;
  }

  if (group.$description !== undefined) {
    result.$description = group.$description;
  }

  if (group.$extensions !== undefined) {
    result.$extensions = group.$extensions;
  }

  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description' || key === '$extensions') {
      continue;
    }

    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    if (
      typeof value === 'object' &&
      value !== null &&
      '$value' in value
    ) {
      result[key] = processTokenInternal(value as ResolvedDtcgToken, sources, themeTree, currentPath, unresolvedCollector, rootKeys);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupInternal(value as ResolvedTokenGroup, sources, themeTree, currentPath, unresolvedCollector, rootKeys);
    } else {
      result[key] = value;
    }
  }

  return result;
}

type NestedDtcgValue = DtcgValue | NestedDtcgValue[] | { [key: string]: NestedDtcgValue };

function hasInternalReferences(value: NestedDtcgValue, rootKeys: Set<string>): boolean {
  // 检查 $ref 对象
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    return parsed !== null && rootKeys.has(parsed.source);
  }

  if (typeof value === 'string') {
    const match = value.match(REFERENCE_PATTERN);
    if (match && match[1]) {
      const prefix = match[1].split('.')[0];
      return rootKeys.has(prefix);
    }
    return false;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.some((item) => hasInternalReferences(item, rootKeys));
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    for (const [, val] of Object.entries(value)) {
      if (hasInternalReferences(val, rootKeys)) {
        return true;
      }
    }
  }

  return false;
}

function tokenHasInternalReferences(token: ResolvedDtcgToken, rootKeys: Set<string>): boolean {
  return (
    hasInternalReferences(token.$value, rootKeys) ||
    (token.$extensions !== undefined && hasInternalReferences(token.$extensions as unknown as NestedDtcgValue, rootKeys))
  );
}

function groupHasInternalReferences(group: ResolvedTokenGroup, rootKeys: Set<string>): boolean {
  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description') {
      continue;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      '$value' in value
    ) {
      if (tokenHasInternalReferences(value as ResolvedDtcgToken, rootKeys)) {
        return true;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (groupHasInternalReferences(value as ResolvedTokenGroup, rootKeys)) {
        return true;
      }
    }
  }

  return false;
}

// CQ-006: Collect remaining internal references when iteration is exhausted
function collectInternalReferences(group: ResolvedTokenGroup, rootKeys: Set<string>): string[] {
  const refs: string[] = [];

  function collectFromValue(value: unknown, path: string): void {
    // Check $ref objects
    if (isDtcgRefValue(value)) {
      const parsed = parseDtcgRef(value.$ref);
      if (parsed && rootKeys.has(parsed.source)) {
        refs.push(`${path}: ${value.$ref}`);
      }
      return;
    }

    // Check string values with {references}
    if (typeof value === 'string') {
      const matches = value.matchAll(/\{(\w+)\.([^}]+)\}/g);
      for (const match of matches) {
        if (match[1] && rootKeys.has(match[1])) {
          refs.push(`${path}: {${match[1]}.${match[2]}}`);
        }
      }
      return;
    }

    // Check arrays
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectFromValue(item, `${path}[${index}]`));
      return;
    }

    // Check objects
    if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        if (key === '$type' || key === '$description') continue;
        collectFromValue(val, path ? `${path}.${key}` : key);
      }
    }
  }

  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description') continue;

    if (
      typeof value === 'object' &&
      value !== null &&
      '$value' in value
    ) {
      const token = value as ResolvedDtcgToken;
      collectFromValue(token.$value, key);
      if (token.$extensions !== undefined) {
        collectFromValue(token.$extensions as unknown as NestedDtcgValue, key);
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = collectInternalReferences(value as ResolvedTokenGroup, rootKeys);
      refs.push(...nested.map((r) => `${key}.${r}`));
    }
  }

  return refs;
}

// $extends 循环继承错误
export class ExtendsCycleError extends Error {
  public readonly exitCode = ExitCode.INVALID_PARAMETER;
  constructor(public readonly path: string[]) {
    super(`Circular $extends detected: ${path.join(' -> ')}`);
    this.name = 'ExtendsCycleError';
  }
}

// 展开 $extends 继承
export function expandExtends(
  tree: DtcgTokenGroup,
  rootKeys: Set<string>
): DtcgTokenGroup {
  const result: DtcgTokenGroup = {};

  // 复制非子节点属性
  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith('$') || typeof value !== 'object' || value === null || Array.isArray(value)) {
      result[key] = value;
    }
  }

  // 处理子节点
  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }

    const child = value as DtcgTokenGroup;

    // 检查是否是 token（有 $value）
    if ('$value' in child) {
      result[key] = child;
    } else {
      // 是 group，需要处理 $extends
      result[key] = expandGroupExtends(child, tree, [key], rootKeys);
    }
  }

  return result;
}

// 递归展开 group 的 $extends
function expandGroupExtends(
  group: DtcgTokenGroup,
  rootTree: DtcgTokenGroup,
  path: string[],
  rootKeys: Set<string>
): DtcgTokenGroup {
  const result: DtcgTokenGroup = {};

  // 先复制当前 group 的所有属性（不包括 $extends）
  for (const [key, value] of Object.entries(group)) {
    if (key === '$extends') continue;
    result[key] = value;
  }

  // 如果有 $extends，先展开父 group
  if (group.$extends) {
    const parentPath = parseExtendsPath(group.$extends, rootKeys);
    if (!parentPath) {
      throw new Error(`Invalid $extends path: ${group.$extends} at ${path.join('.')}`);
    }

    // 循环检测
    if (path.includes(parentPath.join('.'))) {
      throw new ExtendsCycleError([...path, parentPath.join('.')]);
    }

    // 查找父 group
    const parentGroup = findGroupAtPath(rootTree, parentPath);
    if (!parentGroup) {
      throw new Error(`$extends target not found: ${group.$extends} at ${path.join('.')}`);
    }

    // 验证父是 group 不是 token
    if ('$value' in parentGroup) {
      throw new Error(`$extends cannot target a token: ${group.$extends} at ${path.join('.')}`);
    }

    // 递归展开父 group
    const expandedParent = expandGroupExtends(
      parentGroup as DtcgTokenGroup,
      rootTree,
      [...path, parentPath.join('.')],
      rootKeys
    );

    // Deep merge：父在前，子在后（子覆盖父）
    const merged = deepMergeGroups(expandedParent, result);

    // 复制合并结果
    for (const [key, value] of Object.entries(merged)) {
      result[key] = value;
    }
  }

  // 递归处理子节点
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !('$value' in value)) {
      result[key] = expandGroupExtends(
        value as DtcgTokenGroup,
        rootTree,
        [...path, key],
        rootKeys
      );
    }
  }

  return result;
}

// 解析 $extends 路径：{a.b.c} -> ['a', 'b', 'c']，要求首段属于文档内部根 key
function parseExtendsPath(extendsValue: string, rootKeys: Set<string>): string[] | null {
  const match = extendsValue.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
  if (!match) return null;

  const path = match[1]!.split('.');
  if (!rootKeys.has(path[0]!)) return null;

  return path;
}

// 根据路径查找 group
function findGroupAtPath(tree: DtcgTokenGroup, path: string[]): DtcgTokenGroup | undefined {
  let current: unknown = tree;

  for (const segment of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
    return current as DtcgTokenGroup;
  }

  return undefined;
}

// Deep merge 两个 group：parent 被 child 覆盖
function deepMergeGroups(
  parent: DtcgTokenGroup,
  child: DtcgTokenGroup
): DtcgTokenGroup {
  const result: DtcgTokenGroup = {};

  // 先复制父的所有属性
  for (const [key, value] of Object.entries(parent)) {
    if (key.startsWith('$')) {
      result[key] = value;
    } else {
      result[key] = value;
    }
  }

  // 再用子的属性覆盖
  for (const [key, childValue] of Object.entries(child)) {
    if (key.startsWith('$')) {
      if (key === '$extensions') {
        // $extensions 深度合并：父的扩展 + 子的覆盖
        const parentExtensions = result.$extensions;
        if (
          typeof parentExtensions === 'object' && parentExtensions !== null &&
          typeof childValue === 'object' && childValue !== null
        ) {
          result[key] = { ...parentExtensions, ...childValue };
        } else {
          result[key] = childValue;
        }
      } else {
        // $type, $description 等：子直接覆盖父
        result[key] = childValue;
      }
    } else if (
      typeof childValue === 'object' &&
      childValue !== null &&
      !Array.isArray(childValue) &&
      !('$value' in childValue)
    ) {
      // 子属性是嵌套 group
      const parentValue = result[key];
      if (
        typeof parentValue === 'object' &&
        parentValue !== null &&
        !Array.isArray(parentValue) &&
        !('$value' in parentValue)
      ) {
        // 父也是 group，递归 merge
        result[key] = deepMergeGroups(
          parentValue as DtcgTokenGroup,
          childValue as DtcgTokenGroup
        );
      } else {
        // 父不存在或不是 group，直接用子
        result[key] = childValue;
      }
    } else {
      // 子属性是 token 或其他值，直接覆盖
      result[key] = childValue;
    }
  }

  return result;
}


export function resolveReferences(
  tree: DtcgTokenGroup,
  sources: ReferenceDataSources
): ResolvedTokenGroup {
  const rootKeys = inferRootKeys(tree);

  // 首先创建一个空的 themeTree 占位符，用于 Pass 1
  // Pass 1 完成后，themeTree 会被更新为解析后的结果
  const emptyThemeTree: ResolvedTokenGroup = {};

  // Pass 1: Resolve external references (leonardo.*, wave.*, 以及所有 #/.../$value 格式的 $ref)
  const pass1Unresolved: UnresolvedReference[] = [];
  let result = processTokenGroupExternal(tree, sources, emptyThemeTree, pass1Unresolved, rootKeys);

  if (pass1Unresolved.length > 0) {
    throw new UnresolvedReferenceError(pass1Unresolved);
  }

  // Pass 2: Resolve internal references (文档内部根 key 下的引用)
  const unresolvedCollector: UnresolvedReference[] = [];
  const unresolvedSet = new Set<string>();
  let maxIterations = 10;
  while (groupHasInternalReferences(result, rootKeys) && maxIterations > 0) {
    result = processTokenGroupInternal(result, sources, result, '', unresolvedCollector, rootKeys);
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
      }))
    );
  }

  if (unresolvedCollector.length > 0) {
    const uniqueReferences = unresolvedCollector.filter((item, index, self) => {
      const key = `${item.ref}|${item.location}`;
      return unresolvedSet.has(key) ? false : (unresolvedSet.add(key), true);
    });
    throw new UnresolvedReferenceError(uniqueReferences);
  }

  return result;
}
