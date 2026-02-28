import * as path from 'node:path';
import type { ResourceType, ResolvedResource } from '../../types/index.ts';

export { loadBuiltinPalette, loadBuiltinDimension, getBuiltinPalettePath, getBuiltinDimensionPath } from './builtin.ts';
export { loadUserPalette, loadUserDimension, type UserPalette, type UserDimension } from './user.ts';
export { resolveReferences, CircularReferenceError, UnresolvedReferenceError } from './theme-reference.ts';
export type { UnresolvedReference } from './theme-reference.ts';

const RESOURCES_DIR = path.join(import.meta.dir, '..', '..', 'resources');

export function isBareName(reference: string): boolean {
  return !reference.includes('/') && !reference.startsWith('./');
}

export function resolveResource(
  reference: string,
  type: ResourceType,
  themefileDir: string
): ResolvedResource {
  let resolvedPath: string;
  let isBuiltin: boolean;

  if (isBareName(reference)) {
    const typeDir = type === 'palette' ? 'palettes' : type === 'dimension' ? 'dimensions' : 'brands';
    resolvedPath = path.join(RESOURCES_DIR, typeDir, `${reference}.yaml`);
    isBuiltin = true;
  } else {
    resolvedPath = path.resolve(themefileDir, reference);
    isBuiltin = false;
  }

  return {
    path: resolvedPath,
    isBuiltin,
    exists: checkExists(resolvedPath),
  };
}

function checkExists(filePath: string): boolean {
  try {
    const file = Bun.file(filePath);
    return file.size > 0;
  } catch {
    return false;
  }
}

export function getResourcesDir(): string {
  return RESOURCES_DIR;
}
