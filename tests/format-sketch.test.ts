import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import type { WaveToken } from '../src/types/index.ts';

describe('sketchFormat (Wave-native)', () => {
	test('emits root flat-json keys with sketch color conversion', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed).toEqual({ 'primary-main': '#ff0000ff' });
	});

	test('emits dimension tokens with default value key', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-dimension-gap-small',
				path: ['theme', 'dimension', 'gap', 'small'],
				value: 4,
				type: 'dimension',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed['gap-small']).toEqual({ value: 4 });
	});

	test('emits shadow tokens as sketch shadow objects', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-1',
				path: ['theme', 'shadow', '1'],
				value: [
					{
						color: '#00000080',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: 0,
					},
				],
				type: 'shadow',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed['shadow-1'][0]).toMatchObject({
			x: 0,
			y: 4,
			blur: 8,
			spread: 0,
			color: '#00000080',
		});
	});

	test('reverses multi-layer shadow order for sketch without mutating tokens', () => {
		const originalValue = [
			{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
			{ color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
			{ color: '#000000', offsetX: 0, offsetY: 8, blur: 16, spread: 0 },
		];
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-multi',
				path: ['theme', 'shadow', 'multi'],
				value: originalValue,
				type: 'shadow',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		const shadow = parsed['shadow-multi'];

		expect(shadow[0]).toMatchObject({ blur: 16, y: 8 });
		expect(shadow[1]).toMatchObject({ blur: 8, y: 4 });
		expect(shadow[2]).toMatchObject({ blur: 2, y: 1 });
		expect((tokens[0]!.value as unknown[])[0]).toMatchObject({ blur: 2 });
	});
});
