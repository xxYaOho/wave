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

		expect(parsed).toEqual({ 'primary-main': { color: '#ff0000ff' } });
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

	test('sketch output excludes public dimension root', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-dimension-radius-md',
				path: ['theme', 'dimension', 'radius', 'md'],
				value: 8,
				type: 'dimension',
				_order: 0,
				_sketch: { path: 'dimension/v2/radius' },
			},
			{
				name: 'theme-radius-md',
				path: ['theme', 'radius', 'md'],
				value: 8,
				type: 'dimension',
				_order: 1,
				_sketch: { path: 'radius/v2' },
			},
			{
				name: 'style-shadow-legacy',
				path: ['style', 'shadow', 'legacy'],
				value: [
					{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
				],
				type: 'shadow',
				_order: 2,
				_sketch: { path: 'legacy/shadow' },
			},
		];

		const out = sketchFormat(tokens, {
			filterLayer: 1,
			includeRootKeys: [
				'color',
				'state',
				'shadow',
				'gradient',
				'border',
				'radius',
				'font',
			],
		});

		expect(out).toContain('radius-md');
		expect(out).not.toContain('dimension-radius-md');
		expect(out).not.toContain('shadow-legacy');
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

		expect(parsed['shadow-1'].shadow[0]).toMatchObject({
			x: 0,
			y: 4,
			blur: 8,
			spread: 0,
			color: '#00000080',
		});
	});

	test('formats outline border as sketch shadow simulation', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: { color: '#000000', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed['border-outline-focus'].shadow).toEqual([
			{ x: 0, y: 0, blur: 0, spread: 3, color: '#000000ff' },
			{ x: 0, y: 0, blur: 0, spread: 2, color: '#ffffffff' },
		]);
	});

	test('preserves structured dashArray on ordinary borders', () => {
		const dashArray = [0, 4, '8px', { value: 2, unit: 'pt' }];
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-antline',
				path: ['theme', 'border', 'antline'],
				type: 'border',
				value: {
					color: '#000000',
					width: 1,
					style: { dashArray },
				},
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed['border-antline']).toEqual({
			value: {
				color: '#000000ff',
				width: 1,
				style: { dashArray },
			},
		});
	});

	test('throws instead of falling back for object outline color', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: {
					color: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
					width: 1,
					style: 'solid',
				},
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		expect(() => sketchFormat(tokens, { filterLayer: 1 })).toThrow(
			'Sketch outline output requires transformer-normalized color',
		);
	});

	test('throws instead of falling back for object outline width', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: {
					color: '#000000',
					width: { value: 1, unit: 'px' },
					style: 'solid',
				},
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		expect(() => sketchFormat(tokens, { filterLayer: 1 })).toThrow(
			'Sketch outline output requires transformer-normalized width',
		);
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
		const shadow = parsed['shadow-multi'].shadow;

		expect(shadow[0]).toMatchObject({ blur: 16, y: 8 });
		expect(shadow[1]).toMatchObject({ blur: 8, y: 4 });
		expect(shadow[2]).toMatchObject({ blur: 2, y: 1 });
		expect((tokens[0]!.value as unknown[])[0]).toMatchObject({ blur: 2 });
	});

	test('throws when sketch receives non-hex color string', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary-main',
				path: ['theme', 'color', 'primary', 'main'],
				value: 'oklch(52% 0.25 263)',
				type: 'color',
				_order: 0,
			},
		];

		expect(() => sketchFormat(tokens, { filterLayer: 2 })).toThrow(
			'Sketch color output requires hex color',
		);
	});

	test('formats normalized shadow and gradient colors as hex8', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				value: [
					{
						color: '#ff00ff80',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: 0,
					},
				],
				type: 'shadow',
				_order: 0,
			},
			{
				name: 'theme-gradient-accent',
				path: ['theme', 'gradient', 'accent'],
				value: [{ color: '#ff000040', position: 0 }],
				type: 'gradient',
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));
		expect(parsed['shadow-raised'].shadow[0].color).toBe('#ff00ff80');
		expect(parsed['gradient-accent'].gradient[0].color).toBe('#ff000040');
	});

	test('formats typography as sketch text style payload', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-heading-h1',
				path: ['theme', 'font', 'heading', 'h1'],
				type: 'typography',
				value: {
					fontFamily: 'Helvetica',
					fontSize: '32px',
					fontWeight: 9,
					lineHeight: '40px',
					letterSpacing: 0,
				},
				_order: 0,
				_sketch: { path: 'font/v2' },
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed.font.v2['font-heading-h1']).toEqual({
			textStyle: {
				fontFamily: 'Helvetica',
				fontSize: 32,
				fontWeight: 9,
				lineHeight: 40,
				kerning: 0,
			},
		});
		expect(JSON.stringify(parsed.font.v2['font-heading-h1'])).not.toContain(
			'color',
		);
		expect(JSON.stringify(parsed.font.v2['font-heading-h1'])).not.toContain(
			'alignment',
		);
	});

	test('prefers PingFang SC and resolves multiplier line height', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: {
					fontFamily: ['system-ui', 'Inter', 'PingFang SC'],
					fontSize: { value: 14, unit: 'pt' },
					fontWeight: '400',
					lineHeight: 1.33333,
					letterSpacing: { value: -0.2, unit: 'pt' },
					color: '#112233',
				},
				_typographyColor: '#112233',
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens));
		expect(parsed['theme-font-body']).toEqual({
			textStyle: {
				fontFamily: 'PingFang SC',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 19,
				kerning: -0.2,
				textColor: '#112233ff',
			},
		});
	});

	test('converts rem typography lengths using the shared base font size', () => {
		const token: WaveToken = {
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: '0.875rem',
				fontWeight: 400,
				lineHeight: '1.25rem',
				letterSpacing: '0.1rem',
			},
			_typographyBaseFontSize: 14,
			_order: 0,
		};

		const parsed = JSON.parse(sketchFormat([token]));
		expect(parsed['theme-font-body'].textStyle).toMatchObject({
			fontSize: 12.25,
			lineHeight: 18,
			kerning: 1.4,
		});
	});

	test('ceilings rem line height and rejects missing base metadata', () => {
		const token: WaveToken = {
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: '0.875rem',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_typographyBaseFontSize: 14,
			_order: 0,
		};

		const parsed = JSON.parse(sketchFormat([token]));
		expect(parsed['theme-font-body'].textStyle.lineHeight).toBe(19);
		expect(() =>
			sketchFormat([{ ...token, _typographyBaseFontSize: undefined }]),
		).toThrow('theme.font.body');
	});

	test('rejects typography color without normalized formatter metadata', () => {
		const token: WaveToken = {
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
				color: '#112233',
			},
			_order: 0,
		};

		expect(() => sketchFormat([token])).toThrow('theme.font.body');
	});

	test('ceilings fractional absolute line height', () => {
		for (const lineHeight of ['18.6px', '18.6pt']) {
			const token: WaveToken = {
				name: `font-caption-${lineHeight}`,
				path: ['font', 'caption', lineHeight],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: 12,
					fontWeight: 400,
					lineHeight,
					letterSpacing: 0,
				},
				_order: 0,
			};

			const parsed = JSON.parse(sketchFormat([token]));
			expect(parsed[`font-caption-${lineHeight}`].textStyle.lineHeight).toBe(
				19,
			);
		}
	});

	test('selects the first concrete family and omits aliases-only arrays', () => {
		const makeTypography = (family: string[], order: number): WaveToken => ({
			name: `font-${order}`,
			path: ['font', String(order)],
			type: 'typography',
			value: {
				fontFamily: family,
				fontSize: 12,
				fontWeight: 400,
				lineHeight: '16px',
				letterSpacing: 0,
			},
			_order: order,
		});
		const parsed = JSON.parse(
			sketchFormat([
				makeTypography(['SYSTEM-UI', 'Inter', 'Helvetica'], 0),
				makeTypography(['sans-serif', '-APPLE-SYSTEM'], 1),
			]),
		);
		expect(parsed['font-0'].textStyle.fontFamily).toBe('Inter');
		expect(parsed['font-1'].textStyle.fontFamily).toBeUndefined();
		expect(parsed['font-0'].textStyle.lineHeight).toBe(16);
	});

	test('throws with token path when multiplier line height cannot use font size', () => {
		const token: WaveToken = {
			name: 'font-bad',
			path: ['theme', 'font', 'bad'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: 'bad',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 0,
		};
		expect(() => sketchFormat([token])).toThrow('theme.font.bad');
	});

	test('normalizes string font families and rejects control boundaries', () => {
		const token: WaveToken = {
			name: 'font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: '  Inter  ',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 0,
		};
		const parsed = JSON.parse(sketchFormat([token]));
		expect(parsed['font-body'].textStyle.fontFamily).toBe('Inter');

		for (const fontFamily of ['\u0000Inter', 'Inter\u007f', '\u0085Inter']) {
			expect(() =>
				sketchFormat([
					{
						...token,
						value: { ...(token.value as object), fontFamily },
					},
				]),
			).toThrow('theme.font.body');
		}
	});

	test('rejects a unitless lineHeight object', () => {
		const token: WaveToken = {
			name: 'font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: 14,
				fontWeight: 400,
				lineHeight: { value: 1.5 },
				letterSpacing: 0,
			},
			_order: 0,
		};

		expect(() => sketchFormat([token])).toThrow('lineHeight');
	});

	test('formats theme radius cornerRadius property as corners radii', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-radius-md',
				path: ['theme', 'radius', 'md'],
				type: 'dimension',
				value: '8px',
				_order: 0,
				_sketch: { property: { cornerRadius: true } },
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed['radius-md']).toEqual({ corners: { radii: 8 } });
	});

	test('maps safe curly typography color references to emitted Sketch keys', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-color-2x',
				path: ['theme', 'color', '2x'],
				type: 'color',
				value: '#445566',
				_order: 1,
			},
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_sketchColorReference: '{theme.color.text.default}',
				_order: 2,
			},
			{
				name: 'theme-font-numeric-reference',
				path: ['theme', 'font', 'numeric-reference'],
				type: 'typography',
				value: { ...typography, color: '#445566' },
				_typographyColor: '#445566',
				_sketchColorReference: '{theme.color.2x}',
				_order: 3,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.body.textStyle.textColor).toBe('@text-default');
		expect(parsed['numeric-reference'].textStyle.textColor).toBe('@2x');
	});

	test('maps both JSON Pointer typography color reference forms', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-brand-main',
				path: ['theme', 'color', 'brand', 'main'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-font-pointer',
				path: ['theme', 'font', 'pointer'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_sketchColorReference: '#/theme/color/brand/main',
				_order: 1,
			},
			{
				name: 'theme-font-pointer-value',
				path: ['theme', 'font', 'pointer-value'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_sketchColorReference: '#/theme/color/brand/main/$value',
				_order: 2,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.pointer.textStyle.textColor).toBe('@brand-main');
		expect(parsed['pointer-value'].textStyle.textColor).toBe('@brand-main');
	});

	test('preserves HEX8 typography colors without a matching Sketch reference', () => {
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-font-literal',
				path: ['theme', 'font', 'literal'],
				type: 'typography',
				value: typography,
				_colorReference: '{theme.color.text.default}',
				_typographyColor: '#112233',
				_order: 1,
			},
			{
				name: 'theme-font-external',
				path: ['theme', 'font', 'external'],
				type: 'typography',
				value: typography,
				_sketchColorReference: '#/palette/text/default',
				_typographyColor: '#112233',
				_order: 2,
			},
			{
				name: 'theme-font-alpha',
				path: ['theme', 'font', 'alpha'],
				type: 'typography',
				value: typography,
				_colorReference: '#/theme/color/text/default',
				_typographyColor: '#11223380',
				_order: 3,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.literal.textStyle.textColor).toBe('#112233ff');
		expect(parsed.external.textStyle.textColor).toBe('#112233ff');
		expect(parsed.alpha.textStyle.textColor).toBe('#11223380');
	});

	test('maps curly and JSON Pointer color references in border and outline slots', () => {
		const border = { color: '#112233', width: 1, style: 'solid' };
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			...[
				['curly', '{theme.color.text.default}'],
				['pointer', '#/theme/color/text/default'],
				['pointer-value', '#/theme/color/text/default/$value'],
			].flatMap(([name, reference], index) => [
				{
					name: `theme-border-${name}`,
					path: ['theme', 'border', name!],
					type: 'border',
					value: border,
					_sketchColorReference: reference,
					_order: index * 2 + 1,
				},
				{
					name: `theme-border-outline-${name}`,
					path: ['theme', 'border', 'outline', name!],
					type: 'border',
					value: border,
					_outline: { offset: 2 },
					_sketchColorReference: reference,
					_order: index * 2 + 2,
				},
			]),
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		for (const key of ['curly', 'pointer', 'pointer-value']) {
			expect(parsed[key].value.color).toBe('@text-default');
			expect(parsed[`outline-${key}`].shadow[0].color).toBe('@text-default');
			expect(parsed[`outline-${key}`].shadow[1].color).toBe('#ffffffff');
		}
	});

	test('keeps literal, external, and alpha-override border colors as hex8', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-default',
				path: ['theme', 'color', 'text', 'default'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-border-literal',
				path: ['theme', 'border', 'literal'],
				type: 'border',
				value: { color: '#112233', width: 1, style: 'solid' },
				_order: 1,
			},
			{
				name: 'theme-border-external',
				path: ['theme', 'border', 'external'],
				type: 'border',
				value: { color: '#112233', width: 1, style: 'solid' },
				_sketchColorReference: '#/palette/text/default',
				_order: 2,
			},
			{
				name: 'theme-border-outline-alpha',
				path: ['theme', 'border', 'outline', 'alpha'],
				type: 'border',
				value: { color: '#11223380', width: 1, style: 'solid' },
				_outline: { offset: 2 },
				_colorReference: '#/theme/color/text/default',
				_order: 3,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.literal.value.color).toBe('#112233ff');
		expect(parsed.external.value.color).toBe('#112233ff');
		expect(parsed['outline-alpha'].shadow[0].color).toBe('#11223380');
		expect(parsed['outline-alpha'].shadow[1].color).toBe('#ffffffff');
	});

	test('keeps shadow, gradient, and inheritColor output as hex8', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-base',
				path: ['theme', 'color', 'base'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-color-derived',
				path: ['theme', 'color', 'derived'],
				type: 'color',
				value: '#112233',
				inheritColor: true,
				inheritColorSiblingSlot: 'base',
				_sketchColorReference: '{theme.color.base}',
				_order: 1,
			},
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				type: 'shadow',
				value: { color: '#112233', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
				_sketchColorReference: '{theme.color.base}',
				_order: 2,
			},
			{
				name: 'theme-gradient-accent',
				path: ['theme', 'gradient', 'accent'],
				type: 'gradient',
				value: [{ color: '#112233', position: 0 }],
				_sketchColorReference: '{theme.color.base}',
				_order: 3,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.derived.color).toBe('#112233ff');
		expect(parsed.raised.shadow[0].color).toBe('#112233ff');
		expect(parsed.accent.gradient[0].color).toBe('#112233ff');
	});
});
