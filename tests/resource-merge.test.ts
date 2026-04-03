import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { buildDependencyDictionary } from '../src/core/pipeline/theme-pipeline.ts';
import type { ParsedThemefile } from '../src/types/index.ts';

const rootDir = path.resolve(__dirname, '..');

describe('buildDependencyDictionary', () => {
  test('builds dictionary from RESOURCE declarations', async () => {
    const parsed: ParsedThemefile = {
      THEME: 'test',
      PARAMETER: {},
      resources: [
        { kind: 'palette', ref: 'leonardo' },
        { kind: 'dimension', ref: 'wave' },
      ],
    };

    const result = await buildDependencyDictionary(parsed, rootDir);
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.dict['leonardo']).toBeDefined();
    expect(result.dict['wave']).toBeDefined();
    expect(result.palette.name).toBe('leonardo');
    expect(result.dimension.name).toBe('wave');
  });

  test('rejects duplicate namespace across two resources', async () => {
    // Create two temp resource files that expose the same namespace
    const tempDir = path.join(rootDir, '.temp-test-dup');
    await fs.mkdir(tempDir, { recursive: true });

    const paletteFile = path.join(tempDir, 'palette-a.yaml');
    const dimFile = path.join(tempDir, 'dim-a.yaml');

    // Both files expose the same top-level namespace 'shared'
    await fs.writeFile(paletteFile, 'shared:\n  color:\n    $type: color\n');
    await fs.writeFile(dimFile, 'shared:\n  dimension:\n    a: {}\n');

    const parsed: ParsedThemefile = {
      THEME: 'test',
      PARAMETER: {},
      resources: [
        { kind: 'custom', ref: paletteFile },
        { kind: 'custom', ref: dimFile },
      ],
    };

    const result = await buildDependencyDictionary(parsed, rootDir);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toContain('Duplicate namespace');
      expect(result.error.message).toContain('shared');
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('rejects missing palette or dimension resource', async () => {
    const parsed: ParsedThemefile = {
      THEME: 'test',
      PARAMETER: {},
      resources: [{ kind: 'palette', ref: 'leonardo' }],
    };

    const result = await buildDependencyDictionary(parsed, rootDir);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toContain('Missing required palette or dimension resource');
    }
  });
});
