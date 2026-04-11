import {
  type DoctorFinding,
  type DoctorThemePair,
  type DtcgTokenGroup,
  type ResolvedTokenGroup,
} from '../../types/index.ts';

function isColorToken(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false;
  const obj = node as Record<string, unknown>;
  if (!('$value' in obj)) return false;
  const type = obj.$type;
  if (type === 'color') return true;
  const value = obj.$value;
  if (typeof value === 'string' && value.startsWith('#')) return true;
  if (
    typeof value === 'object' &&
    value !== null &&
    'colorSpace' in value &&
    'components' in value
  ) {
    return true;
  }
  return false;
}

export function scanDoctorPairs(
  tree: DtcgTokenGroup
): { backgroundPath: string; foregroundPath: string }[] {
  const pairs: { backgroundPath: string; foregroundPath: string }[] = [];

  function walk(node: unknown, path: string) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if ('$value' in obj) {
      const extensions = obj.$extensions;
      if (
        typeof extensions === 'object' &&
        extensions !== null &&
        'doctorPairs' in extensions
      ) {
        const dp = extensions.doctorPairs;
        if (typeof dp === 'string' && dp.startsWith('{') && dp.endsWith('}')) {
          const targetPath = dp.slice(1, -1);
          pairs.push({ backgroundPath: path, foregroundPath: targetPath });
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      walk(child, path ? `${path}.${key}` : key);
    }
  }

  for (const [key, child] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    walk(child, key);
  }

  return pairs;
}

function lookupResolved(tree: ResolvedTokenGroup, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = tree;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function extractPairs(
  expandedTree: DtcgTokenGroup,
  resolvedTree: ResolvedTokenGroup
): { pairs: DoctorThemePair[]; errors: DoctorFinding[] } {
  const rawPairs = scanDoctorPairs(expandedTree);
  const errors: DoctorFinding[] = [];
  const seen = new Set<string>();
  const pairs: DoctorThemePair[] = [];

  for (const raw of rawPairs) {
    const { backgroundPath, foregroundPath } = raw;

    if (backgroundPath === foregroundPath) {
      errors.push({
        level: 'error',
        message: `doctorPairs cannot reference itself: ${backgroundPath}`,
        path: `${backgroundPath}.$extensions.doctorPairs`,
      });
      continue;
    }

    const fgResolved = lookupResolved(resolvedTree, foregroundPath);
    if (fgResolved === undefined) {
      errors.push({
        level: 'error',
        message: `doctorPairs references unresolved token: ${foregroundPath}`,
        path: `${backgroundPath}.$extensions.doctorPairs`,
      });
      continue;
    }

    if (!isColorToken(fgResolved)) {
      errors.push({
        level: 'error',
        message: `doctorPairs target must be a color token: ${foregroundPath}`,
        path: `${backgroundPath}.$extensions.doctorPairs`,
      });
      continue;
    }

    const dedupeKey = [backgroundPath, foregroundPath].sort().join('||');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    pairs.push({ backgroundPath, foregroundPath });
  }

  return { pairs, errors };
}
