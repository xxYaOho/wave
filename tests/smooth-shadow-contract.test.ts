import { describe, test, expect } from 'bun:test';
import { transformToSDFormat } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

describe('smoothShadow contract', () => {
  test('throws not implemented for smoothShadow extension', () => {
    const input: ResolvedTokenGroup = {
      shadow: {
        $type: 'shadow',
        raised: {
          $value: [{ color: '#000000', offsetX: 0, offsetY: 2, blur: 4, spread: 0 }],
          $extensions: {
            smoothShadow: { cubicBezier: [0.4, 0, 0.2, 1], step: 5 },
          },
        },
      },
    };

    expect(() => transformToSDFormat(input)).toThrow('smoothShadow is not implemented');
  });
});
