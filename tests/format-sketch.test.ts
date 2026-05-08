import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import type { WaveToken } from '../src/types/index.ts';

describe('sketchFormat (Wave-native)', () => {
	test('emits color group as flat hex8 keyed by sub-path', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
		];

		const out = sketchFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed.color).toEqual({ 'primary-main': '#ff0000ff' });
	});

	test('emits dimension group with default `value` key, or sketchMap key when provided', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-dimension-gap-small',
				path: ['theme', 'dimension', 'gap', 'small'],
				value: 4,
				type: 'dimension',
				_order: 0,
			},
			{
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: 8,
				type: 'dimension',
				_sketchMap: 'cornerRadius',
				_order: 1,
			},
		];

		const out = sketchFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed.dimension['gap-small']).toEqual({ value: 4 });
		expect(parsed.dimension['radius-card']).toEqual({ cornerRadius: 8 });
	});

	test('emits style.shadow-N as { shadow: [{x,y,blur,spread,color}] }', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-style-shadow-1',
				path: ['theme', 'style', 'shadow-1'],
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

		const out = sketchFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed.style['shadow-1'].shadow).toBeDefined();
		expect(parsed.style['shadow-1'].shadow[0]).toMatchObject({
			x: 0,
			y: 4,
			blur: 8,
			spread: 0,
		});
	});

	test('color value already 6-hex gets ff alpha appended', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-bg',
				path: ['theme', 'color', 'bg'],
				value: '#abcdef',
				type: 'color',
				_order: 0,
			},
		];

		const out = sketchFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed.color.bg).toBe('#abcdefff');
	});

	test('component composite token emits component group with fills/borders/corners', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-component-button-background',
				path: ['theme', 'component', 'button', 'background'],
				value: '#ff0000',
				type: 'color',
				_composite: 'theme.component.button',
				_order: 0,
			},
			{
				name: 'theme-component-button-radius',
				path: ['theme', 'component', 'button', 'radius'],
				value: 8,
				type: 'dimension',
				_composite: 'theme.component.button',
				_order: 1,
			},
		];

		const out = sketchFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed.component.button.fills).toBeDefined();
		expect(parsed.component.button.fills[0].color).toBe('#ff0000ff');
		expect(parsed.component.button.corners).toEqual({
			style: 0,
			radii: [8, 8, 8, 8],
			hasRadii: true,
		});
	});

	test('omits empty groups from output', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
		];

		const out = sketchFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed.color).toBeDefined();
		expect(parsed.style).toBeUndefined();
		expect(parsed.dimension).toBeUndefined();
		expect(parsed.component).toBeUndefined();
	});
});
