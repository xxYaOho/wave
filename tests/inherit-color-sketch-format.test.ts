import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/transforms/sketch-format.ts';
import type { TransformedToken } from 'style-dictionary/types';
import type { Dictionary } from 'style-dictionary/types';

function createMockDictionary(tokens: Partial<TransformedToken>[]): Dictionary {
  return {
    allTokens: tokens.map((t, i) => ({
      name: t.name || `token-${i}`,
      path: t.path || ['theme', 'style', 'interaction', `token-${i}`],
      value: t.value || '#000000',
      $value: t.$value || '#000000',
      _order: t._order ?? i,
      ...t,
    })) as TransformedToken[],
    tokens: {},
    tokenMap: new Map(),
  };
}

describe('inheritColor Sketch Format', () => {
  test('should use siblingSlot color when found', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-style-interaction-interaction-danger-label',
        path: ['theme', 'style', 'interaction', 'danger', 'label'],
        value: '#cc0000',
        $value: '#cc0000',
        type: 'color',
      },
      {
        name: 'theme-style-interaction-interaction-danger-border',
        path: ['theme', 'style', 'interaction', 'danger', 'border'],
        value: { _color: '#ff0000' },
        $value: { _color: '#ff0000' },
        type: 'color',
        inheritColor: true,
        inheritColorSiblingSlot: 'label',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    // Should use sibling label color
    expect(parsed.style['interaction-danger-border'].color).toBe('#cc0000ff');
  });

  test('should fallback to diagnostic pink when sibling not found', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-style-interaction-interaction-danger-border',
        path: ['theme', 'style', 'interaction', 'danger', 'border'],
        value: { _color: '#ff0000' },
        $value: { _color: '#ff0000' },
        type: 'color',
        inheritColor: true,
        inheritColorSiblingSlot: 'nonexistent',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    // Should fallback to #ff00ff
    expect(parsed.style['interaction-danger-border'].color).toBe('#ff00ffff');
  });

  test('should include opacity when inheritColor has opacity', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-style-interaction-interaction-danger-label',
        path: ['theme', 'style', 'interaction', 'danger', 'label'],
        value: '#cc0000',
        $value: '#cc0000',
        type: 'color',
      },
      {
        name: 'theme-style-interaction-interaction-danger-border',
        path: ['theme', 'style', 'interaction', 'danger', 'border'],
        value: { _color: '#ff0000', opacity: 0.3 },
        $value: { _color: '#ff0000', opacity: 0.3 },
        type: 'color',
        inheritColor: true,
        inheritColorSiblingSlot: 'label',
        inheritColorOpacity: 0.3,
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    expect(parsed.style['interaction-danger-border'].color).toBe('#cc0000ff');
    expect(parsed.style['interaction-danger-border'].opacity).toBe(0.3);
  });

  test('should not leak inheritColor metadata into output', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-style-interaction-interaction-danger-border',
        path: ['theme', 'style', 'interaction', 'danger', 'border'],
        value: { _color: '#ff0000' },
        $value: { _color: '#ff0000' },
        type: 'color',
        inheritColor: true,
        inheritColorSiblingSlot: 'label',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    
    expect(result).not.toContain('inheritColor');
    expect(result).not.toContain('siblingSlot');
  });
});
