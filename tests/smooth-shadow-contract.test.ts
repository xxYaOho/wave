import { describe, test, expect } from 'bun:test';
import { transformToSDFormat } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, SdTokenTree, SdTokenValue } from '../src/types/index.ts';

describe('smoothShadow contract', () => {
  test('derives layers from a single shadow layer with smoothShadow extension', () => {
    const input: ResolvedTokenGroup = {
      shadow: {
        $type: 'shadow',
        raised: {
          $value: { color: '#000000cc', offsetX: 0, offsetY: 8, blur: 16, spread: 0 },
          $extensions: {
            smoothShadow: { cubicBezier: [0, 0, 1, 1], step: 3 },
          },
        },
      },
    };

    const result = transformToSDFormat(input);
    const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue).value as {
      color: string;
      offsetX: number;
      offsetY: number;
      blur: number;
      spread: number;
    }[];

    expect(layers).toHaveLength(3);
    expect(layers[2]!.offsetY).toBe(8);
    expect(layers[2]!.blur).toBe(16);
  });

  test('$extensions is consumed and not present in output tree', () => {
    const input: ResolvedTokenGroup = {
      shadow: {
        $type: 'shadow',
        raised: {
          $value: { color: '#000000', offsetX: 0, offsetY: 2, blur: 4, spread: 0 },
          $extensions: {
            smoothShadow: { cubicBezier: [0, 0, 1, 1], step: 2 },
          },
        },
      },
    };

    const result = transformToSDFormat(input);
    const token = (result.tree.shadow as SdTokenTree).raised as SdTokenValue;
    expect(token.value).toHaveLength(2);
    expect('$extensions' in token).toBe(false);
  });
});
