import { describe, test, expect } from 'bun:test';
import { scanDoctorPairs, extractPairs } from '../src/core/doctor/pair-extractor.ts';
import type { DtcgTokenGroup, ResolvedTokenGroup } from '../src/types/index.ts';

function buildTree(obj: Record<string, unknown>): DtcgTokenGroup {
  return obj as DtcgTokenGroup;
}

function buildResolved(obj: Record<string, unknown>): ResolvedTokenGroup {
  return obj as ResolvedTokenGroup;
}

describe('scanDoctorPairs', () => {
  test('collects doctorPairs from color tokens', () => {
    const tree = buildTree({
      theme: {
        color: {
          surface: {
            $type: 'color',
            $value: '#000000',
            $extensions: {
              doctorPairs: '{theme.color.foreground}',
            },
          },
          foreground: {
            $type: 'color',
            $value: '#ffffff',
          },
        },
      },
    });

    const pairs = scanDoctorPairs(tree);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({
      backgroundPath: 'theme.color.surface',
      foregroundPath: 'theme.color.foreground',
    });
  });

  test('returns empty array when no doctorPairs exist', () => {
    const tree = buildTree({
      theme: {
        color: {
          background: {
            $type: 'color',
            $value: '#000000',
          },
        },
      },
    });

    const pairs = scanDoctorPairs(tree);
    expect(pairs).toHaveLength(0);
  });
});

describe('extractPairs', () => {
  test('deduplicates mirrored pairs with lexicographic ordering', () => {
    const expanded = buildTree({
      theme: {
        color: {
          a: {
            $type: 'color',
            $value: '#000000',
            $extensions: { doctorPairs: '{theme.color.b}' },
          },
          b: {
            $type: 'color',
            $value: '#ffffff',
            $extensions: { doctorPairs: '{theme.color.a}' },
          },
        },
      },
    });

    const resolved = buildResolved({
      theme: {
        color: {
          a: { $type: 'color', $value: '#000000' },
          b: { $type: 'color', $value: '#ffffff' },
        },
      },
    });

    const { pairs, errors } = extractPairs(expanded, resolved);
    expect(pairs).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  test('reports error for self-pair', () => {
    const expanded = buildTree({
      theme: {
        color: {
          a: {
            $type: 'color',
            $value: '#000000',
            $extensions: { doctorPairs: '{theme.color.a}' },
          },
        },
      },
    });

    const resolved = buildResolved({
      theme: {
        color: {
          a: { $type: 'color', $value: '#000000' },
        },
      },
    });

    const { pairs, errors } = extractPairs(expanded, resolved);
    expect(pairs).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('cannot reference itself');
  });

  test('reports error for unresolved target', () => {
    const expanded = buildTree({
      theme: {
        color: {
          a: {
            $type: 'color',
            $value: '#000000',
            $extensions: { doctorPairs: '{theme.color.missing}' },
          },
        },
      },
    });

    const resolved = buildResolved({
      theme: {
        color: {},
      },
    });

    const { pairs, errors } = extractPairs(expanded, resolved);
    expect(pairs).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('unresolved token');
  });

  test('reports error for non-color target', () => {
    const expanded = buildTree({
      theme: {
        color: {
          a: {
            $type: 'color',
            $value: '#000000',
            $extensions: { doctorPairs: '{theme.shadow.raised}' },
          },
        },
      },
    });

    const resolved = buildResolved({
      theme: {
        color: {
          a: { $type: 'color', $value: '#000000' },
        },
        shadow: {
          raised: {
            $type: 'shadow',
            $value: { color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
          },
        },
      },
    });

    const { pairs, errors } = extractPairs(expanded, resolved);
    expect(pairs).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('must be a color token');
  });
});
