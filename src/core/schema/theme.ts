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

// $extends 格式验证：必须是 {group.path.to.group} 格式
const EXTENDS_PATTERN = /^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/;

const KNOWN_EXTENSIONS = new Set([
  'smoothShadow',
  'smoothGradient',
  'currentColor', // deprecated: use inheritColor instead
  'inheritColor',
]);

const EXTENSION_TYPE_MAP: Record<string, string> = {
  smoothShadow: 'shadow',
  smoothGradient: 'gradient',
  inheritColor: 'color',
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

function validateInheritColor(
  extensions: Record<string, unknown>,
  tokenType: string | undefined,
  tokenPath: string,
  issues: ThemeSchemaIssue[]
): void {
  if (!('inheritColor' in extensions)) return;

  // Rule: inheritColor only applies to color tokens
  if (tokenType !== undefined && tokenType !== 'color') {
    issues.push({
      path: tokenPath,
      level: 'error',
      message: `inheritColor can only be used with $type "color", got "${tokenType}"`,
    });
    return;
  }

  const inheritColor = extensions.inheritColor;

  // Accept boolean form: inheritColor: true
  if (typeof inheritColor === 'boolean') {
    return;
  }

  // Accept object form: inheritColor: { property?: { opacity?: number | alias | $ref }, siblingSlot?: string }
  if (typeof inheritColor === 'object' && inheritColor !== null) {
    const obj = inheritColor as Record<string, unknown>;

    // Validate property.opacity if present
    const property = obj.property;
    if (property !== undefined && typeof property === 'object' && property !== null) {
      const propObj = property as Record<string, unknown>;
      if ('opacity' in propObj) {
        const opacity = propObj.opacity;
        const isValidOpacity =
          typeof opacity === 'number' ||
          (typeof opacity === 'string' && opacity.startsWith('{') && opacity.endsWith('}')) ||
          (typeof opacity === 'object' && opacity !== null && '$ref' in opacity);

        if (!isValidOpacity) {
          issues.push({
            path: `${tokenPath}.$extensions.inheritColor.property.opacity`,
            level: 'error',
            message: `inheritColor.property.opacity must be a number, alias (string), or $ref object`,
          });
        }
      }
    }

    // siblingSlot is Sketch-specific hint, no validation needed for value type
    return;
  }

  // Invalid form
  issues.push({
    path: `${tokenPath}.$extensions.inheritColor`,
    level: 'error',
    message: `inheritColor must be a boolean (true) or an object with optional opacity and siblingSlot`,
  });
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

  // Rule: $extends is NOT allowed on tokens (group-only)
  if ('$extends' in token) {
    issues.push({
      path: tokenPath,
      level: 'error',
      message: `$extends is only allowed on groups, not on tokens (objects with $value)`,
    });
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

    // Check for deprecated currentColor
    if ('currentColor' in extensions) {
      issues.push({
        path: `${tokenPath}.$extensions`,
        level: 'warning',
        message: `currentColor is deprecated, use inheritColor instead`,
      });
    }

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

    // Validate inheritColor specifics
    validateInheritColor(extensions, tokenType, tokenPath, issues);
  }
}

function validateExtends(
  group: Record<string, unknown>,
  groupPath: string,
  issues: ThemeSchemaIssue[]
): void {
  if (!('$extends' in group)) return;

  const extendsValue = group.$extends;

  // Rule: $extends must be a string
  if (typeof extendsValue !== 'string') {
    issues.push({
      path: groupPath,
      level: 'error',
      message: `$extends must be a string in the form "{path.to.group}", got ${typeof extendsValue}`,
    });
    return;
  }

  // Rule: $extends must match {path.to.group} format
  const match = extendsValue.match(EXTENDS_PATTERN);
  if (!match) {
    issues.push({
      path: groupPath,
      level: 'error',
      message: `$extends must be in the form "{group.path.to.group}", got "${extendsValue}"`,
    });
    return;
  }
}

function validateComposite(obj: Record<string, unknown>, groupPath: string, issues: ThemeSchemaIssue[]): void {
  const extensions = obj.$extensions;
  if (typeof extensions !== 'object' || extensions === null) return;

  const ext = extensions as Record<string, unknown>;
  if (ext.composite !== true) return;

  // composite group 的直接子节点必须都是 token
  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (typeof child !== 'object' || child === null || Array.isArray(child)) {
      issues.push({
        path: groupPath,
        level: 'error',
        message: `composite group "${groupPath}" child "${key}" must be a token ($value required)`,
      });
    } else if (!('$value' in child)) {
      issues.push({
        path: groupPath,
        level: 'error',
        message: `composite group "${groupPath}" child "${key}" must be a token, not a group`,
      });
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

    // Group node — validate $extends and recurse into non-meta children
    validateExtends(obj, path, issues);
    validateComposite(obj, path, issues);

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
