import { logger } from '../../utils/logger.ts';
import { ExitCode } from '../../types/index.ts';
import type {
  DtcgScalarValue,
  DtcgToken,
  DtcgTokenGroup,
  DtcgValue,
  ReferenceDataSources,
  ResolvedDtcgToken,
  ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgToken } from '../../types/index.ts';

const REFERENCE_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*)\}$/;

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

function resolveExternalDtcgValue(value: DtcgValue, sources: ReferenceDataSources): DtcgValue {
  if (typeof value === 'string') {
    const resolved = resolveExternalReference(value, sources);
    return resolved !== undefined ? resolved : value;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        const resolvedArray: DtcgScalarValue[] = val.map((item) => {
          if (typeof item === 'string') {
            const itemResolved = resolveExternalReference(item, sources);
            if (itemResolved !== undefined && isDtcgScalarValue(itemResolved)) {
              return itemResolved;
            }
          }
          return item;
        });
        resolved[key] = resolvedArray;
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
  themeTree: ResolvedTokenGroup,
  resolutionPath: string[],
  unresolvedCollector: UnresolvedReference[],
  currentLocation: string
): DtcgValue {
  if (typeof value === 'string') {
    const resolved = resolveThemeReference(value, themeTree, resolutionPath, unresolvedCollector, currentLocation);
    return resolved !== undefined ? resolved : value;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        const resolvedArray: DtcgScalarValue[] = val.map((item) => {
          if (typeof item === 'string') {
            const itemResolved = resolveThemeReference(item, themeTree, resolutionPath, unresolvedCollector, currentLocation);
            if (itemResolved !== undefined && isDtcgScalarValue(itemResolved)) {
              return itemResolved;
            }
          }
          return item;
        });
        resolved[key] = resolvedArray;
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

function processTokenExternal(token: DtcgToken, sources: ReferenceDataSources): ResolvedDtcgToken {
  const resolvedValue = resolveExternalDtcgValue(token.$value, sources);

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
  };
}

function processTokenGroupExternal(
  group: DtcgTokenGroup,
  sources: ReferenceDataSources
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
      result[key] = processTokenExternal(value, sources);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupExternal(value as DtcgTokenGroup, sources);
    } else {
      result[key] = value as string | number | boolean | undefined;
    }
  }

  return result;
}

function processTokenTheme(
  token: ResolvedDtcgToken,
  themeTree: ResolvedTokenGroup,
  currentPath: string,
  unresolvedCollector: UnresolvedReference[]
): ResolvedDtcgToken {
  const resolutionPath = currentPath ? [currentPath] : [];
  const resolvedValue = resolveThemeDtcgValue(token.$value, themeTree, resolutionPath, unresolvedCollector, currentPath);

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
  };
}

function processTokenGroupTheme(
  group: ResolvedTokenGroup,
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
      result[key] = processTokenTheme(value as ResolvedDtcgToken, themeTree, currentPath, unresolvedCollector);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroupTheme(value as ResolvedTokenGroup, themeTree, currentPath, unresolvedCollector);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function hasThemeReferences(value: DtcgValue): boolean {
  if (typeof value === 'string') {
    const match = value.match(REFERENCE_PATTERN);
    if (match && match[1]?.startsWith('theme.')) {
      return true;
    }
    return false;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        if (val.some((item) => typeof item === 'string' && hasThemeReferences(item))) {
          return true;
        }
      } else if (typeof val === 'string' && hasThemeReferences(val)) {
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
  // Pass 1: Resolve external references (leonardo.*, wave.*)
  let result = processTokenGroupExternal(tree, sources);

  // Pass 2: Resolve internal theme references (theme.*)
  const unresolvedCollector: UnresolvedReference[] = [];
  const unresolvedSet = new Set<string>();
  let maxIterations = 10;
  while (groupHasThemeReferences(result) && maxIterations > 0) {
    result = processTokenGroupTheme(result, result, '', unresolvedCollector);
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
