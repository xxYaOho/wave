import { describe, expect, test } from 'bun:test';
import { cssVariablesFormat } from '../src/core/generator/formats/css.ts';
import type { WaveToken } from '../src/types/index.ts';

describe('cssVariablesFormat (Wave-native)', () => {
	test('emits :root { --name: value; }', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens);
		expect(out).toContain(':root {');
		expect(out).toContain('--theme-color-primary: #ff0000;');
		expect(out).toContain('}');
	});

	test('honours filterLayer option', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, { filterLayer: 1 });
		expect(out).toContain('--color-primary: #ff0000;');
	});

	test('inheritColor: true emits currentColor', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text',
				path: ['theme', 'color', 'text'],
				value: '#000000',
				type: 'color',
				inheritColor: true,
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens);
		expect(out).toContain('currentColor');
	});

	test('inheritColor + opacity emits color-mix(... currentColor X%, transparent)', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-faded',
				path: ['theme', 'color', 'faded'],
				value: '#000000',
				type: 'color',
				inheritColor: true,
				inheritColorOpacity: 0.5,
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens);
		expect(out).toContain('color-mix');
		expect(out).toContain('currentColor 50%');
	});

	test('shadow array becomes css shadow string', () => {
		const tokens: WaveToken[] = [
			{
				name: 'style-shadow-1',
				path: ['style', 'shadow-1'],
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

		const out = cssVariablesFormat(tokens);
		expect(out).toContain('--style-shadow-1:');
		expect(out).toContain('rgb(');
	});

	test('appends inline /* desc */ for token comment', () => {
		const tokens: WaveToken[] = [
			{
				name: 'color-primary',
				path: ['color', 'primary'],
				value: '#ff0000',
				type: 'color',
				comment: 'brand primary',
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens);
		expect(out).toContain('/* brand primary */');
	});

	test('emits group comment from groupComments option above first token in that group', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
			{
				name: 'theme-color-secondary',
				path: ['theme', 'color', 'secondary'],
				value: '#00ff00',
				type: 'color',
				_order: 1,
			},
		];

		const out = cssVariablesFormat(tokens, {
			groupComments: { 'theme.color': 'palette tokens' },
		});

		expect(out).toContain('/* palette tokens */');
		const idx = out.indexOf('/* palette tokens */');
		const idxFirst = out.indexOf('--theme-color-primary');
		expect(idx).toBeLessThan(idxFirst);
	});

	test('includeRootKeys filters tokens to specified namespaces', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#ff0000',
				type: 'color',
				_order: 0,
			},
			{
				name: 'theme-dimension-gap',
				path: ['theme', 'dimension', 'gap'],
				value: '8px',
				type: 'dimension',
				_order: 1,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['color'],
		});
		expect(out).toContain('--theme-color-primary');
		expect(out).not.toContain('--theme-dimension-gap');
	});

	test('css output includes new public roots and excludes dimension', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-state-hover',
				path: ['theme', 'state', 'hover'],
				value: 0.16,
				type: 'number',
				_order: 0,
			},
			{
				name: 'theme-radius-md',
				path: ['theme', 'radius', 'md'],
				value: 8,
				type: 'dimension',
				_order: 1,
			},
			{
				name: 'theme-dimension-alpha-sm',
				path: ['theme', 'dimension', 'alpha', 'sm'],
				value: 0.16,
				type: 'number',
				_order: 2,
			},
			{
				name: 'style-shadow-legacy',
				path: ['style', 'shadow', 'legacy'],
				value: [
					{ color: '#000000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
				],
				type: 'shadow',
				_order: 3,
			},
			{
				name: 'border-width-sm',
				path: ['border', 'width', 'sm'],
				value: 1,
				type: 'dimension',
				_order: 4,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: [
				'color',
				'state',
				'shadow',
				'gradient',
				'border',
				'radius',
				'font',
			],
			filterLayer: 1,
		});

		expect(out).toContain('--state-hover: 0.16;');
		expect(out).toContain('--radius-md: 8px;');
		expect(out).toContain('--width-sm: 1px;');
		expect(out).not.toContain('--dimension-alpha-sm');
		expect(out).not.toContain('--shadow-legacy');
	});

	test('formats typography as field variables and shorthand variable', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-body-md',
				path: ['theme', 'font', 'body', 'md'],
				type: 'typography',
				value: {
					fontFamily: 'Inter, sans-serif',
					fontSize: '14px',
					fontWeight: 400,
					lineHeight: 1.5,
					letterSpacing: 0,
				},
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['font'],
			filterLayer: 1,
		});

		expect(out).toContain('--font-body-md-family: Inter, sans-serif;');
		expect(out).toContain('--font-body-md-size: 14px;');
		expect(out).toContain('--font-body-md-weight: 400;');
		expect(out).toContain('--font-body-md-line-height: 1.5;');
		expect(out).toContain('--font-body-md-letter-spacing: 0;');
		expect(out).toContain(
			'--font-body-md: var(--font-body-md-weight) var(--font-body-md-size) / var(--font-body-md-line-height) var(--font-body-md-family);',
		);
	});

	test('formats typography arrays, units, and resolved color', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: {
					fontFamily: ['system-ui', '"Segoe UI"', 'PingFang SC', 'inherit'],
					fontSize: 14,
					fontWeight: '400',
					lineHeight: '1.5',
					letterSpacing: -0.2,
					color: '#112233',
				},
				_typographyColor: '#112233',
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, { filterLayer: 1 });
		expect(out).toContain(
			'--font-body-family: system-ui, "Segoe UI", "PingFang SC", "inherit";',
		);
		expect(out).toContain('--font-body-size: 14px;');
		expect(out).toContain('--font-body-weight: 400;');
		expect(out).toContain('--font-body-line-height: 1.5;');
		expect(out).toContain('--font-body-letter-spacing: -0.2px;');
		expect(out).toContain('--font-body-color: #112233;');
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

		expect(() => cssVariablesFormat([token])).toThrow('theme.font.body');
	});

	test('reuses an emitted font family token and typography color reference', () => {
		const family = ['system-ui', 'PingFang SC'];
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-emphasis',
				path: ['theme', 'color', 'text', 'emphasis'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-font-font-family',
				path: ['theme', 'font', 'font-family'],
				type: 'fontFamily',
				value: family,
				_order: 1,
			},
			{
				name: 'theme-font-heading-h1',
				path: ['theme', 'font', 'heading', 'h1'],
				type: 'typography',
				value: {
					fontFamily: family,
					fontSize: 32,
					fontWeight: 700,
					lineHeight: 1.2,
					letterSpacing: 0,
					color: '#112233',
				},
				_colorReference: '{theme.color.text.emphasis}',
				_typographyColor: '#112233',
				_order: 2,
			},
		];

		const out = cssVariablesFormat(tokens, { filterLayer: 1 });
		expect(out).toContain('--font-font-family: system-ui, "PingFang SC";');
		expect(out).not.toContain('--font-heading-h1-family:');
		expect(out).toContain(
			'--font-heading-h1-color: var(--color-text-emphasis);',
		);
		expect(out).toContain(
			'--font-heading-h1: var(--font-heading-h1-weight) var(--font-heading-h1-size) / var(--font-heading-h1-line-height) var(--font-font-family);',
		);
	});

	test('uses the CSS color reference when alpha override excludes Sketch metadata', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-text-emphasis',
				path: ['theme', 'color', 'text', 'emphasis'],
				type: 'color',
				value: '#112233',
				_order: 0,
			},
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: 14,
					fontWeight: 400,
					lineHeight: 1.5,
					letterSpacing: 0,
					color: { $value: '#112233', alpha: 0.5 },
				},
				_colorReference: '#/theme/color/text/emphasis',
				_typographyColor: '#11223380',
				_order: 1,
			},
		];

		const out = cssVariablesFormat(tokens, { filterLayer: 1 });
		expect(out).toContain('--font-body-color: var(--color-text-emphasis);');
	});

	test('selects the first emitted matching font family token', () => {
		const family = ['Inter', 'sans-serif'];
		const makeFamily = (name: string, order: number): WaveToken => ({
			name,
			path: ['theme', 'font', name],
			type: 'fontFamily',
			value: family,
			_order: order,
		});
		const typography: WaveToken = {
			name: 'theme-font-body',
			path: ['theme', 'font', 'body'],
			type: 'typography',
			value: {
				fontFamily: family,
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 2,
		};

		const out = cssVariablesFormat(
			[
				makeFamily('primary-family', 0),
				makeFamily('alias-family', 1),
				typography,
			],
			{ filterLayer: 1 },
		);
		expect(out).toContain('var(--font-primary-family);');
		expect(out).not.toContain('var(--font-alias-family);');
	});

	test('escapes quoted font families and rejects invalid array members', () => {
		const base: WaveToken = {
			name: 'font-body',
			path: ['font', 'body'],
			type: 'typography',
			value: {
				fontFamily: ['ACME \\ "UI"'],
				fontSize: 14,
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_order: 0,
		};
		expect(cssVariablesFormat([base])).toContain(
			'--font-body-family: "ACME \\\\ \\"UI\\"";',
		);
		expect(() =>
			cssVariablesFormat([
				{
					...base,
					value: { ...(base.value as object), fontFamily: ['ok', ''] },
				},
			]),
		).toThrow('fontFamily');
	});

	test('normalizes string font families and rejects control boundaries', () => {
		const token: WaveToken = {
			name: 'font-body',
			path: ['font', 'body'],
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
		expect(cssVariablesFormat([token])).toContain('--font-body-family: Inter;');
		for (const fontFamily of ['\u0000Inter', 'Inter\u007f', '\u0085Inter']) {
			expect(() =>
				cssVariablesFormat([
					{
						...token,
						value: { ...(token.value as object), fontFamily },
					},
				]),
			).toThrow('fontFamily');
		}
	});

	test('rejects a unitless lineHeight object', () => {
		const token: WaveToken = {
			name: 'font-body',
			path: ['font', 'body'],
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

		expect(() => cssVariablesFormat([token])).toThrow('lineHeight');
	});

	test('formats outline border with offset companion', () => {
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

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['border'],
			filterLayer: 1,
		});

		expect(out).toContain('--border-outline-focus: 1px solid #000000;');
		expect(out).toContain('--border-outline-focus-offset: 2px;');
	});

	test('formats outline border width and offset from px strings', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-outline-focus',
				path: ['theme', 'border', 'outline', 'focus'],
				type: 'border',
				value: { color: '#000000', width: '1px', style: 'solid' },
				_outline: { offset: 0 },
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['border'],
			filterLayer: 1,
		});

		expect(out).toContain('--border-outline-focus: 1px solid #000000;');
		expect(out).toContain('--border-outline-focus-offset: 0;');
	});

	test('formats normal border token as css border string', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-card',
				path: ['theme', 'border', 'card'],
				type: 'border',
				value: { color: '#2563eb', width: '2px', style: 'solid' },
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['border'],
			filterLayer: 1,
		});

		expect(out).toContain('--border-card: 2px solid #2563eb;');
		expect(out).not.toContain('[object Object]');
	});

	test('preserves comments on border tokens', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-card',
				path: ['theme', 'border', 'card'],
				type: 'border',
				value: { color: '#2563eb', width: 1, style: 'solid' },
				comment: 'card border',
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['border'],
			filterLayer: 1,
		});

		expect(out).toContain(
			'--border-card: 1px solid #2563eb; /* card border */',
		);
	});

	test('formats DTCG dashArray border with dashed fallback and companion', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-antline',
				path: ['theme', 'border', 'antline'],
				type: 'border',
				value: {
					color: '#2563eb',
					width: '1px',
					style: {
						dashArray: [0, 4, '8', '1.5rem', { value: 2, unit: 'pt' }, '25%'],
					},
				},
				comment: 'animated border',
				_outline: { offset: 2 },
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['border'],
			filterLayer: 1,
		});

		expect(out).toContain(
			'--border-antline: 1px dashed #2563eb; /* animated border */',
		);
		expect(out).toContain(
			'--border-antline-dash-array: 0 4px 8px 1.5rem 2pt 25%;',
		);
		expect(out).toContain('--border-antline-offset: 2px;');
		expect(out).not.toContain('[object Object]');
		expect(out.indexOf('--border-antline-dash-array:')).toBeGreaterThan(
			out.indexOf('--border-antline:'),
		);
	});

	test('ignores resolved swatch metadata on dashArray dimensions', () => {
		const token: WaveToken = {
			name: 'theme-border-antline',
			path: ['theme', 'border', 'antline'],
			type: 'border',
			value: {
				color: '#2563eb',
				width: 1,
				style: {
					dashArray: [
						{ value: 4, unit: 'px', _swatchName: 'dimension/dash' },
						8,
					],
				},
			},
			_order: 0,
		};

		const out = cssVariablesFormat([token], { filterLayer: 1 });

		expect(out).toContain('--border-antline-dash-array: 4px 8px;');
		expect(out).not.toContain('_swatchName');
	});

	test('rejects invalid dashArray objects instead of stringifying them', () => {
		const token: WaveToken = {
			name: 'theme-border-antline',
			path: ['theme', 'border', 'antline'],
			type: 'border',
			value: {
				color: '#2563eb',
				width: 1,
				style: { dashArray: [{ nope: 4 }, 8] },
			},
			_order: 0,
		};

		expect(() => cssVariablesFormat([token], { filterLayer: 1 })).toThrow(
			'dashArray',
		);
	});

	test('rejects dashArray companion collisions with real token keys', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-antline',
				path: ['theme', 'border', 'antline'],
				type: 'border',
				value: {
					color: '#2563eb',
					width: 1,
					style: { dashArray: [4, 8] },
				},
				_order: 0,
			},
			{
				name: 'theme-border-antline-dash-array',
				path: ['theme', 'border', 'antline', 'dash-array'],
				type: 'dimension',
				value: 12,
				_order: 1,
			},
		];

		expect(() => cssVariablesFormat(tokens, { filterLayer: 1 })).toThrow(
			'--border-antline-dash-array',
		);
	});

	test('throws instead of falling back for object border color', () => {
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

		expect(() =>
			cssVariablesFormat(tokens, {
				includeRootKeys: ['border'],
				filterLayer: 1,
			}),
		).toThrow('CSS output requires transformer-normalized value');
	});

	test('throws instead of emitting object border width', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-border-card',
				path: ['theme', 'border', 'card'],
				type: 'border',
				value: { color: '#2563eb', width: { value: 2, unit: 'px' } },
				_order: 0,
			},
		];

		expect(() =>
			cssVariablesFormat(tokens, {
				includeRootKeys: ['border'],
				filterLayer: 1,
			}),
		).toThrow('CSS output requires transformer-normalized value');
	});

	test('throws instead of emitting object color value', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
				type: 'color',
				_order: 0,
			},
		];

		expect(() => cssVariablesFormat(tokens)).toThrow(
			'CSS output requires transformer-normalized value',
		);
	});

	test('formats normalized shadow and gradient colors without object leakage', () => {
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

		const out = cssVariablesFormat(tokens);
		expect(out).not.toContain('[object Object]');
		expect(out).toContain('rgb(255 0 255 / 0.5)');
		expect(out).toContain('0 4px 8px 0');
		expect(out).toContain('rgb(255 0 0 / 0.25)');
	});

	test('formats normalized single-object shadow without object leakage', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				value: {
					color: '#ff00ff80',
					offsetX: 0,
					offsetY: 4,
					blur: 8,
					spread: 0,
				},
				type: 'shadow',
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens);
		expect(out).not.toContain('[object Object]');
		expect(out).toContain('--theme-shadow-raised: 0 4px 8px 0');
		expect(out).toContain('rgb(255 0 255 / 0.5)');
	});

	test('throws instead of emitting object color inside shadow', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				value: [
					{
						color: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
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

		expect(() => cssVariablesFormat(tokens)).toThrow(
			'CSS output requires transformer-normalized value',
		);
	});

	test('throws instead of emitting object color inside single-object shadow', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-shadow-raised',
				path: ['theme', 'shadow', 'raised'],
				value: {
					color: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
					offsetX: 0,
					offsetY: 4,
					blur: 8,
					spread: 0,
				},
				type: 'shadow',
				_order: 0,
			},
		];

		expect(() => cssVariablesFormat(tokens)).toThrow(
			'CSS output requires transformer-normalized value',
		);
	});

	test('throws instead of emitting object color inside gradient', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-gradient-accent',
				path: ['theme', 'gradient', 'accent'],
				value: [
					{
						color: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
						position: 0,
					},
				],
				type: 'gradient',
				_order: 0,
			},
		];

		expect(() => cssVariablesFormat(tokens)).toThrow(
			'CSS output requires transformer-normalized value',
		);
	});
});
