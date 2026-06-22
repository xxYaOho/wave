import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

describe('sketch extension format', () => {
	test('uses sketch.path as group path and filterLayer key as leaf name', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.foundation.color['primary-main']).toBe('#1872f0ff');
		expect(parsed.color).toBeUndefined();
	});

	test('uses root flat-json output when sketch.path is absent', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
			}),
			token({
				name: 'theme-dimension-radius-card',
				path: ['theme', 'dimension', 'radius', 'card'],
				value: 8,
				type: 'dimension',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed['primary-main']).toBe('#1872f0ff');
		expect(parsed['radius-card']).toEqual({ value: 8 });
		expect(parsed.color).toBeUndefined();
		expect(parsed.dimension).toBeUndefined();
	});

	test('converts object color values to sketch hex8', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: { color: '#1872f0' },
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.foundation.color['primary-main']).toBe('#1872f0ff');
	});

	test('rejects non-color values in color output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-alpha',
				path: ['theme', 'color', 'alpha'],
				value: 0.16,
				type: 'color',
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch color output requires a color value',
		);
	});

	test('uses sketch.property.opacity for number output', () => {
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

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.foundation.interaction['interaction-hover']).toEqual({
			opacity: 0.16,
		});
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

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed['radius-card']).toEqual({ cornerRadius: 8 });
	});

	test('rejects non-numeric opacity values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-interaction-hover',
				path: ['theme', 'dimension', 'interaction', 'hover'],
				value: '8px',
				type: 'dimension',
				_sketch: { property: { opacity: true } },
			}),
		];

		expect(() => sketchFormat(tokens)).toThrow(
			'Sketch property opacity requires a finite number',
		);
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

	test('converts shadow tokens to sketch shadow object', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-shadow-1',
				path: ['theme', 'shadow', '1'],
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

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed.aaa.bbb['shadow-1']).toHaveLength(2);
		expect(parsed.aaa.bbb['shadow-1'][0]).toMatchObject({
			color: '#0f172b05',
			y: 0,
			blur: 2,
		});
	});

	test('converts gradient tokens to sketch gradient object', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-gradient-brand',
				path: ['theme', 'gradient', 'brand'],
				value: [
					{ color: '#00000000', position: 0 },
					{ color: '#000000cc', position: 1 },
				],
				type: 'gradient',
				_sketch: { path: 'foundation/gradient' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed.foundation.gradient['gradient-brand']).toEqual([
			{ color: '#00000000', position: 0 },
			{ color: '#000000cc', position: 1 },
		]);
	});

	test('detects duplicate sketch output paths', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#1872f0',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
			token({
				name: 'theme-color-primary-main-copy',
				path: ['theme', 'color', 'primary', 'main'],
				value: '#0f172b',
				type: 'color',
				_sketch: { path: 'foundation/color' },
				_order: 1,
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Duplicate Sketch output path "foundation/color/primary-main"',
		);
	});

	test('does not map composite tokens through component special cases', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-component-button-background',
				path: ['theme', 'component', 'button', 'background'],
				value: '#1872f0',
				type: 'color',
				_composite: 'theme.component.button',
			}),
			token({
				name: 'theme-component-button-radius',
				path: ['theme', 'component', 'button', 'radius'],
				value: 8,
				type: 'dimension',
				_composite: 'theme.component.button',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.component).toBeUndefined();
		expect(parsed['button-background']).toBe('#1872f0ff');
		expect(parsed['button-radius']).toEqual({ value: 8 });
	});

	test('formats inherited group sketch.path after transformer normalization', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					$extensions: { sketch: { path: 'foundation/color' } },
					primary: { $value: '#1872f0' },
				},
			},
		};
		const { tokens } = transformToWaveTokens(resolved);

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.foundation.color.primary).toBe('#1872f0ff');
		expect(parsed.primary).toBeUndefined();
	});
});
