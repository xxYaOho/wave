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

const REFERENCE_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*)\}$/;

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
  source: 'theme' | 'leonardo' | 'wave';
  path: string[];
  valuePath: string[];
}

// 解析 DTCG $ref 路径
function parseDtcgRef(ref: string): ParsedDtcgRef | null {
  const segments = parseJsonPointer(ref);
  if (!segments || segments.length < 1) {
    return null;
  }
  const source = segments[0] as 'theme' | 'leonardo' | 'wave';
  if (!['theme', 'leonardo', 'wave'].includes(source)) {
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

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
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

// 解析 DTCG $ref 引用
function resolveDtcgRef(
  refValue: DtcgRefValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string
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
  if (source === 'leonardo') {
    found = getValueAtPath(sources.palette, path);
  } else if (source === 'wave') {
    found = getValueAtPath(sources.dimension, path);
  } else {
    // theme 引用需要包含 'theme' 前缀路径
    found = getValueAtPath(themeTree, [source, ...path]);
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
  currentLocation: string
): NestedValue {
  // 处理 $ref 对象
  if (isDtcgRefValue(value)) {
    const result = resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation);
    return result ?? value;
  }

  // 处理字符串引用
  if (typeof value === 'string') {
    const resolved = resolveExternalReference(value, sources);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`)
    );
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    const resolved: { [key: string]: NestedValue } = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveNestedRefs(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`);
    }
    return resolved;
  }

  // 标量值直接返回
  return value;
}

// 递归处理嵌套对象/数组中的 $ref（Pass 2：theme 引用）
function resolveNestedThemeRefs(
  value: NestedValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string
): NestedValue {
  // 处理 $ref 对象 - 只处理指向 theme 的 $ref
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed?.source === 'theme') {
      return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation) ?? value;
    }
    // 对于非 theme 的 $ref，返回原值（已经在 Pass 1 中处理）
    return value;
  }

  // 处理字符串引用
  if (typeof value === 'string') {
    const resolved = resolveThemeReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedThemeRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`)
    );
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    const resolved: { [key: string]: NestedValue } = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveNestedThemeRefs(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`);
    }
    return resolved;
  }

  // 标量值直接返回
  return value;
}

function resolveExternalReference(ref: string, sources: ReferenceDataSources): DtcgValue | undefined {
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

  if (prefix === 'leonardo') {
    const found = getValueAtPath(sources.palette, pathWithoutPrefix);
    const extracted = extractValue(found);
    if (extracted === undefined) {
      logger.warn(`Reference not found: ${ref}`);
    }
    return extracted;
  }

  if (prefix === 'wave') {
    const found = getValueAtPath(sources.dimension, pathWithoutPrefix);
    const extracted = extractValue(found);
    if (extracted === undefined) {
      logger.warn(`Reference not found: ${ref}`);
    }
    return extracted;
  }

  return undefined;
}

function resolveThemeReference(
  ref: string,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string
): DtcgValue | undefined {
  const match = ref.match(REFERENCE_PATTERN);

  if (!match) {
    return undefined;
  }

  const pathStr = match[1];

  if (pathStr === undefined) {
    return undefined;
  }

  if (!pathStr.startsWith('theme.')) {
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
  currentLocation: string = ''
): DtcgValue {
  // 处理 $ref 对象
  if (isDtcgRefValue(value)) {
    return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation) ?? value;
  }

  if (typeof value === 'string') {
    const resolved = resolveExternalReference(value, sources);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组类型的 $value
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`)
    ) as unknown as DtcgValue;
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        // 使用 resolveNestedRefs 处理数组（包括嵌套对象中的 $ref）
        const resolvedArray = val.map((item, index) => {
          return resolveNestedRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}[${index}]`);
        });
        resolved[key] = resolvedArray as DtcgScalarValue[];
      } else if (isDtcgRefValue(val)) {
        const valResolved = resolveDtcgRef(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`);
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
        const valResolved = resolveExternalReference(val, sources);
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
      } else {
        resolved[key] = val;
      }
    }

    return resolved;
  }

  return value;
}

function resolveThemeDtcgValue(
  value: DtcgValue,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string
): DtcgValue {
  // 处理 $ref 对象 - 只处理指向 theme 的 $ref
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    if (parsed?.source === 'theme') {
      return resolveDtcgRef(value, sources, themeTree, resolutionPath, unresolvedCollector, currentLocation) ?? value;
    }
    // 对于非 theme 的 $ref，返回原值（已经在 Pass 1 中处理）
    return value;
  }

  if (typeof value === 'string') {
    const resolved = resolveThemeReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation);
    return resolved !== undefined ? resolved : value;
  }

  // 处理数组类型的 $value
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveNestedThemeRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}[${index}]`)
    ) as unknown as DtcgValue;
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        // 使用 resolveNestedThemeRefs 处理数组（包括嵌套对象中的 $ref）
        const resolvedArray = val.map((item, index) =>
          resolveNestedThemeRefs(item, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}[${index}]`)
        );
        resolved[key] = resolvedArray as DtcgScalarValue[];
      } else if (isDtcgRefValue(val)) {
        const parsed = parseDtcgRef(val.$ref);
        if (parsed?.source === 'theme') {
          const valResolved = resolveDtcgRef(val, sources, themeTree, resolutionPath, unresolvedCollector, `${currentLocation}.${key}`);
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
        const valResolved = resolveThemeReference(val, themeTree, resolutionPath, unresolvedCollector, currentLocation);
        if (valResolved !== undefined) {
          if (isDtcgScalarValue(valResolved)) {
            resolved[key] = valResolved;
          } else {
            logger.warn(`Theme reference resolved to object, expected scalar: ${val}`);
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
  currentPath: string = ''
): ResolvedDtcgToken {
  const resolvedValue = resolveExternalDtcgValue(
    token.$value, sources, themeTree, [], [], currentPath
  );

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
  };
}

function processTokenGroupExternal(
  group: DtcgTokenGroup,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup
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
      result[key] = processTokenExternal(value, sources, themeTree, key);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupExternal(value as DtcgTokenGroup, sources, themeTree);
    } else {
      result[key] = value as string | number | boolean | undefined;
    }
  }

  return result;
}

function processTokenTheme(
  token: ResolvedDtcgToken,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  currentPath: string,
  unresolvedCollector: UnresolvedReference[]
): ResolvedDtcgToken {
  const resolutionPath = currentPath ? [currentPath] : [];
  const resolvedValue = resolveThemeDtcgValue(token.$value, sources, themeTree, resolutionPath, unresolvedCollector, currentPath);

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
  };
}

function processTokenGroupTheme(
  group: ResolvedTokenGroup,
  sources: ReferenceDataSources,
  themeTree: ResolvedTokenGroup,
  parentPath: string,
  unresolvedCollector: UnresolvedReference[]
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
      result[key] = processTokenTheme(value as ResolvedDtcgToken, sources, themeTree, currentPath, unresolvedCollector);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupTheme(value as ResolvedTokenGroup, sources, themeTree, currentPath, unresolvedCollector);
    } else {
      result[key] = value;
    }
  }

  return result;
}

type NestedDtcgValue = DtcgValue | NestedDtcgValue[] | { [key: string]: NestedDtcgValue };

function hasThemeReferences(value: NestedDtcgValue): boolean {
  // 检查 $ref 对象
  if (isDtcgRefValue(value)) {
    const parsed = parseDtcgRef(value.$ref);
    return parsed?.source === 'theme';
  }

  if (typeof value === 'string') {
    const match = value.match(REFERENCE_PATTERN);
    if (match && match[1]?.startsWith('theme.')) {
      return true;
    }
    return false;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return value.some((item) => hasThemeReferences(item));
  }

  // 处理对象
  if (typeof value === 'object' && value !== null) {
    for (const [, val] of Object.entries(value)) {
      if (hasThemeReferences(val)) {
        return true;
      }
    }
  }

  return false;
}

function tokenHasThemeReferences(token: ResolvedDtcgToken): boolean {
  return hasThemeReferences(token.$value);
}

function groupHasThemeReferences(group: ResolvedTokenGroup): boolean {
  for (const [key, value] of Object.entries(group)) {
    if (key === '$type' || key === '$description') {
      continue;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      '$value' in value
    ) {
      if (tokenHasThemeReferences(value as ResolvedDtcgToken)) {
        return true;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (groupHasThemeReferences(value as ResolvedTokenGroup)) {
        return true;
      }
    }
  }

  return false;
}

export function resolveReferences(
  tree: DtcgTokenGroup,
  sources: ReferenceDataSources
): ResolvedTokenGroup {
  // 首先创建一个空的 themeTree 占位符，用于 Pass 1
  // Pass 1 完成后，themeTree 会被更新为解析后的结果
  const emptyThemeTree: ResolvedTokenGroup = {};

  // Pass 1: Resolve external references (leonardo.*, wave.*, 以及所有 #/.../$value 格式的 $ref)
  let result = processTokenGroupExternal(tree, sources, emptyThemeTree);

  // Pass 2: Resolve internal theme references (theme.* 和指向 theme 的 $ref)
  const unresolvedCollector: UnresolvedReference[] = [];
  const unresolvedSet = new Set<string>();
  let maxIterations = 10;
  while (groupHasThemeReferences(result) && maxIterations > 0) {
    result = processTokenGroupTheme(result, sources, result, '', unresolvedCollector);
    maxIterations--;
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
