import {
  type DoctorFinding,
  type DoctorNamedPair,
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

function lookupResolved(tree: ResolvedTokenGroup, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = tree;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function extractDoctorPairs(
  wcagPairs: Record<string, unknown>,
  resolvedTree: ResolvedTokenGroup
): { pairs: DoctorNamedPair[]; errors: DoctorFinding[] } {
  const pairs: DoctorNamedPair[] = [];
  const errors: DoctorFinding[] = [];

  for (const [pairName, pairValue] of Object.entries(wcagPairs)) {
    if (typeof pairValue !== 'object' || pairValue === null || Array.isArray(pairValue)) {
      errors.push({
        level: 'error',
        message: `wcagPairs entry "${pairName}" must be an object`,
        path: `doctor.wcagPairs.${pairName}`,
      });
      continue;
    }

    const pair = pairValue as Record<string, unknown>;
    const fg = typeof pair.foreground === 'string' ? pair.foreground.slice(1, -1) : undefined;
    const bg = typeof pair.background === 'string' ? pair.background.slice(1, -1) : undefined;

    if (!fg) {
      errors.push({
        level: 'error',
        message: `wcagPairs "${pairName}" has invalid foreground`,
        path: `doctor.wcagPairs.${pairName}.foreground`,
      });
      continue;
    }

    if (!bg) {
      errors.push({
        level: 'error',
        message: `wcagPairs "${pairName}" has invalid background`,
        path: `doctor.wcagPairs.${pairName}.background`,
      });
      continue;
    }

    const fgResolved = lookupResolved(resolvedTree, fg);
    if (fgResolved === undefined) {
      errors.push({
        level: 'error',
        message: `foreground references unresolved token: ${fg}`,
        path: `doctor.wcagPairs.${pairName}.foreground`,
      });
      continue;
    }

    if (!isColorToken(fgResolved)) {
      errors.push({
        level: 'error',
        message: `foreground must be a color token: ${fg}`,
        path: `doctor.wcagPairs.${pairName}.foreground`,
      });
      continue;
    }

    const bgResolved = lookupResolved(resolvedTree, bg);
    if (bgResolved === undefined) {
      errors.push({
        level: 'error',
        message: `background references unresolved token: ${bg}`,
        path: `doctor.wcagPairs.${pairName}.background`,
      });
      continue;
    }

    if (!isColorToken(bgResolved)) {
      errors.push({
        level: 'error',
        message: `background must be a color token: ${bg}`,
        path: `doctor.wcagPairs.${pairName}.background`,
      });
      continue;
    }

    pairs.push({ name: pairName, foregroundPath: fg, backgroundPath: bg });
  }

  return { pairs, errors };
}
