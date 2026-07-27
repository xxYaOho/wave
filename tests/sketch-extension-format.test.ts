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

		expect(parsed.foundation.color['primary-main']).toEqual({
			color: '#1872f0ff',
		});
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

		expect(parsed['primary-main']).toEqual({ color: '#1872f0ff' });
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

		expect(parsed.foundation.color['primary-main']).toEqual({
			color: '#1872f0ff',
		});
	});

	test('normalizes shorthand color values to sketch hex8 objects', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-on-main',
				path: ['theme', 'color', 'primary', 'on-main'],
				value: '#fff',
				type: 'color',
				_sketch: { path: 'color-v2' },
			}),
			token({
				name: 'theme-color-overlay',
				path: ['theme', 'color', 'overlay'],
				value: '#0000',
				type: 'color',
				_sketch: { path: 'color-v2' },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed['color-v2']['primary-on-main']).toEqual({
			color: '#ffffffff',
		});
		expect(parsed['color-v2'].overlay).toEqual({ color: '#00000000' });
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

	test('uses sketch.property.opacity for state number output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-state-hover',
				path: ['theme', 'state', 'hover'],
				value: 0.16,
				type: 'number',
				_sketch: {
					path: 'foundation/state',
					property: { opacity: true },
				},
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed.foundation.state['state-hover']).toEqual({
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

		expect(parsed['radius-card']).toEqual({ corners: { radii: 8 } });
	});

	test('infers corners output for dimension-v radius path', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-radius-md',
				path: ['theme', 'dimension', 'radius', 'md'],
				value: { value: 8, unit: 'px' },
				type: 'dimension',
				_sketch: { path: 'dimension-v2/radius' },
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed['dimension-v2'].radius['radius-md']).toEqual({
			corners: { radii: 8 },
		});
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

		expect(parsed.aaa.bbb['shadow-1'].shadow).toHaveLength(2);
		expect(parsed.aaa.bbb['shadow-1'].shadow[0]).toMatchObject({
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

		expect(parsed.foundation.gradient['gradient-brand']).toEqual({
			gradient: [
				{ color: '#00000000', position: 0 },
				{ color: '#000000cc', position: 1 },
			],
		});
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
			'Duplicate Sketch output path',
		);
	});

	test('rejects strict-prefix output paths in either token order', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-dimension-foo',
				path: ['theme', 'dimension', 'foo'],
				value: 4,
				type: 'dimension',
				_sketch: { path: 'group' },
			}),
			token({
				name: 'theme-dimension-bar',
				path: ['theme', 'dimension', 'bar'],
				value: 8,
				type: 'dimension',
				_sketch: { path: 'group/foo' },
			}),
		];

		for (const orderedTokens of [tokens, [...tokens].reverse()]) {
			expect(() => sketchFormat(orderedTokens, { filterLayer: 2 })).toThrow(
				'Duplicate Sketch output path',
			);
		}
	});

	test('rejects mixed-type exact output path collisions', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-foo',
				path: ['theme', 'color', 'foo'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'group' },
			}),
			token({
				name: 'theme-dimension-foo',
				path: ['theme', 'dimension', 'foo'],
				value: 4,
				type: 'dimension',
				_sketch: { path: 'group' },
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Duplicate Sketch output path',
		);
	});

	test('filters skipped tokens before output path and duplicate checks', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary-skipped',
				path: ['theme', 'color', 'primary'],
				value: '#111111',
				type: 'color',
				_sketch: { path: 'foundation/color', skip: true },
			}),
			token({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#1872f0',
				type: 'color',
				_sketch: { path: 'foundation/color' },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.foundation.color.primary).toEqual({ color: '#1872f0ff' });
	});

	test('excludes non-writable tokens from output path preflight', () => {
		const written = token({
			name: 'theme-color-primary',
			path: ['theme', 'color', 'primary'],
			value: '#1872f0',
			type: 'color',
			_sketch: { path: 'foundation/color' },
		});
		const conflicting = token({
			name: 'theme-dimension-primary',
			path: ['theme', 'dimension', 'primary'],
			value: 8,
			type: 'dimension',
			_sketch: { path: 'foundation/color' },
		});

		const withoutValue = JSON.parse(
			sketchFormat([{ ...conflicting, value: undefined }, written], {
				filterLayer: 2,
			}),
		);
		expect(withoutValue.foundation.color.primary).toEqual({
			color: '#1872f0ff',
		});

		const skipped = JSON.parse(
			sketchFormat(
				[
					{ ...conflicting, _sketch: { ...conflicting._sketch, skip: true } },
					written,
				],
				{ filterLayer: 2 },
			),
		);
		expect(skipped.foundation.color.primary).toEqual({ color: '#1872f0ff' });

		const rootExcluded = JSON.parse(
			sketchFormat([conflicting, written], {
				filterLayer: 2,
				includeRootKeys: ['color'],
			}),
		);
		expect(rootExcluded.foundation.color.primary).toEqual({
			color: '#1872f0ff',
		});
	});

	test('keeps skipped tokens available to inheritColor sibling lookup', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-component-button-label',
				path: ['theme', 'component', 'button', 'label'],
				value: '#1872f0',
				type: 'color',
				_sketch: { skip: true },
			}),
			token({
				name: 'theme-component-button-icon',
				path: ['theme', 'component', 'button', 'icon'],
				value: '#000000',
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'label',
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens));
		expect(parsed['theme-component-button-label']).toBeUndefined();
		expect(parsed['theme-component-button-icon']).toEqual({
			color: '#1872f0ff',
		});
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
		expect(parsed['button-background']).toEqual({ color: '#1872f0ff' });
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

		expect(parsed.foundation.color.primary).toEqual({ color: '#1872f0ff' });
		expect(parsed.primary).toBeUndefined();
	});

	test('rejects composite references to skipped or root-excluded color targets', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const target = token({
			name: 'theme-color-text-default',
			path: ['theme', 'color', 'text', 'default'],
			value: '#112233',
			type: 'color',
			_sketch: { skip: true },
		});
		const body = token({
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: typography,
			_typographyColor: '#112233',
			_sketchColorReference: '{theme.color.text.default}',
			_order: 1,
		});
		const border = token({
			name: 'theme-border-focus',
			path: ['theme', 'border', 'focus'],
			type: 'border',
			value: { color: '#112233', width: 1, style: 'solid' },
			_sketchColorReference: '{theme.color.text.default}',
			_order: 2,
		});

		expect(() => sketchFormat([target, body])).toThrow('theme.font.body');
		expect(() => sketchFormat([target, border])).toThrow('theme.border.focus');
		expect(() =>
			sketchFormat([{ ...target, _sketch: undefined }, body], {
				includeRootKeys: ['font'],
			}),
		).toThrow('theme.font.body');
		expect(() =>
			sketchFormat([{ ...target, _sketch: undefined }, border], {
				includeRootKeys: ['border'],
			}),
		).toThrow('theme.border.focus');
		const undefinedTarget = { ...target, value: undefined, _sketch: undefined };
		expect(() => sketchFormat([undefinedTarget, body])).toThrow(
			'theme.font.body',
		);
		expect(() => sketchFormat([undefinedTarget, border])).toThrow(
			'theme.border.focus',
		);
	});

	test('keeps nested and dotted-key JSON Pointer aliases distinct', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-a-b',
				path: ['theme', 'color', 'a', 'b'],
				value: '#112233',
				type: 'color',
			}),
			token({
				name: 'theme-color-a.dotted',
				path: ['theme', 'color', 'a.b'],
				value: '#445566',
				type: 'color',
				_order: 1,
			}),
			token({
				name: 'theme-font-nested',
				path: ['theme', 'font', 'nested'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_sketchColorReference: '{theme.color.a.b}',
				_order: 2,
			}),
			token({
				name: 'theme-font-dotted',
				path: ['theme', 'font', 'dotted'],
				type: 'typography',
				value: { ...typography, color: '#445566' },
				_typographyColor: '#445566',
				_sketchColorReference: '#/theme/color/a.b',
				_order: 3,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.nested.textStyle.textColor).toBe('@/a-b');
		expect(parsed.dotted.textStyle.textColor).toBe('@/a.b');
	});

	test('allows duplicate filtered color keys under distinct output paths', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
			token({
				name: 'theme-state-text-default',
				path: ['theme', 'state', 'text', 'default'],
				value: '#445566',
				type: 'color',
				_sketch: { path: 'foundation/state' },
				_order: 1,
			}),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.foundation.color['text-default']).toEqual({
			color: '#112233ff',
		});
		expect(parsed.foundation.state['text-default']).toEqual({
			color: '#445566ff',
		});
	});

	test('rejects duplicate source aliases across distinct output paths', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'first-color',
				path: ['theme', 'color', 'shared'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'foundation/color' },
			}),
			token({
				name: 'second-color',
				path: ['theme', 'color', 'shared'],
				value: '#445566',
				type: 'color',
				_sketch: { path: 'foundation/state' },
			}),
		];

		expect(() => sketchFormat(tokens, { filterLayer: 99 })).toThrow(
			'Duplicate Sketch color reference alias',
		);
	});
});
