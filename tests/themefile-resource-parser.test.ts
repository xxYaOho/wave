import { describe, test, expect } from 'bun:test';
import { parseThemefile } from '../src/core/parser/themefile.ts';

describe('parseThemefile RESOURCE syntax', () => {
  test('parses RESOURCE themefile correctly', () => {
    const content = `
THEME orca
RESOURCE palette leonardo
RESOURCE dimension wave
RESOURCE custom ./tokens.json
`;
    const result = parseThemefile(content);
    expect('resources' in result).toBe(true);
    if ('resources' in result) {
      expect(result.THEME).toBe('orca');
      expect(result.resources).toHaveLength(3);
      expect(result.resources![0]).toEqual({ kind: 'palette', ref: 'leonardo' });
      expect(result.resources![1]).toEqual({ kind: 'dimension', ref: 'wave' });
      expect(result.resources![2]).toEqual({ kind: 'custom', ref: './tokens.json' });
      expect(result.PALETTE).toBeUndefined();
      expect(result.DIMENSION).toBeUndefined();
    }
  });

  test('parses legacy PALETTE/DIMENSION themefile correctly', () => {
    const content = `
PALETTE leonardo
DIMENSION wave
THEME legacy-theme
`;
    const result = parseThemefile(content);
    expect('THEME' in result).toBe(true);
    if ('THEME' in result) {
      expect(result.PALETTE).toBe('leonardo');
      expect(result.DIMENSION).toBe('wave');
      expect(result.THEME).toBe('legacy-theme');
      expect(result.resources).toBeUndefined();
    }
  });

  test('returns error when mixing RESOURCE and PALETTE', () => {
    const content = `
RESOURCE palette leonardo
PALETTE leonardo
THEME mixed
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Cannot mix RESOURCE with legacy');
    }
  });

  test('returns error when mixing RESOURCE and DIMENSION', () => {
    const content = `
RESOURCE palette leonardo
DIMENSION wave
THEME mixed
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Cannot mix RESOURCE with legacy');
    }
  });

  test('returns error when THEME is missing in RESOURCE mode', () => {
    const content = `
RESOURCE palette leonardo
RESOURCE dimension wave
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('THEME');
    }
  });

  test('returns error for invalid RESOURCE format', () => {
    const content = `
THEME broken
RESOURCE palette
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Invalid RESOURCE format');
    }
  });
});

describe('validateThemefile RESOURCE mode', () => {
  test('unsupported custom extension returns error', async () => {
    const { validateThemefile } = await import('../src/core/validator/config.ts');
    const result = await validateThemefile({
      themefileContent: 'THEME test\nRESOURCE custom ./tokens.csv',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unsupported custom resource format'))).toBe(true);
  });

  test('valid custom extension passes format check', async () => {
    const { validateThemefile } = await import('../src/core/validator/config.ts');
    const result = await validateThemefile({
      themefileContent: 'THEME test\nRESOURCE custom ./tokens.yaml',
    });
    // It may still fail because the file doesn't exist, but not because of extension
    expect(result.errors.some((e) => e.includes('Unsupported custom resource format'))).toBe(false);
  });
});
