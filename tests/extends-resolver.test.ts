import { describe, test, expect } from 'bun:test';
import { expandExtends, ExtendsCycleError } from '../src/core/resolver/theme-reference.ts';
import type { DtcgTokenGroup } from '../src/types/index.ts';

describe('group $extends inheritance', () => {
  test('basic group inheritance with $extends', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        button: {
          base: {
            $type: 'color',
            background: { $value: '#cccccc' },
            text: { $value: '#333333' },
          },
          primary: {
            $extends: '{theme.button.base}',
            background: { $value: '#0066cc' },
          },
        },
      },
    };

    const result = expandExtends(tree, 'theme');
    const primary = (result.theme as { button: { primary: { background: { $value: string }; text: { $value: string } } } }).button.primary;

    // Should inherit text from base
    expect(primary.text.$value).toBe('#333333');
    // Should override background
    expect(primary.background.$value).toBe('#0066cc');
  });

  test('$extends is removed after expansion', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        base: {
          $type: 'color',
          value: { $value: '#cccccc' },
        },
        derived: {
          $extends: '{theme.base}',
          value: { $value: '#ff0000' },
        },
      },
    };

    const result = expandExtends(tree, 'theme');
    const derived = result.theme?.derived as Record<string, unknown>;

    expect('$extends' in derived).toBe(false);
    expect(derived.value).toBeDefined();
  });

  test('circular $extends throws ExtendsCycleError', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        a: {
          $extends: '{theme.b}',
          value: { $value: '#ff0000' },
        },
        b: {
          $extends: '{theme.a}',
          value: { $value: '#00ff00' },
        },
      },
    };

    expect(() => expandExtends(tree, 'theme')).toThrow(ExtendsCycleError);
  });
});
