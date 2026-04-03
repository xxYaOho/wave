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
      expect(result.resources[0]).toEqual({ kind: 'palette', ref: 'leonardo' });
      expect(result.resources[1]).toEqual({ kind: 'dimension', ref: 'wave' });
      expect(result.resources[2]).toEqual({ kind: 'custom', ref: './tokens.json' });
    }
  });

  test('returns error when THEME is missing', () => {
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

  test('returns error when RESOURCE is missing', () => {
    const content = `
THEME broken
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('RESOURCE');
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

  test('returns error for unknown directive', () => {
    const content = `
THEME test
PALETTE leonardo
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Unknown directive');
    }
  });

  test('returns error for invalid RESOURCE kind (CQ-004)', () => {
    const content = `
THEME test
RESOURCE unknown-kind some-ref
`;
    const result = parseThemefile(content);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Invalid RESOURCE kind');
      expect(result.message).toContain('unknown-kind');
      expect(result.message).toContain('palette');
      expect(result.message).toContain('dimension');
      expect(result.message).toContain('custom');
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
