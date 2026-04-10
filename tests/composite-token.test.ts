import { describe, test, expect } from 'bun:test';
import { transformToSDFormat } from '../src/core/transformer/theme-transformer.ts';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

describe('composite token output', () => {
  test('composite group outputs as nested object', () => {
    const resolved: ResolvedTokenGroup = {
      component: {
        button: {
          outlineMax: {
            $extensions: { composite: true },
            fill: { $value: '#ffffff' },
            border: { $value: '#1d293d3d' },
            radius: { $value: '9999px' },
          },
        },
      },
    };

    const { tree } = transformToSDFormat(resolved, undefined, 'hex', '');

    const button = (tree.component as Record<string, unknown>)?.button as Record<string, unknown>;
    const composite = button?.outlineMax as Record<string, unknown>;
    expect(composite).toBeDefined();
    expect(typeof composite.fill).toBe('object');
    expect((composite.fill as { value: string }).value).toBe('#ffffff');
    expect((composite.border as { value: string }).value).toBe('#1d293d3d');
    expect((composite.radius as { value: string }).value).toBe('9999px');
  });

  test('non-composite group outputs flat as before', () => {
    const group: ResolvedTokenGroup = {
      primary: {
        main: { $value: '#0066cc' },
        onMain: { $value: '#ffffff' },
      },
    };

    const { tree, order } = transformToSDFormat({ theme: group }, undefined, 'hex', 'theme');

    expect(order).toContain('theme.primary.main');
    expect(order).toContain('theme.primary.onMain');
  });

  test('composite and non-composite coexist', () => {
    const resolved: ResolvedTokenGroup = {
      theme: {
        color: {
          primary: { $value: '#0066cc' },
        },
      },
      component: {
        button: {
          outlineMax: {
            $extensions: { composite: true },
            fill: { $value: '#ffffff' },
            radius: { $value: '9999px' },
          },
        },
      },
    };

    const { tree, order } = transformToSDFormat(resolved, undefined, 'hex', '');

    // flat token
    expect(order).toContain('theme.color.primary');

    // composite token
    const button = (tree.component as Record<string, unknown>)?.button as Record<string, unknown>;
    const composite = button?.outlineMax as Record<string, unknown>;
    expect(composite).toBeDefined();
    expect(typeof composite.fill).toBe('object');
  });
});

describe('composite schema validation', () => {
  test('valid composite group passes validation', () => {
    const tree = {
      theme: {
        button: {
          outlineMax: {
            $extensions: { composite: true },
            fill: { $value: '#fff' },
            border: { $value: '#000' },
          },
        },
      },
    };

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(true);
  });

  test('composite group with child group is invalid', () => {
    const tree = {
      theme: {
        button: {
          outlineMax: {
            $extensions: { composite: true },
            fill: { $value: '#fff' },
            interaction: {
              hover: { $value: '#eee' },
            },
          },
        },
      },
    };

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.message.includes('composite group') && i.message.includes('interaction'))).toBe(true);
  });

  test('non-composite group with child groups is valid', () => {
    const tree = {
      theme: {
        button: {
          outline: {
            fill: { $value: '#fff' },
            interaction: {
              hover: { $value: '#eee' },
            },
          },
        },
      },
    };

    const result = validateThemeSchema(tree);
    expect(result.valid).toBe(true);
  });
});
