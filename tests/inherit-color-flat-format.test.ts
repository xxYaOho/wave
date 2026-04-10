import { describe, expect, test } from 'bun:test';
import { flatJsonFormat, flatJsoncFormat } from '../src/core/generator/transforms/flat.ts';
import type { TransformedToken } from 'style-dictionary/types';
import type { Dictionary } from 'style-dictionary/types';

function createMockDictionary(tokens: Partial<TransformedToken>[]): Dictionary {
  return {
    allTokens: tokens.map((t, i) => ({
      name: t.name || `token-${i}`,
      path: t.path || ['theme', 'color', `token-${i}`],
      value: t.value || '#000000',
      $value: t.$value || '#000000',
      _order: t._order ?? i,
      ...t,
    })) as TransformedToken[],
    tokens: {},
  };
}

describe('inheritColor JSON Format', () => {
  test('should output $COLOR_FOREGROUND for inheritColor: true', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-color-primary',
        path: ['theme', 'color', 'primary'],
        value: '#0066cc',
        $value: '#0066cc',
        type: 'color',
        inheritColor: true,
      },
    ]);

    const result = flatJsonFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain('$COLOR_FOREGROUND');
    expect(result).not.toContain('#0066cc');
  });

  test('should output object with opacity for inheritColor with opacity', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-color-semi',
        path: ['theme', 'color', 'semi'],
        value: '#cc0000',
        $value: '#cc0000',
        type: 'color',
        inheritColor: true,
        inheritColorOpacity: 0.5,
      },
    ]);

    const result = flatJsonFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain('$COLOR_FOREGROUND');
    expect(result).toMatch(/opacity.*0.5/);
  });

  test('should not leak siblingSlot into JSON', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-color-border',
        path: ['theme', 'color', 'border'],
        value: '#cc0000',
        $value: '#cc0000',
        type: 'color',
        inheritColor: true,
        inheritColorSiblingSlot: 'label',
      },
    ]);

    const result = flatJsonFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain('$COLOR_FOREGROUND');
    expect(result).not.toContain('label');
    expect(result).not.toContain('siblingSlot');
  });

  test('should not affect non-inheritColor tokens', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-color-normal',
        path: ['theme', 'color', 'normal'],
        value: '#ff0000',
        $value: '#ff0000',
        type: 'color',
      },
    ]);

    const result = flatJsonFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain('#ff0000');
    expect(result).not.toContain('$COLOR_FOREGROUND');
  });

  test('should work with jsonc format too', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-color-primary',
        path: ['theme', 'color', 'primary'],
        value: '#0066cc',
        $value: '#0066cc',
        type: 'color',
        inheritColor: true,
        inheritColorOpacity: 0.3,
      },
    ]);

    const result = flatJsoncFormat.format({ dictionary, options: {}, file: {} as any });
    expect(result).toContain('$COLOR_FOREGROUND');
    expect(result).toMatch(/opacity.*0.3/);
  });
});
