import { describe, test, expect } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

function buildThemeWithToken(tokenPath: string, token: Record<string, unknown>): DtcgTokenGroup {
  const parts = tokenPath.split('.');
  const group: Record<string, unknown> = {};
  let current = group;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {};
    current[parts[i]!] = next;
    current = next;
  }
  current[parts[parts.length - 1]!] = token;
  return group as DtcgTokenGroup;
}

describe('doctorPairs schema validation', () => {
  test('passes for valid doctorPairs alias on color token', () => {
    const tree = buildThemeWithToken('theme.color.primary', {
      $type: 'color',
      $value: '#0066cc',
      $extensions: {
        doctorPairs: '{theme.color.primary.on-main}',
      },
    });

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(true);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });

  test('errors when doctorPairs is an array', () => {
    const tree = buildThemeWithToken('theme.color.primary', {
      $type: 'color',
      $value: '#0066cc',
      $extensions: {
        doctorPairs: ['{theme.color.primary.on-main}'],
      },
    });

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('doctorPairs must be a single alias string');
  });

  test('errors when doctorPairs is an object', () => {
    const tree = buildThemeWithToken('theme.color.primary', {
      $type: 'color',
      $value: '#0066cc',
      $extensions: {
        doctorPairs: { target: '{theme.color.primary.on-main}' },
      },
    });

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('doctorPairs must be a single alias string');
  });

  test('errors when doctorPairs is a number', () => {
    const tree = buildThemeWithToken('theme.color.primary', {
      $type: 'color',
      $value: '#0066cc',
      $extensions: {
        doctorPairs: 42,
      },
    });

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('doctorPairs must be a single alias string');
  });

  test('errors when doctorPairs is an invalid string format', () => {
    const tree = buildThemeWithToken('theme.color.primary', {
      $type: 'color',
      $value: '#0066cc',
      $extensions: {
        doctorPairs: 'theme.color.primary.on-main',
      },
    });

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('doctorPairs must be a single alias string');
  });

  test('errors when doctorPairs is used on non-color token', () => {
    const tree = buildThemeWithToken('theme.shadow.raised', {
      $type: 'shadow',
      $value: {
        color: '#000000',
        offsetX: 0,
        offsetY: 4,
        blur: 8,
        spread: 0,
      },
      $extensions: {
        doctorPairs: '{theme.color.background}',
      },
    });

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('doctorPairs can only be used with $type "color"');
  });
});
