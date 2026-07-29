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
				value: '4px',
				type: 'dimension',
				_order: 0,
			},
			{
				name: 'theme-dimension-gap-relative',
				path: ['theme', 'dimension', 'gap', 'relative'],
				value: '0.5rem',
				type: 'dimension',
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed['gap-small']).toEqual({ value: '4px' });
		expect(parsed['gap-relative']).toEqual({ value: '0.5rem' });
	});

	test('emits exact payloads for every standard type', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-brand',
				path: ['theme', 'color', 'brand'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			...[
				['dimension', '8px'],
				['fontFamily', ['Inter', 'sans-serif']],
				['fontWeight', 700],
				['duration', '200ms'],
				['cubicBezier', [0.4, 0, 0.2, 1]],
				['number', 0.5],
				['strokeStyle', { dashArray: ['4px', '8px'], lineCap: 'butt' }],
				[
					'transition',
					{
						duration: '200ms',
						delay: '0ms',
						timingFunction: [0.4, 0, 0.2, 1],
					},
				],
			].map(([type, value], index) => ({
				name: `theme-standard-${type}`,
				path: ['theme', 'standard', type as string],
				type: type as string,
				value,
				_order: index + 1,
			})),
			{
				name: 'theme-standard-border',
				path: ['theme', 'standard', 'border'],
				type: 'border',
				value: {
					color: '#112233',
					width: '1px',
					style: { dashArray: ['4px', '8px'], lineCap: 'butt' },
				},
				_sketchColorReference: '{theme.color.brand}',
				_order: 9,
			},
			{
				name: 'theme-standard-shadow',
				path: ['theme', 'standard', 'shadow'],
				type: 'shadow',
				value: [
					{
						color: '#11223380',
						offsetX: '0px',
						offsetY: '4px',
						blur: '8px',
						spread: '0px',
						inset: false,
					},
				],
				_order: 10,
			},
			{
				name: 'theme-standard-gradient',
				path: ['theme', 'standard', 'gradient'],
				type: 'gradient',
				value: [
					{ color: '#112233', position: 0 },
					{ color: '#445566', position: 1 },
				],
				_order: 11,
			},
			{
				name: 'theme-standard-typography',
				path: ['theme', 'standard', 'typography'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: '16px',
					fontWeight: 400,
					letterSpacing: '0px',
					lineHeight: 1.5,
				},
				_order: 12,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));
		expect(parsed.brand).toEqual({ color: '#112233ff' });
		expect(parsed.dimension).toEqual({ value: '8px' });
		expect(parsed.fontFamily).toEqual({ value: ['Inter', 'sans-serif'] });
		expect(parsed.fontWeight).toEqual({ value: 700 });
		expect(parsed.duration).toEqual({ value: '200ms' });
		expect(parsed.cubicBezier).toEqual({ value: [0.4, 0, 0.2, 1] });
		expect(parsed.number).toEqual({ value: 0.5 });
		expect(parsed.strokeStyle).toEqual({
			value: { dashArray: ['4px', '8px'], lineCap: 'butt' },
		});
		expect(parsed.transition).toEqual({
			value: {
				duration: '200ms',
				delay: '0ms',
				timingFunction: [0.4, 0, 0.2, 1],
			},
		});
		expect(parsed.border).toEqual({
			value: {
				color: '@/brand',
				width: '1px',
				style: { dashArray: ['4px', '8px'], lineCap: 'butt' },
			},
		});
		expect(parsed.shadow).toEqual({
			shadow: [
				{
					x: 0,
					y: 4,
					blur: 8,
					spread: 0,
					color: '#11223380',
					inset: false,
				},
			],
		});
		expect(parsed.gradient).toEqual({
			gradient: [
				{ color: '#112233ff', position: 0 },
				{ color: '#445566ff', position: 1 },
			],
		});
		expect(parsed.typography).toEqual({
			textStyle: {
				fontFamily: 'Inter',
				fontSize: 16,
				fontWeight: 400,
				lineHeight: 24,
				kerning: 0,
			},
		});
	});

	test('preserves unknown structured values in the generic value payload', () => {
		const value = { custom: ['a', { nested: true }] };
		const parsed = JSON.parse(
			sketchFormat([
				{
					name: 'theme-custom-payload',
					path: ['theme', 'custom', 'payload'],
					type: 'vendorCustom',
					value,
					_order: 0,
				},
			]),
		);
		expect(parsed['theme-custom-payload']).toEqual({ value });
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
		const dashArray = ['0px', '4px', '8px', '2pt'];
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-antline',
				path: ['theme', 'border', 'antline'],
				type: 'border',
				value: {
					color: '#000000',
					width: 1,
					style: { dashArray, lineCap: 'round' },
				},
				_order: 0,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 1 }));

		expect(parsed['border-antline']).toEqual({
			value: {
				color: '#000000ff',
				width: 1,
				style: { dashArray, lineCap: 'round' },
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
			'Sketch output failed at theme.color.primary.main',
		);
	});

	test('fails preserved none colors with path, platform, target, and reason', () => {
		const preservedColor = {
			colorSpace: 'oklch',
			components: ['none', 0.2, 260],
			alpha: 1,
		};
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-none',
				path: ['theme', 'color', 'none'],
				type: 'color',
				value: preservedColor,
				_targetColorSpace: 'oklch',
				_order: 0,
			},
			{
				name: 'theme-border-none',
				path: ['theme', 'border', 'none'],
				type: 'border',
				value: { color: preservedColor, width: '1px', style: 'solid' },
				_targetColorSpace: 'oklch',
				_order: 1,
			},
			{
				name: 'theme-shadow-none',
				path: ['theme', 'shadow', 'none'],
				type: 'shadow',
				value: {
					color: preservedColor,
					offsetX: '0px',
					offsetY: '1px',
					blur: '2px',
					spread: '0px',
				},
				_targetColorSpace: 'oklch',
				_order: 2,
			},
			{
				name: 'theme-gradient-none',
				path: ['theme', 'gradient', 'none'],
				type: 'gradient',
				value: [
					{ color: preservedColor, position: 0 },
					{ color: preservedColor, position: 1 },
				],
				_targetColorSpace: 'oklch',
				_order: 3,
			},
			{
				name: 'theme-font-none',
				path: ['theme', 'font', 'none'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: '16px',
					fontWeight: 400,
					letterSpacing: '0px',
					lineHeight: 1.5,
					color: preservedColor,
				},
				_targetColorSpace: 'oklch',
				_order: 4,
			},
		];

		for (const token of tokens) {
			let message = '';
			try {
				sketchFormat([token]);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).toContain('Sketch');
			expect(message).toContain(token.path.join('.'));
			expect(message).toContain('_targetColorSpace "oklch"');
			expect(message).toContain('contains "none"');
			expect(message).toContain('hex fallback');
		}
	});

	test('rejects units without a Sketch numeric projection contract', () => {
		for (const unit of ['em', 'rem', '%']) {
			const radius: WaveToken = {
				name: `theme-radius-${unit}`,
				path: ['theme', 'radius', unit],
				type: 'dimension',
				value: `1${unit}`,
				_sketch: { property: { cornerRadius: true } },
				_order: 0,
			};
			const shadow: WaveToken = {
				name: `theme-shadow-${unit}`,
				path: ['theme', 'shadow', unit],
				type: 'shadow',
				value: {
					color: '#000000',
					offsetX: `1${unit}`,
					offsetY: '0px',
					blur: '1px',
					spread: '0px',
				},
				_order: 1,
			};

			for (const token of [radius, shadow]) {
				expect(() => sketchFormat([token])).toThrow('Sketch output failed');
				expect(() => sketchFormat([token])).toThrow(token.path.join('.'));
			}
		}
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
				value: [
					{ color: '#ff000040', position: 0 },
					{ color: '#ff000040', position: 1 },
				],
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
		expect(parsed.body.textStyle.textColor).toBe('@/text-default');
		expect(parsed['numeric-reference'].textStyle.textColor).toBe('@/2x');
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
		expect(parsed.pointer.textStyle.textColor).toBe('@/brand-main');
		expect(parsed['pointer-value'].textStyle.textColor).toBe('@/brand-main');
	});

	test('references same-leaf colors through distinct full output paths', () => {
		const v1Target = {
			name: 'theme-color-v1-foo',
			path: ['theme', 'color', 'v1', 'foo'],
			value: '#112233',
			type: 'color',
			_sketch: { path: 'v1/color' },
			_order: 0,
		} satisfies WaveToken;
		const v2Target = {
			name: 'theme-color-v2-foo',
			path: ['theme', 'color', 'v2', 'foo'],
			value: '#445566',
			type: 'color',
			_sketch: { path: 'v2/color' },
			_order: 1,
		} satisfies WaveToken;
		const typography = {
			fontFamily: 'Inter',
			fontSize: 14,
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: 0,
			color: '#112233',
		};
		const tokens: WaveToken[] = [
			v1Target,
			v2Target,
			{
				name: 'theme-font-style-body-v1',
				path: ['theme', 'font', 'style', 'body-v1'],
				type: 'typography',
				value: typography,
				_typographyColor: '#112233',
				_sketchColorReference: '{theme.color.v1.foo}',
				_order: 2,
			},
			{
				name: 'theme-font-style-body-v2',
				path: ['theme', 'font', 'style', 'body-v2'],
				type: 'typography',
				value: { ...typography, color: '#445566' },
				_typographyColor: '#445566',
				_sketchColorReference: '{theme.color.v2.foo}',
				_order: 3,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 3 }));

		expect(parsed.v1.color.foo).toEqual({ color: '#112233ff' });
		expect(parsed.v2.color.foo).toEqual({ color: '#445566ff' });
		expect(parsed['body-v1'].textStyle.textColor).toBe('@/v1/color/foo');
		expect(parsed['body-v2'].textStyle.textColor).toBe('@/v2/color/foo');
	});

	test('encodes special full-path segments as RFC 6901', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-escaped',
				path: ['theme', 'color', 'text', 'escaped.key/~color'],
				value: '#112233',
				type: 'color',
				_sketch: { path: 'foundation/color' },
				_order: 0,
			},
			{
				name: 'theme-font-escaped',
				path: ['theme', 'font', 'escaped'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: 14,
					fontWeight: 400,
					lineHeight: 1.5,
					letterSpacing: 0,
					color: '#112233',
				},
				_typographyColor: '#112233',
				_sketchColorReference: '#/theme/color/text/escaped.key~1~0color',
				_order: 1,
			},
		];

		const parsed = JSON.parse(sketchFormat(tokens, { filterLayer: 2 }));

		expect(parsed.escaped.textStyle.textColor).toBe(
			'@/foundation/color/text-escaped.key~1~0color',
		);
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
			expect(parsed[key].value.color).toBe('@/text-default');
			expect(parsed[`outline-${key}`].shadow[0].color).toBe('@/text-default');
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
				value: [
					{ color: '#112233', position: 0 },
					{ color: '#112233', position: 1 },
				],
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
