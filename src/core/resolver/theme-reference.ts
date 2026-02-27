import { logger } from '../../utils/logger.ts';
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

function resolveReference(ref: string, sources: ReferenceDataSources): DtcgValue | undefined {
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

  logger.warn(`Unknown reference prefix: ${prefix}`);
  return undefined;
}

function resolveDtcgValue(value: DtcgValue, sources: ReferenceDataSources): DtcgValue {
  if (typeof value === 'string') {
    const resolved = resolveReference(value, sources);
    return resolved !== undefined ? resolved : value;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const resolved: Record<string, DtcgScalarValue | DtcgScalarValue[]> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val)) {
        const resolvedArray: DtcgScalarValue[] = val.map((item) => {
          if (typeof item === 'string') {
            const itemResolved = resolveReference(item, sources);
            if (itemResolved !== undefined && isDtcgScalarValue(itemResolved)) {
              return itemResolved;
            }
          }
          return item;
        });
        resolved[key] = resolvedArray;
      } else if (typeof val === 'string') {
        const valResolved = resolveReference(val, sources);
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

function processToken(token: DtcgToken, sources: ReferenceDataSources): ResolvedDtcgToken {
  const resolvedValue = resolveDtcgValue(token.$value, sources);

  return {
    $value: resolvedValue,
    ...(token.$type !== undefined && { $type: token.$type }),
    ...(token.$description !== undefined && { $description: token.$description }),
    ...(token.$deprecated !== undefined && { $deprecated: token.$deprecated }),
  };
}

function processTokenGroup(
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
      result[key] = processToken(value, sources);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = processTokenGroup(value as DtcgTokenGroup, sources);
    } else {
      result[key] = value as string | number | boolean | undefined;
    }
  }

  return result;
}

export function resolveReferences(
  tree: DtcgTokenGroup,
  sources: ReferenceDataSources
): ResolvedTokenGroup {
  return processTokenGroup(tree, sources);
}
