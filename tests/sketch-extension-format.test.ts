import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import type { WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

describe('sketch extension format', () => {
	test('uses sketch.path as color key', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.color.foundation.color['primary-main']).toBe('#1872f0ff');
		expect(parsed.color['primary-main']).toBeUndefined();
	});

	test('uses extracted color from object color values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: { color: '#1872f0' },
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.color.foundation.color['primary-main']).toBe('#1872f0ff');
	});

	test('rejects non-color values in color output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-alpha',
				path: ['theme', 'color', 'alpha'],
				value: 0.16,
				type: 'number',
				_sketch: { path: 'foundation/color/alpha' },
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch color output requires type "color"',
		);
	});

	test('uses sketch.path and sketch.property.opacity for dimension output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				value: 0.16,
				type: 'number',
				_sketch: {
					path: 'foundation/interaction',
					property: { opacity: true },
				},
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(
			parsed.dimension.foundation.interaction['interaction-hover'],
		).toEqual({
			opacity: 0.16,
		});
	});

	test('rejects non-numeric opacity values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				value: '8px',
				type: 'dimension',
				_sketch: {
					property: { opacity: true },
				},
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch property opacity requires a finite number',
		);
	});

	test('uses sketch.property.cornerRadius for dimension output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: '8px',
				type: 'dimension',
				_sketch: { property: { cornerRadius: true } },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.dimension['radius-card']).toEqual({ cornerRadius: 8 });
	});

	test('rejects invalid cornerRadius values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: 'auto',
				type: 'dimension',
				_sketch: { property: { cornerRadius: true } },
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch property cornerRadius requires a finite number or px dimension',
		);
	});

	test('falls back to legacy sketchMap when sketch.property is absent', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				value: 0.16,
				type: 'number',
				_sketchMap: 'opacity',
				_sketch: { path: 'foundation/interaction' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(
			parsed.dimension.foundation.interaction['interaction-hover'],
		).toEqual({
			opacity: 0.16,
		});
	});

	test('uses sketch.path as style shadow group path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-shadow-card',
				path: ['theme', 'style', 'shadow', 'card'],
				value: [
					{
						color: '#00000040',
						offsetX: 0,
						offsetY: 4,
						blur: 12,
						spread: 0,
					},
				],
				type: 'shadow',
				_sketch: { path: 'foundation/elevation/card' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(
			parsed.style.foundation.elevation.card['shadow-card'].shadow[0],
		).toMatchObject({
			color: '#00000040',
			y: 4,
			blur: 12,
		});
		expect(parsed.style['foundation/elevation/card']).toBeUndefined();
		expect(parsed.style['shadow-card']).toBeUndefined();
	});

	test('keeps style shadow token name when sketch.path is a group path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-shadow-1',
				path: ['theme', 'style', 'shadow', '1'],
				value: [
					{
						color: '#0f172b0f',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: -2,
					},
					{
						color: '#0f172b05',
						offsetX: 0,
						offsetY: 0,
						blur: 2,
						spread: 1,
					},
				],
				type: 'shadow',
				_sketch: { path: 'aaa/bbb' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.style.aaa.bbb['shadow-1'].shadow).toHaveLength(2);
		expect(parsed.style['aaa.bbb']).toBeUndefined();
		expect(parsed.style['shadow-1']).toBeUndefined();
	});

	test('keeps dimension shadow token name when sketch.path is a group path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-shadow-1',
				path: ['theme', 'dimension', 'shadow', '1'],
				value: [
					{
						color: '#0f172b0f',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: -2,
					},
				],
				type: 'shadow',
				_sketch: { path: 'aaa/bbb' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.dimension.aaa.bbb['shadow-1'].value).toHaveLength(1);
		expect(parsed.dimension['aaa/bbb']).toBeUndefined();
		expect(parsed.dimension['shadow-1']).toBeUndefined();
	});

	test('rejects invalid style interaction type', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-interaction-hover',
				path: ['theme', 'style', 'interaction', 'hover'],
				value: 0.16,
				type: 'number',
				_sketch: { path: 'foundation/interaction/hover' },
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch interaction output requires type "color"',
		);
	});

	test('rejects invalid style interaction color value', () => {
		const numberValue: WaveToken[] = [
			token({
				name: 'theme-style-interaction-hover',
				path: ['theme', 'style', 'interaction', 'hover'],
				value: 0.16,
				type: 'color',
			}),
		];
		const objectWithoutColor: WaveToken[] = [
			token({
				name: 'theme-style-interaction-hover',
				path: ['theme', 'style', 'interaction', 'hover'],
				value: { opacity: 0.16 },
				type: 'color',
			}),
		];

		expect(() => sketchFormat(numberValue)).toThrow(
			'Sketch color output requires a color value',
		);
		expect(() => sketchFormat(objectWithoutColor)).toThrow(
			'Sketch color output requires a color value',
		);
	});

	test('rejects invalid style shadow type and value shape', () => {
		const wrongType: WaveToken[] = [
			token({
				name: 'theme-style-shadow-card',
				path: ['theme', 'style', 'shadow', 'card'],
				value: '#000000',
				type: 'color',
			}),
		];
		const wrongValue: WaveToken[] = [
			token({
				name: 'theme-style-shadow-card',
				path: ['theme', 'style', 'shadow', 'card'],
				value: '#000000',
				type: 'shadow',
			}),
		];

		expect(() => sketchFormat(wrongType)).toThrow(
			'Sketch shadow output requires type "shadow"',
		);
		expect(() => sketchFormat(wrongValue)).toThrow(
			'Sketch shadow output requires an object or object array',
		);
	});

	test('rejects invalid style gradient type and value shape', () => {
		const wrongType: WaveToken[] = [
			token({
				name: 'theme-style-gradient-brand',
				path: ['theme', 'style', 'gradient', 'brand'],
				value: 1,
				type: 'number',
			}),
		];
		const wrongValue: WaveToken[] = [
			token({
				name: 'theme-style-gradient-brand',
				path: ['theme', 'style', 'gradient', 'brand'],
				value: 1,
				type: 'gradient',
			}),
		];

		expect(() => sketchFormat(wrongType)).toThrow(
			'Sketch gradient output requires type "gradient"',
		);
		expect(() => sketchFormat(wrongValue)).toThrow(
			'Sketch gradient output requires an object or object array',
		);
	});

	test('syncs component fill swatch to referenced token sketch.path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
				_swatchName: 'color/primary-main',
				_sketch: { path: 'foundation/color/primary/main' },
			}),
			token({
				name: 'theme-component-button-background',
				path: ['theme', 'component', 'button', 'background'],
				value: '#1872f0',
				type: 'color',
				_composite: 'theme.component.button',
				_swatchName: 'color/primary-main',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.component.button.fills[0].swatch).toBe(
			'foundation/color/primary/main',
		);
	});

	test('syncs inheritColor component swatch to sibling token sketch.path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-component-button-foreground',
				path: ['theme', 'component', 'button', 'foreground'],
				value: '#0f172b',
				type: 'color',
				_composite: 'theme.component.button',
				_swatchName: 'color/text-default',
				_sketch: { path: 'foundation/color/text/default' },
			}),
			token({
				name: 'theme-component-button-border',
				path: ['theme', 'component', 'button', 'border'],
				value: { _color: '#ff00ff' },
				type: 'color',
				_composite: 'theme.component.button',
				inheritColor: true,
				inheritColorSiblingSlot: 'foreground',
				inheritColorOpacity: 0.36,
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.component.button.borders[0].swatch).toBe(
			'foundation/color/text/default',
		);
	});

	test('syncs nested component shadow swatch to referenced token sketch.path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-shadow-default',
				path: ['theme', 'color', 'shadow', 'default'],
				value: '#0f172b',
				type: 'color',
				_swatchName: 'color/shadow-default',
				_sketch: { path: 'foundation/color/shadow/default' },
			}),
			token({
				name: 'theme-component-button-shadow',
				path: ['theme', 'component', 'button', 'shadow'],
				value: [
					{
						color: {
							color: '#0f172b',
							_swatchName: 'color/shadow-default',
						},
						offsetX: '0px',
						offsetY: '4px',
						blur: '12px',
						spread: '0px',
					},
				],
				type: 'shadow',
				_composite: 'theme.component.button',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));

		expect(parsed.component.button.shadows[0].swatch).toBe(
			'foundation/color/shadow/default',
		);
	});
});
