import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/transforms/sketch-format.ts';
import type { TransformedToken, Dictionary } from 'style-dictionary/types';

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

describe('sketch component format', () => {
  test('should map composite component properties to sketch style fields', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-foreground',
        path: ['component', 'button', 'outline', 'md', 'foreground'],
        value: '#62748e',
        $value: '#62748e',
        type: 'color',
        _composite: 'component.button.outline.md',
      },
      {
        name: 'component-button-outline-md-background',
        path: ['component', 'button', 'outline', 'md', 'background'],
        value: '#ffffff',
        $value: '#ffffff',
        type: 'color',
        _composite: 'component.button.outline.md',
      },
      {
        name: 'component-button-outline-md-border',
        path: ['component', 'button', 'outline', 'md', 'border'],
        value: '#ff00ff',
        $value: '#ff00ff',
        type: 'color',
        _composite: 'component.button.outline.md',
      },
      {
        name: 'component-button-outline-md-radius',
        path: ['component', 'button', 'outline', 'md', 'radius'],
        value: '6px',
        $value: '6px',
        type: 'dimension',
        _composite: 'component.button.outline.md',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    expect(parsed.component).toBeDefined();
    expect(parsed.component['button-outline-md']).toBeDefined();

    const comp = parsed.component['button-outline-md'];

    // foreground -> textColor (plain string)
    expect(comp.textColor).toBe('#62748eff');

    // background -> fills[0]
    expect(comp.fills).toHaveLength(1);
    expect(comp.fills[0].fillType).toBe('Color');
    expect(comp.fills[0].color).toBe('#ffffffff');
    expect(comp.fills[0].enabled).toBe(true);
    expect(comp.fills[0].swatch).toBeUndefined();

    // border -> borders[0]
    expect(comp.borders).toHaveLength(1);
    expect(comp.borders[0].fillType).toBe('Color');
    expect(comp.borders[0].color).toBe('#ff00ffff');
    expect(comp.borders[0].position).toBe('Inside');
    expect(comp.borders[0].thickness).toBe(1);
    expect(comp.borders[0].enabled).toBe(true);
    expect(comp.borders[0].hasIndividualSides).toBe(false);
    expect(comp.borders[0].swatch).toBeUndefined();

    // radius -> corners
    expect(comp.corners).toBeDefined();
    expect(comp.corners.style).toBe(0);
    expect(comp.corners.radii).toEqual([6, 6, 6, 6]);
    expect(comp.corners.hasRadii).toBe(true);
  });

  test('should resolve inheritColor with opacity in component border', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-foreground',
        path: ['component', 'button', 'outline', 'md', 'foreground'],
        value: '#62748e',
        $value: '#62748e',
        type: 'color',
        _composite: 'component.button.outline.md',
      },
      {
        name: 'component-button-outline-md-border',
        path: ['component', 'button', 'outline', 'md', 'border'],
        value: { _color: '#ff00ff' },
        $value: { _color: '#ff00ff' },
        type: 'color',
        _composite: 'component.button.outline.md',
        inheritColor: true,
        inheritColorSiblingSlot: 'foreground',
        inheritColorOpacity: 0.36,
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    const comp = parsed.component['button-outline-md'];
    // inheritColor should pick sibling foreground color and merge opacity into hex
    expect(comp.borders[0].color).toBe('#62748e5c');
  });

  test('should fallback to diagnostic pink when inheritColor sibling not found in component', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-border',
        path: ['component', 'button', 'outline', 'md', 'border'],
        value: { _color: '#ff00ff' },
        $value: { _color: '#ff00ff' },
        type: 'color',
        _composite: 'component.button.outline.md',
        inheritColor: true,
        inheritColorSiblingSlot: 'nonexistent',
        inheritColorOpacity: 0.36,
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    const comp = parsed.component['button-outline-md'];
    expect(comp.borders[0].color).toBe('#ff00ff5c');
  });

  test('should keep unknown component properties as-is', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-padding',
        path: ['component', 'button', 'outline', 'md', 'padding'],
        value: '12px',
        $value: '12px',
        type: 'dimension',
        _composite: 'component.button.outline.md',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    expect(parsed.component['button-outline-md'].padding).toBe('12px');
  });

  test('should map background with tokenType gradient to fillType Gradient', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-background',
        path: ['component', 'button', 'outline', 'md', 'background'],
        value: [
          { color: '#000000ff', position: 0 },
          { color: '#ffffffff', position: 1 },
        ],
        $value: [
          { color: '#000000ff', position: 0 },
          { color: '#ffffffff', position: 1 },
        ],
        type: 'gradient',
        _composite: 'component.button.outline.md',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    const comp = parsed.component['button-outline-md'];
    expect(comp.fills).toHaveLength(1);
    expect(comp.fills[0].fillType).toBe('Gradient');
    expect(comp.fills[0].gradient.stops).toHaveLength(2);
    expect(comp.fills[0].gradient.stops[0].color).toBe('#000000ff');
    expect(comp.fills[0].gradient.stops[1].color).toBe('#ffffffff');
  });

  test('should include swatch in fills and borders when token has _swatchName', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-primary-md-background',
        path: ['component', 'button', 'primary', 'md', 'background'],
        value: '#1872f0',
        $value: '#1872f0',
        type: 'color',
        _composite: 'component.button.primary.md',
        _swatchName: 'color/primary-main',
      },
      {
        name: 'component-button-primary-md-border',
        path: ['component', 'button', 'primary', 'md', 'border'],
        value: '#1872f0',
        $value: '#1872f0',
        type: 'color',
        _composite: 'component.button.primary.md',
        _swatchName: 'color/primary-main',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    const comp = parsed.component['button-primary-md'];
    expect(comp.fills[0].color).toBe('#1872f0ff');
    expect(comp.fills[0].swatch).toEqual({ name: 'color/primary-main', type: 'Swatch' });

    expect(comp.borders[0].color).toBe('#1872f0ff');
    expect(comp.borders[0].swatch).toEqual({ name: 'color/primary-main', type: 'Swatch' });
  });

  test('should propagate swatchName via inheritColor sibling', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-foreground',
        path: ['component', 'button', 'outline', 'md', 'foreground'],
        value: '#62748e',
        $value: '#62748e',
        type: 'color',
        _composite: 'component.button.outline.md',
        _swatchName: 'color/text-default',
      },
      {
        name: 'component-button-outline-md-border',
        path: ['component', 'button', 'outline', 'md', 'border'],
        value: { _color: '#ff00ff' },
        $value: { _color: '#ff00ff' },
        type: 'color',
        _composite: 'component.button.outline.md',
        inheritColor: true,
        inheritColorSiblingSlot: 'foreground',
        inheritColorOpacity: 0.36,
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    const comp = parsed.component['button-outline-md'];
    expect(comp.borders[0].color).toBe('#62748e5c');
    expect(comp.borders[0].swatch).toEqual({ name: 'color/text-default', type: 'Swatch' });
  });

  test('should include swatch in component shadows when shadow color object has _swatchName', () => {
    const dictionary = createMockDictionary([
      {
        name: 'component-button-outline-md-shadow',
        path: ['component', 'button', 'outline', 'md', 'shadow'],
        value: [
          { color: { color: '#0f172b', _swatchName: 'color/shadow' }, offsetX: '0px', offsetY: '4px', blur: '12px', spread: '0px' },
        ],
        $value: [
          { color: { color: '#0f172b', _swatchName: 'color/shadow' }, offsetX: '0px', offsetY: '4px', blur: '12px', spread: '0px' },
        ],
        type: 'shadow',
        _composite: 'component.button.outline.md',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    const comp = parsed.component['button-outline-md'];
    expect(comp.shadows).toHaveLength(1);
    expect(comp.shadows[0].color).toBe('#0f172bff');
    expect(comp.shadows[0].swatch).toEqual({ name: 'color/shadow', type: 'Swatch' });
  });

  test('should not include component key when no composite tokens exist', () => {
    const dictionary = createMockDictionary([
      {
        name: 'theme-color-primary',
        path: ['theme', 'color', 'primary'],
        value: '#0066cc',
        $value: '#0066cc',
      },
    ]);

    const result = sketchFormat.format({ dictionary, options: {}, file: {} as any, platform: {} as any });
    const parsed = JSON.parse(result as string);

    expect(parsed.component).toBeUndefined();
    expect(parsed.color['primary']).toBe('#0066ccff');
  });
});
