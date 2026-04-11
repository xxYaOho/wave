import { describe, test, expect } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

describe('doctor section schema validation', () => {
  test('passes when no doctor key exists', () => {
    const tree = {
      theme: {
        color: {
          primary: {
            $type: 'color',
            $value: '#0066cc',
          },
        },
      },
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(true);
  });

  test('passes for valid doctor.wcagPairs with alias strings', () => {
    const tree = {
      theme: {
        color: {
          primary: { $type: 'color', $value: '#0066cc' },
          onPrimary: { $type: 'color', $value: '#ffffff' },
        },
      },
      doctor: {
        wcagPairs: {
          'primary-on': {
            foreground: '{theme.color.onPrimary}',
            background: '{theme.color.primary}',
          },
        },
      },
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(true);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });

  test('errors when doctor exists but has no wcagPairs', () => {
    const tree = {
      theme: { color: { primary: { $type: 'color', $value: '#000' } } },
      doctor: {},
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('must contain "wcagPairs"');
  });

  test('errors when wcagPairs is not an object', () => {
    const tree = {
      theme: { color: { primary: { $type: 'color', $value: '#000' } } },
      doctor: { wcagPairs: 'invalid' },
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('wcagPairs must be an object');
  });

  test('errors when pair entry is not an object', () => {
    const tree = {
      theme: { color: { primary: { $type: 'color', $value: '#000' } } },
      doctor: {
        wcagPairs: {
          'my-pair': 'not-an-object',
        },
      },
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const error = result.issues.find((i) => i.level === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('must be an object');
  });

  test('errors when foreground is not an alias string', () => {
    const tree = {
      theme: { color: { primary: { $type: 'color', $value: '#000' } } },
      doctor: {
        wcagPairs: {
          'my-pair': {
            foreground: 'not-an-alias',
            background: '{theme.color.primary}',
          },
        },
      },
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors.some((e) => e.message.includes('foreground')));
  });

  test('errors when background is missing', () => {
    const tree = {
      theme: { color: { primary: { $type: 'color', $value: '#000' } } },
      doctor: {
        wcagPairs: {
          'my-pair': {
            foreground: '{theme.color.primary}',
          },
        },
      },
    } as DtcgTokenGroup;

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors.some((e) => e.message.includes('background')));
  });
});
