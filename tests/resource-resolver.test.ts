import { describe, test, expect } from 'bun:test';
import { resolveReferences, UnresolvedReferenceError, expandExtends, ExtendsCycleError } from '../src/core/resolver/theme-reference.ts';
import type { DtcgTokenGroup, ReferenceDataSources } from '../src/types/index.ts';
import { loadResource } from '../src/core/resolver/resource-loader.ts';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const rootDir = path.resolve(__dirname, '..');

describe('generalized resolver', () => {
  test('resolves curly-brace references for arbitrary dependency namespaces', () => {
    const tree: DtcgTokenGroup = {
      color: {
        $type: 'color',
        primary: {
          $value: '{leonardo.global.color.black}',
        },
      },
    };

    const sources: ReferenceDataSources = {
      leonardo: {
        global: {
          color: {
            $type: 'color',
            black: { $value: '#000000' },
          },
        },
      },
    };

    const result = resolveReferences(tree, sources);
    expect((result.color as { primary: { $value: string } }).primary.$value).toBe('#000000');
  });

  test('resolves $ref against arbitrary dependency namespaces', () => {
    const tree = {
      shadow: {
        $value: '#2b3248',
      },
      gradient: {
        $type: 'gradient',
        $value: [
          {
            color: {
              $ref: '#/leonardo/global/color/black/$value',
              alpha: 0.5,
            },
            position: 0,
          },
        ],
      },
    } as unknown as DtcgTokenGroup;

    const sources: ReferenceDataSources = {
      leonardo: {
        global: {
          color: {
            black: { $value: '#000000' },
          },
        },
      },
    };

    const result = resolveReferences(tree as unknown as DtcgTokenGroup, sources);
    const gradient = (result.gradient as unknown) as { $value: { color: { alpha: number; color: string }; position: number }[] };
    expect(gradient.$value[0]!.color.alpha).toBe(0.5);
    expect(gradient.$value[0]!.color.color).toBe('#000000');
  });

  test('resolves theme internal references', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        color: {
          $type: 'color',
          primary: {
            $value: '#ff00ff',
          },
          secondary: {
            $value: '{theme.color.primary}',
          },
        },
      },
    };

    const sources: ReferenceDataSources = {};

    const result = resolveReferences(tree, sources);
    expect(((result.theme as unknown) as { color: { secondary: { $value: string } } }).color.secondary.$value).toBe('#ff00ff');
  });

  test('throws UnresolvedReferenceError for unknown namespaces in curly-brace refs (CQ-005)', () => {
    const tree: DtcgTokenGroup = {
      color: {
        primary: {
          $value: '{unknown.global.color.primary}',
        },
      },
    };

    const sources: ReferenceDataSources = {
      leonardo: {
        global: {
          color: {
            primary: { $value: '#000000' },
          },
        },
      },
    };

    // CQ-005: Curly-brace refs with unknown namespaces should throw like $ref
    // (unified failure strategy)
    expect(() => resolveReferences(tree, sources)).toThrow(UnresolvedReferenceError);
  });

  test('throws UnresolvedReferenceError for unknown $ref namespaces', () => {
    const tree: DtcgTokenGroup = {
      color: {
        primary: {
          $value: {
            $ref: '#/unknown/global/color/black/$value',
          },
        },
      },
    };

    const sources: ReferenceDataSources = {};

    expect(() => resolveReferences(tree, sources)).toThrow('Unresolved');
  });

  test('resolves internal $ref with custom root key', () => {
    const tree: DtcgTokenGroup = {
      'theme-1': {
        color: {
          $type: 'color',
          primary: {
            $value: '#ff00ff',
          },
          secondary: {
            $value: {
              $ref: '#/theme-1/color/primary/$value',
            },
          },
        },
      },
    };

    const sources: ReferenceDataSources = {};

    const result = resolveReferences(tree, sources);
    expect(
      ((result['theme-1'] as unknown) as { color: { secondary: { $value: string } } }).color.secondary.$value
    ).toBe('#ff00ff');
  });

  test('resolves curly-brace internal references with custom root key', () => {
    const tree: DtcgTokenGroup = {
      'theme-1': {
        color: {
          $type: 'color',
          primary: {
            $value: '#00ff00',
          },
          secondary: {
            $value: '{theme-1.color.primary}',
          },
        },
      },
    };

    const sources: ReferenceDataSources = {};

    const result = resolveReferences(tree, sources);
    expect(
      ((result['theme-1'] as unknown) as { color: { secondary: { $value: string } } }).color.secondary.$value
    ).toBe('#00ff00');
  });

  test('resolves references inside $extensions', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        gradient: {
          $type: 'gradient',
          hero: {
            $value: [
              { color: '#ff0000', position: 0 },
              { color: '#0000ff', position: 1 },
            ],
            $extensions: {
              smoothGradient: {
                cubicBezier: '{wave.global.dimension.cubicBezier.easeInCubic}',
                step: 5,
              },
            },
          },
        },
      },
    };

    const sources: ReferenceDataSources = {
      wave: {
        global: {
          dimension: {
            cubicBezier: {
              easeInCubic: { $value: [0.32, 0, 0.67, 1] },
            },
          },
        },
      },
    };

    const result = resolveReferences(tree, sources);
    const token = (result.theme as unknown) as {
      gradient: {
        hero: {
          $extensions: {
            smoothGradient: {
              cubicBezier: unknown;
              step: number;
            };
          };
        };
      };
    };

    expect(token.gradient.hero.$extensions.smoothGradient.cubicBezier).toEqual([0.32, 0, 0.67, 1]);
    expect(token.gradient.hero.$extensions.smoothGradient.step).toBe(5);
  });

  test('resolves $ref to shadow token containing nested {value, unit} objects', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        color: {
          $type: 'color',
          shadow: {
            $value: '#2b3248',
          },
        },
        style: {
          shadowBase: {
            $type: 'shadow',
            $value: {
              color: { $ref: '#/theme/color/shadow/$value', alpha: 0.08 },
              offsetX: { value: 0 },
              offsetY: { value: '4px', unit: 'px' },
              blur: { value: 8 },
              spread: { value: -2 },
            },
          },
          shadowAlias: {
            $type: 'shadow',
            $value: {
              $ref: '#/theme/style/shadowBase/$value',
            },
          },
        },
      },
    };

    const sources: ReferenceDataSources = {};

    const result = resolveReferences(tree, sources);
    const alias = ((result.theme as unknown) as { style: { shadowAlias: { $value: unknown } } }).style
      .shadowAlias.$value as Record<string, unknown>;

    expect(alias.color).toEqual({ color: '#2b3248', alpha: 0.08, _swatchName: 'theme/color/shadow' });
    expect(alias.offsetX).toEqual({ value: 0 });
    expect(alias.offsetY).toEqual({ value: '4px', unit: 'px' });
    expect(alias.blur).toEqual({ value: 8 });
    expect(alias.spread).toEqual({ value: -2 });
  });

  test('resolves curly-brace reference to dimension {value, unit} inside shadow $value', () => {
    const tree: DtcgTokenGroup = {
      theme: {
        style: {
          shadow1: {
            $type: 'shadow',
            $value: {
              color: { value: '#2b3248', alpha: 0.08 },
              offsetX: { value: 0, unit: 'px' },
              offsetY: '{wave.dimension.px.6}',
              blur: { value: 8, unit: 'px' },
              spread: { value: -2, unit: 'px' },
            },
          },
        },
      },
    };

    const sources: ReferenceDataSources = {
      wave: {
        dimension: {
          px: {
            6: {
              $type: 'dimension',
              $value: { value: 12, unit: 'px' },
            },
          },
        },
      },
    };

    const result = resolveReferences(tree, sources);
    const shadow = ((result.theme as unknown) as { style: { shadow1: { $value: Record<string, unknown> } } }).style
      .shadow1.$value;

    expect(shadow.offsetY).toEqual({ value: 12, unit: 'px' });
  });
});

describe('dependency to dependency reference detection', () => {
  test('rejects dependency file containing cross-dependency curly-brace reference', async () => {
    const tempDir = path.join(rootDir, '.temp-test-cross-curly');
    await fs.mkdir(tempDir, { recursive: true });

    const filePath = path.join(tempDir, 'bad.yaml');
    // This resource exposes namespace 'self' but references 'other'
    await fs.writeFile(
      filePath,
      'self:\n  global:\n    color:\n      $type: color\n      bad:\n        $value: "{other.global.color.red}"\n'
    );

    const result = await loadResource('custom', filePath, tempDir);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Cross-dependency reference');
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('rejects dependency file containing cross-dependency $ref', async () => {
    const tempDir = path.join(rootDir, '.temp-test-cross-ref');
    await fs.mkdir(tempDir, { recursive: true });

    const filePath = path.join(tempDir, 'bad.yaml');
    await fs.writeFile(
      filePath,
      'self:\n  global:\n    color:\n      $type: color\n      bad:\n        $value:\n          $ref: "#/other/global/color/red/$value"\n'
    );

    const result = await loadResource('custom', filePath, tempDir);
    expect('line' in result).toBe(true);
    if ('line' in result) {
      expect(result.message).toContain('Cross-dependency reference');
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('allows dependency file with self-references', async () => {
    const tempDir = path.join(rootDir, '.temp-test-self-ref');
    await fs.mkdir(tempDir, { recursive: true });

    const filePath = path.join(tempDir, 'good.yaml');
    await fs.writeFile(
      filePath,
      'self:\n  global:\n    color:\n      $type: color\n      good:\n        $value: "{self.global.color.good}"\n'
    );

    const result = await loadResource('custom', filePath, tempDir);
    expect('namespace' in result).toBe(true);
    if ('namespace' in result) {
      expect(result.namespace).toBe('self');
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
