import type { DtcgTokenGroup } from '../../types/index.ts';

export interface ThemeSchemaIssue {
  path: string;
  level: 'error' | 'warning';
  message: string;
}

export interface ThemeSchemaResult {
  valid: boolean;
  issues: ThemeSchemaIssue[];
}

const KNOWN_TYPES = new Set(['color', 'shadow', 'gradient', 'border', 'opacity']);

const KNOWN_EXTENSIONS = new Set(['smoothShadow', 'smoothGradient', 'currentColor']);

const EXTENSION_TYPE_MAP: Record<string, string> = {
  smoothShadow: 'shadow',
  smoothGradient: 'gradient',
};

function checkDanglingJsonPointer(
  value: unknown,
  path: string,
  issues: ThemeSchemaIssue[]
): void {
  if (typeof value === 'string' && value.startsWith('#/')) {
    issues.push({
      path,
      level: 'error',
      message: `"#/..." string outside $ref object, use $ref: "${value}" instead`,
    });
  }
}

function checkValueDeep(
  value: unknown,
  parentPath: string,
  issues: ThemeSchemaIssue[]
): void {
  if (typeof value === 'string') {
    checkDanglingJsonPointer(value, parentPath, issues);
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      checkValueDeep(value[i], `${parentPath}[${i}]`, issues);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // Skip $ref objects — the $ref value itself is validated separately
    if ('$ref' in obj && typeof obj.$ref === 'string') {
      return;
    }

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      checkValueDeep(val, `${parentPath}.${key}`, issues);
    }
  }
}

function validateToken(
  token: Record<string, unknown>,
  tokenPath: string,
  issues: ThemeSchemaIssue[]
): void {
  const value = token.$value;
  if (value !== undefined) {
    checkValueDeep(value, `${tokenPath}.$value`, issues);
  }

  // Rule 2: $ref format
  if ('$ref' in token && typeof token.$ref === 'string') {
    const ref = token.$ref;
    if (!ref.startsWith('#/')) {
      issues.push({
        path: tokenPath,
        level: 'error',
        message: `$ref must start with "#/", got "${ref}"`,
      });
    }
  }

  const tokenType = typeof token.$type === 'string' ? token.$type : undefined;

  // Rule 3: unknown $type
  if (tokenType !== undefined && !KNOWN_TYPES.has(tokenType)) {
    issues.push({
      path: tokenPath,
      level: 'warning',
      message: `Unknown $type "${tokenType}"`,
    });
  }

  // Rule 4 & 5: $extensions validation
  if (
    token.$extensions !== undefined &&
    typeof token.$extensions === 'object' &&
    token.$extensions !== null
  ) {
    const extensions = token.$extensions as Record<string, unknown>;
    for (const extKey of Object.keys(extensions)) {
      if (!KNOWN_EXTENSIONS.has(extKey)) {
        issues.push({
          path: `${tokenPath}.$extensions`,
          level: 'warning',
          message: `Unknown extension "${extKey}"`,
        });
      }
    }

    // Rule 5: $type / $extensions mismatch
    for (const [extKey, expectedType] of Object.entries(EXTENSION_TYPE_MAP)) {
      if (extKey in extensions && tokenType !== undefined && tokenType !== expectedType) {
        issues.push({
          path: tokenPath,
          level: 'warning',
          message: `${extKey} expects $type "${expectedType}", got "${tokenType}"`,
        });
      }
    }
  }
}

function walkNode(
  node: unknown,
  path: string,
  issues: ThemeSchemaIssue[]
): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;

    if ('$value' in obj) {
      validateToken(obj, path, issues);
      return;
    }

    // Group node — recurse into non-meta children
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      walkNode(child, path ? `${path}.${key}` : key, issues);
    }
  }
}

export function validateThemeSchema(tree: DtcgTokenGroup): ThemeSchemaResult {
  const issues: ThemeSchemaIssue[] = [];

  // Walk from root keys (skip $-prefixed like $schema)
  for (const [key, child] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    walkNode(child, key, issues);
  }

  return {
    valid: !issues.some((i) => i.level === 'error'),
    issues,
  };
}
