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
        if (!val.every(isDtcgScalarValue)) {
          return false;
        }
      } else if (!isDtcgScalarValue(val)) {
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

function inferRootKey(tree: DtcgTokenGroup): string {
  const keys = Object.keys(tree).filter((k) => !k.startsWith('$'));
  return keys[0] || 'theme';
}

// 解析 DTCG $ref 引用
function resolveDtcgRef(
  refValue: DtcgRefValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string,
  rootKey: string
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
  if (source === rootKey) {
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

  // 提取值
  let extractedValue: DtcgValue | undefined;
  if (valuePath.includes('$value') && typeof found === 'object' && found !== null && '$value' in found) {
    extractedValue = extractValue(found);
  } else if (isDtcgValue(found)) {
    extractedValue = found;
  } else {
    extractedValue = extractValue(found);
  }

  if (extractedValue === undefined) {
    unresolvedCollector.push({ ref: refValue.$ref, location: currentLocation });
    return undefined;
  }

  // 属性合并：$ref 解析的值作为基础，其他属性可以覆盖
  const { $ref, ...overrides } = refValue;

  if (Object.keys(overrides).length === 0) {
    return extractedValue;
  }

  // 合并策略
  if (typeof extractedValue === 'object' && extractedValue !== null && !Array.isArray(extractedValue)) {
    return { ...extractedValue, ...overrides } as DtcgObjectValue;
  }

  // 标量值，根据上下文包装
  if ('color' in overrides || 'alpha' in overrides) {
    return { color: String(extractedValue), ...overrides } as DtcgObjectValue;
  }

  return { value: extractedValue, ...overrides } as DtcgObjectValue;
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
  rootKey: string
): NestedValue {
  // 处理 $ref 对象（Pass 1 跳过指向文档根键的 $ref，留到 Pass 2 处理）
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed?.source === rootKey) {
      return value;
    }
    const result = resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey);
    return result ?? value;
  }

  // 处理字符串引用
  if (typeof value === 'string') {
    // CQ-005: Check if this is a reference pattern before attempting resolution
    const refMatch = value.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
    if (refMatch) {
      const refPath = refMatch[1]!;
      const prefix = refPath.split('.')[0];

      // Internal reference (same as rootKey) - keep for Pass 2, don't treat as error
      if (prefix === rootKey) {
        return value;
      }

      // External reference - attempt to resolve
      const resolved = resolveExternalReference(value, sources, rootKey);
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
    const resolved = resolveExternalReference(value, sources, rootKey);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKey)
    );
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    const resolved: { [key: string]: NestedValue } = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveNestedRefs(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKey);
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
  rootKey: string
): NestedValue {
  // 处理 $ref 对象 - 只处理指向文档根键的 $ref
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed?.source === rootKey) {
      return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey) ?? value;
    }
    // 对于非根键的 $ref，返回原值（已经在 Pass 1 中处理）
    return value;
  }

  // 处理字符串引用
  if (typeof value === 'string') {
    const resolved = resolveInternalReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedInternalRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKey)
    );
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    const resolved: { [key: string]: NestedValue } = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveNestedInternalRefs(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKey);
    }
    return resolved;
  }

  // 标量值直接返回
  return value;
}

function resolveExternalReference(ref: string, sources: ReferenceDataSources, rootKey: string): DtcgValue | undefined {
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

  if (prefix === rootKey || !prefix) {
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
  rootKey: string
): DtcgValue | undefined {
  const match = ref.match(REFERENCE_PATTERN);

  if (!match) {
    return undefined;
  }

  const pathStr = match[1];

  if (pathStr === undefined) {
    return undefined;
  }

  if (!pathStr.startsWith(`${rootKey}.`)) {
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
  rootKey: string
): DtcgValue {
  // 处理 $ref 对象（Pass 1 跳过指向文档根键的 $ref，留到 Pass 2 处理）
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed?.source === rootKey) {
      return value;
    }
    return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey) ?? value;
  }

  if (typeof value === 'string') {
    // CQ-005: Check if this is a reference pattern before attempting resolution
    const refMatch = value.match(/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/);
    if (refMatch) {
      const refPath = refMatch[1]!;
      const prefix = refPath.split('.')[0];

      // Internal reference (same as rootKey) - keep for Pass 2, don't treat as error
      if (prefix === rootKey) {
        return value;
      }

      // External reference - attempt to resolve
      const resolved = resolveExternalReference(value, sources, rootKey);
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
    const resolved = resolveExternalReference(value, sources, rootKey);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组类型的 $value
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKey)
    ) as unknown as DtcgValue;
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        // 使用 resolveNestedRefs 处理数组（包括嵌套对象中的 $ref）
        const resolvedArray = val.map((item, index) => {
          return resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}[${index}]`, rootKey);
        });
        resolved[key] = resolvedArray as DtcgScalarValue[];
      } else if (isDtcgRefValue(val)) {
        const parsed = parseDtcgRef(val.$ref);
        if (parsed?.source === rootKey) {
          resolved[key] = val as unknown as DtcgScalarValue;
          continue;
        }
        const valResolved = resolveDtcgRef(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKey);
        if (valResolved !== undefined) {
          if (isDtcgScalarValue(valResolved)) {
            resolved[key] = valResolved;
          } else if (typeof valResolved === 'object' && !Array.isArray(valResolved)) {
            // $ref 解析为对象，但我们需要存储为标量或对象
            // 这里保持原值，让后续处理决定
            resolved[key] = valResolved as unknown as DtcgScalarValue;
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

          // Internal reference (same as rootKey) - keep for Pass 2, don't treat as error
          if (prefix === rootKey) {
            resolved[key] = val;
          } else {
            // External reference - attempt to resolve
            const valResolved = resolveExternalReference(val, sources, rootKey);
            if (valResolved === undefined) {
              unresolvedCollector.push({
                ref: `${refPath} (unresolved: ${val})`,
                location: `${currentLocation}.${key}`,
              });
              resolved[key] = val;
            } else if (isDtcgScalarValue(valResolved)) {
              resolved[key] = valResolved;
            } else {
              logger.warn(`Reference resolved to object, expected scalar: ${val}`);
              resolved[key] = val;
            }
          }
        } else {
          const valResolved = resolveExternalReference(val, sources, rootKey);
          if (valResolved !== undefined) {
            if (isDtcgScalarValue(valResolved)) {
              resolved[key] = valResolved;
            } else {
              logger.warn(`Reference resolved to object, expected scalar: ${val}`);
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
  rootKey: string
): DtcgValue {
  // 处理 $ref 对象 - 只处理指向文档根键的 $ref
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed?.source === rootKey) {
      return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey) ?? value;
    }
    // 对于非根键的 $ref，返回原值（已经在 Pass 1 中处理）
    return value;
  }

  if (typeof value === 'string') {
    const resolved = resolveInternalReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组类型的 $value
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedInternalRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`, rootKey)
    ) as unknown as DtcgValue;
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        // 使用 resolveNestedInternalRefs 处理数组（包括嵌套对象中的 $ref）
        const resolvedArray = val.map((item, index) =>
          resolveNestedInternalRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}[${index}]`, rootKey)
        );
        resolved[key] = resolvedArray as DtcgScalarValue[];
      } else if (isDtcgRefValue(val)) {
        const parsed = parseDtcgRef(val.$ref);
        if (parsed?.source === rootKey) {
          const valResolved = resolveDtcgRef(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`, rootKey);
          if (valResolved !== undefined) {
            if (isDtcgScalarValue(valResolved)) {
              resolved[key] = valResolved;
            } else if (typeof valResolved === 'object' && !Array.isArray(valResolved)) {
              resolved[key] = valResolved as unknown as DtcgScalarValue;
            } else {
              resolved[key] = val;
            }
          } else {
            resolved[key] = val;
          }
        } else {
          resolved[key] = val as unknown as DtcgScalarValue;
        }
      } else if (typeof val === 'string') {
        const valResolved = resolveInternalReference(val, themeTree, resolutionPath, unresolvedCollector, currentLocation, rootKey);
        if (valResolved !== undefined) {
          if (isDtcgScalarValue(valResolved)) {
            resolved[key] = valResolved;
          } else {
            logger.warn(`Internal reference resolved to object, expected scalar: ${val}`);
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
  rootKey: string
): ResolvedDtcgToken {
  const resolvedValue = resolveExternalDtcgValue(
    token.$value, sources, themeTree, [], unresolvedCollector, currentPath, rootKey
  );

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
            rootKey
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
  };
}

function processTokenGroupExternal(
  group: DtcgTokenGroup,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  unresolvedCollector: UnresolvedReference[],
  rootKey: string
): ResolvedTokenGroup {
  const result: ResolvedTokenGroup = {};

  if (group.$type !== undefined) {
    result.$type = group.$type;
  }

  if (group.$description !== undefined) {
    result.$description = group.$description;
  }

  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description') {
      continue;
    }

    if (isDtcgToken(value)) {
      result[key] = processTokenExternal(value, sources, themeTree, unresolvedCollector, key, rootKey);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupExternal(value as DtcgTokenGroup, sources, themeTree, unresolvedCollector, rootKey);
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
  rootKey: string
): ResolvedDtcgToken {
  const resolutionPath = currentPath ? [currentPath] : [];
  const resolvedValue = resolveInternalDtcgValue(token.$value, sources, themeTree, resolutionPath, unresolvedCollector, currentPath, rootKey);

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
            rootKey
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
  };
}

function processTokenGroupInternal(
  group: ResolvedTokenGroup,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  parentPath: string,
  unresolvedCollector: UnresolvedReference[],
  rootKey: string
): ResolvedTokenGroup {
  const result: ResolvedTokenGroup = {};

  if (group.$type !== undefined) {
    result.$type = group.$type;
  }

  if (group.$description !== undefined) {
    result.$description = group.$description;
  }

  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description') {
      continue;
    }

    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    if (
      typeof value === 'object' &&
      value !== null &&
      '$value' in value
    ) {
      result[key] = processTokenInternal(value as ResolvedDtcgToken, sources, themeTree, currentPath, unresolvedCollector, rootKey);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupInternal(value as ResolvedTokenGroup, sources, themeTree, currentPath, unresolvedCollector, rootKey);
    } else {
      result[key] = value;
    }
  }

  return result;
}

type NestedDtcgValue = DtcgValue | NestedDtcgValue[] | { [key: string]: NestedDtcgValue };

function hasInternalReferences(value: NestedDtcgValue, rootKey: string): boolean {
  // 检查 $ref 对象
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    return parsed?.source === rootKey;
  }

  if (typeof value === 'string') {
    const match = value.match(REFERENCE_PATTERN);
    if (match && match[1]?.startsWith(`${rootKey}.`)) {
      return true;
    }
    return false;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.some((item) => hasInternalReferences(item, rootKey));
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    for (const [, val] of Object.entries(value)) {
      if (hasInternalReferences(val, rootKey)) {
        return true;
      }
    }
  }

  return false;
}

function tokenHasInternalReferences(token: ResolvedDtcgToken, rootKey: string): boolean {
  return (
    hasInternalReferences(token.$value, rootKey) ||
    (token.$extensions !== undefined && hasInternalReferences(token.$extensions as unknown as NestedDtcgValue, rootKey))
  );
}

function groupHasInternalReferences(group: ResolvedTokenGroup, rootKey: string): boolean {
  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description') {
      continue;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      '$value' in value
    ) {
      if (tokenHasInternalReferences(value as ResolvedDtcgToken, rootKey)) {
        return true;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (groupHasInternalReferences(value as ResolvedTokenGroup, rootKey)) {
        return true;
      }
    }
  }

  return false;
}

// CQ-006: Collect remaining internal references when iteration is exhausted
function collectInternalReferences(group: ResolvedTokenGroup, rootKey: string): string[] {
  const refs: string[] = [];

  function collectFromValue(value: unknown, path: string): void {
    // Check $ref objects
    if (isDtcgRefValue(value)) {
      const parsed = parseDtcgRef(value.$ref);
      if (parsed?.source === rootKey) {
        refs.push(`${path}: ${value.$ref}`);
      }
      return;
    }

    // Check string values with {references}
    if (typeof value === 'string') {
      const matches = value.matchAll(/\{(\w+)\.([^}]+)\}/g);
      for (const match of matches) {
        if (match[1] === rootKey) {
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
      const nested = collectInternalReferences(value as ResolvedTokenGroup, rootKey);
      refs.push(...nested.map((r) => `${key}.${r}`));
    }
  }

  return refs;
}

export function resolveReferences(
  tree: DtcgTokenGroup,
  sources: ReferenceDataSources
): ResolvedTokenGroup {
  const rootKey = inferRootKey(tree);

  // 首先创建一个空的 themeTree 占位符，用于 Pass 1
  // Pass 1 完成后，themeTree 会被更新为解析后的结果
  const emptyThemeTree: ResolvedTokenGroup = {};

  // Pass 1: Resolve external references (leonardo.*, wave.*, 以及所有 #/.../$value 格式的 $ref)
  const pass1Unresolved: UnresolvedReference[] = [];
  let result = processTokenGroupExternal(tree, sources, emptyThemeTree, pass1Unresolved, rootKey);

  if (pass1Unresolved.length > 0) {
    throw new UnresolvedReferenceError(pass1Unresolved);
  }

  // Pass 2: Resolve internal references (rootKey.* 和指向 rootKey 的 $ref)
  const unresolvedCollector: UnresolvedReference[] = [];
  const unresolvedSet = new Set<string>();
  let maxIterations = 10;
  while (groupHasInternalReferences(result, rootKey) && maxIterations > 0) {
    result = processTokenGroupInternal(result, sources, result, '', unresolvedCollector, rootKey);
    maxIterations--;
  }

  // CQ-006: Treat iteration exhaustion as failure (potential multi-node cycle)
  if (maxIterations === 0 && groupHasInternalReferences(result, rootKey)) {
    // Collect remaining unresolved references for error message
    const remainingRefs = collectInternalReferences(result, rootKey);
    throw new UnresolvedReferenceError(
      remainingRefs.map((ref) => ({
        ref,
        location: rootKey,
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
