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

	test('formats typography as field variables without aggregate shorthand', () => {
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

		expect(out).toContain('--font-body-md-family: "Inter, sans-serif";');
		expect(out).toContain('--font-body-md-size: 14px;');
		expect(out).toContain('--font-body-md-weight: 400;');
		expect(out).toContain('--font-body-md-line-height: 1.5;');
		expect(out).toContain('--font-body-md-letter-spacing: 0;');
		expect(out).not.toContain('--font-body-md: var(--font-body-md-weight)');
	});

	test('emits the shared typography base font size and preserves rem values', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-font-body',
				path: ['theme', 'font', 'body'],
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: '0.875rem',
					fontWeight: 400,
					lineHeight: '1.5rem',
					letterSpacing: '0.1rem',
				},
				_typographyBaseFontSize: 14,
				_order: 0,
			},
		];

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['font'],
			filterLayer: 1,
		});

		expect(out).toContain(':root {\n  font-size: 14px;');
		expect(out).toContain('--font-body-size: 0.875rem;');
		expect(out).toContain('--font-body-line-height: 1.5rem;');
		expect(out).toContain('--font-body-letter-spacing: 0.1rem;');
	});

	test('rejects conflicting typography base font sizes and ignores color-only selections', () => {
		const typography = (name: string, baseFontSize: number): WaveToken => ({
			name,
			path: ['theme', 'font', name],
			type: 'typography',
			value: {
				fontFamily: 'Inter',
				fontSize: '1rem',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			},
			_typographyBaseFontSize: baseFontSize,
			_order: baseFontSize,
		});

		expect(() =>
			cssVariablesFormat([typography('body', 14), typography('heading', 16)]),
		).toThrow('baseFontSize conflicts');

		const colorOnly = cssVariablesFormat(
			[
				{
					name: 'theme-color-primary',
					path: ['theme', 'color', 'primary'],
					type: 'color',
					value: '#112233',
					_order: 0,
				},
			],
			{ includeRootKeys: ['color'] },
		);
		expect(colorOnly).not.toContain('font-size:');
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
		expect(out).not.toContain(
			'--font-heading-h1: var(--font-heading-h1-weight)',
		);
		expect(out).toContain(
			'--font-heading-h1-color: var(--color-text-emphasis);',
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

	test('suppresses local typography family when an equal font family token is emitted', () => {
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
		expect(out).toContain('--font-primary-family: Inter, sans-serif;');
		expect(out).toContain('--font-alias-family: Inter, sans-serif;');
		expect(out).not.toContain('--font-body-family:');
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
						lineCap: 'butt',
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
		expect(out).toContain('--border-antline-line-cap: butt;');
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
					lineCap: 'round',
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

	test('formats a DTCG object border color as CSS Color 4', () => {
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

		const out = cssVariablesFormat(tokens, {
			includeRootKeys: ['border'],
			filterLayer: 1,
		});
		expect(out).toContain(
			'--border-outline-focus: 1px solid oklch(0.5 0.2 260);',
		);
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
		).toThrow('CSS length must be a normalized dimension');
	});

	test('formats DTCG object color value as CSS Color 4', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
				type: 'color',
				_order: 0,
			},
		];

		expect(cssVariablesFormat(tokens)).toContain(
			'--theme-color-primary: oklch(0.5 0.2 260);',
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
				value: [
					{ color: '#ff000040', position: 0 },
					{ color: '#ff000040', position: 1 },
				],
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

	test('formats object color inside shadow as CSS Color 4', () => {
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

		expect(cssVariablesFormat(tokens)).toContain(
			'0 4px 8px 0 oklch(0.5 0.2 260)',
		);
	});

	test('formats object color inside single-object shadow as CSS Color 4', () => {
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

		expect(cssVariablesFormat(tokens)).toContain(
			'0 4px 8px 0 oklch(0.5 0.2 260)',
		);
	});

	test('formats object colors inside gradient as CSS Color 4', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-gradient-accent',
				path: ['theme', 'gradient', 'accent'],
				value: [
					{
						color: { colorSpace: 'oklch', components: [0.5, 0.2, 260] },
						position: 0,
					},
					{
						color: { colorSpace: 'oklch', components: [0.7, 0.1, 120] },
						position: 1,
					},
				],
				type: 'gradient',
				_order: 0,
			},
		];

		expect(cssVariablesFormat(tokens)).toContain(
			'linear-gradient(to right, oklch(0.5 0.2 260) 0%, oklch(0.7 0.1 120) 100%)',
		);
	});

	test('formats standard scalar types with type-directed CSS values', () => {
		const tokens: WaveToken[] = [
			{
				name: 'duration-fast',
				path: ['duration', 'fast'],
				type: 'duration',
				value: '200ms',
				_order: 0,
			},
			{
				name: 'ease-standard',
				path: ['ease', 'standard'],
				type: 'cubicBezier',
				value: [0.4, 0, 0.2, 1],
				_order: 1,
			},
			{
				name: 'weight-strong',
				path: ['weight', 'strong'],
				type: 'fontWeight',
				value: 400.5,
				_order: 2,
			},
			{
				name: 'family-ui',
				path: ['family', 'ui'],
				type: 'fontFamily',
				value: ['Inter', 'ACME \\ "UI"', 'sans-serif'],
				_order: 3,
			},
		];
		const out = cssVariablesFormat(tokens);
		expect(out).toContain('--duration-fast: 200ms;');
		expect(out).toContain('--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);');
		expect(out).toContain('--weight-strong: 400.5;');
		expect(out).toContain(
			'--family-ui: Inter, "ACME \\\\ \\"UI\\"", sans-serif;',
		);
		expect(() => cssVariablesFormat([{ ...tokens[3]!, value: [] }])).toThrow(
			'fontFamily',
		);
	});

	test('quotes a comma in standalone and typography fontFamily as one family name', () => {
		const standalone: WaveToken = {
			name: 'family-comma',
			path: ['family', 'comma'],
			type: 'fontFamily',
			value: 'ACME, UI',
			_order: 0,
		};
		const typography: WaveToken = {
			name: 'font-comma',
			path: ['font', 'comma'],
			type: 'typography',
			value: {
				fontFamily: 'ACME, UI',
				fontSize: '16px',
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: '0px',
			},
			_order: 1,
		};
		expect(cssVariablesFormat([standalone])).toContain(
			'--family-comma: "ACME, UI";',
		);
		expect(cssVariablesFormat([typography])).toContain(
			'--font-comma-family: "ACME, UI";',
		);
	});

	test('formats strokeStyle, border, transition, inset shadow, and gradient contracts', () => {
		const tokens: WaveToken[] = [
			{
				name: 'stroke-antline',
				path: ['stroke', 'antline'],
				type: 'strokeStyle',
				value: { dashArray: ['4px', '8px'], lineCap: 'butt' },
				_order: 0,
			},
			{
				name: 'border-antline',
				path: ['border', 'antline'],
				type: 'border',
				value: {
					color: '#000000',
					width: '1px',
					style: { dashArray: ['4px', '8px'], lineCap: 'square' },
				},
				_order: 1,
			},
			{
				name: 'transition-emphasis',
				path: ['transition', 'emphasis'],
				type: 'transition',
				value: {
					duration: '200ms',
					timingFunction: [0.4, 0, 0.2, 1],
					delay: '-50ms',
				},
				_order: 2,
			},
			{
				name: 'shadow-inset',
				path: ['shadow', 'inset'],
				type: 'shadow',
				value: {
					color: '#00000080',
					offsetX: '0px',
					offsetY: '1px',
					blur: '2px',
					spread: '-1px',
					inset: true,
				},
				_order: 3,
			},
			{
				name: 'gradient-accent',
				path: ['gradient', 'accent'],
				type: 'gradient',
				value: [
					{ color: '#000000', position: 0 },
					{ color: '#ffffff', position: 0.125 },
					{ color: '#ffffff', position: 1 },
				],
				_order: 4,
			},
		];
		const out = cssVariablesFormat(tokens);
		expect(out).toContain('--stroke-antline: dashed;');
		expect(out).toContain('--stroke-antline-dash-array: 4px 8px;');
		expect(out).toContain('--stroke-antline-line-cap: butt;');
		expect(out).toContain('--border-antline: 1px dashed #000000;');
		expect(out).toContain('--border-antline-line-cap: square;');
		expect(out).toContain(
			'--transition-emphasis: 200ms cubic-bezier(0.4, 0, 0.2, 1) -50ms;',
		);
		expect(out).toContain(
			'--shadow-inset: inset 0 1px 2px -1px rgb(0 0 0 / 0.5);',
		);
		expect(out).toContain('rgb(255 255 255 / 1) 12.5%');
	});

	test('enforces CSS field-level negative value restrictions', () => {
		const token = (type: string, value: unknown): WaveToken => ({
			name: `bad-${type}`,
			path: ['bad', type],
			type,
			value,
			_order: 0,
		});
		expect(() =>
			cssVariablesFormat([
				token('border', { color: '#000', width: '-1px', style: 'solid' }),
			]),
		).toThrow('border width');
		expect(() =>
			cssVariablesFormat([
				token('transition', {
					duration: '-1ms',
					timingFunction: [0, 0, 1, 1],
					delay: '-1ms',
				}),
			]),
		).toThrow('transition duration');
		expect(() =>
			cssVariablesFormat([
				token('shadow', {
					color: '#000',
					offsetX: '-1px',
					offsetY: '0px',
					blur: '-1px',
					spread: '-1px',
				}),
			]),
		).toThrow('shadow layer 0 blur');
		expect(() =>
			cssVariablesFormat([
				token('strokeStyle', { dashArray: ['-1px', '2px'], lineCap: 'round' }),
			]),
		).toThrow('dashArray');
		expect(() =>
			cssVariablesFormat([
				token('typography', {
					fontFamily: 'Inter',
					fontSize: '-1px',
					fontWeight: 400,
					lineHeight: 1,
					letterSpacing: '-1px',
				}),
			]),
		).toThrow('fontSize');
	});

	test('preserves unknown scalars and rejects unknown composites with path, type, and shape', () => {
		const scalar: WaveToken = {
			name: 'vendor-scalar',
			path: ['vendor', 'scalar'],
			type: 'vendorType',
			value: 'kept',
			_order: 0,
		};
		expect(cssVariablesFormat([scalar])).toContain('--vendor-scalar: kept;');
		for (const value of [{ value: 8 }, [1, 2]]) {
			const token: WaveToken = {
				...scalar,
				name: 'vendor-structured',
				path: ['vendor', 'structured'],
				value,
			};
			try {
				cssVariablesFormat([token]);
				throw new Error('expected formatter to fail');
			} catch (error) {
				const message = String(error);
				expect(message).toContain('vendor.structured');
				expect(message).toContain('vendorType');
				expect(message).toContain(Array.isArray(value) ? 'array' : 'object');
				expect(message).not.toContain('[object Object]');
			}
		}
	});

	test('serializes hsl and hwb percentage components without rescaling', () => {
		const color: WaveToken = {
			name: 'color-none',
			path: ['color', 'none'],
			type: 'color',
			value: { colorSpace: 'hsl', components: ['none', 50, 25], alpha: 0.5 },
			_targetColorSpace: 'hex',
			_order: 0,
		};
		const hwb: WaveToken = {
			...color,
			name: 'color-hwb',
			path: ['color', 'hwb'],
			value: { colorSpace: 'hwb', components: [120, 10, 'none'] },
			_order: 1,
		};
		const out = cssVariablesFormat([color, hwb]);
		expect(out).toContain('--color-none: hsl(none 50% 25% / 0.5);');
		expect(out).toContain('--color-hwb: hwb(120 10% none);');
		try {
			cssVariablesFormat([
				{ ...color, value: { colorSpace: 'hsl', components: ['none', 0.5] } },
			]);
			throw new Error('expected formatter to fail');
		} catch (error) {
			const message = String(error);
			expect(message).toContain('color.none');
			expect(message).toContain('platform=css');
			expect(message).toContain('hex');
			expect(message).toContain('three components');
		}
	});

	test('contextualizes fontFamily and dash platform errors', () => {
		const assertContext = (
			token: WaveToken,
			expectedShape: 'string' | 'array' | 'object',
		): void => {
			try {
				cssVariablesFormat([token]);
				throw new Error('expected formatter to fail');
			} catch (error) {
				const message = String(error);
				expect(message).toContain(token.path.join('.'));
				expect(message).toContain(token.type ?? 'unknown');
				expect(message).toContain(`shape ${expectedShape}`);
			}
		};

		assertContext(
			{
				name: 'family-empty',
				path: ['family', 'empty'],
				type: 'fontFamily',
				value: '',
				_order: 0,
			},
			'string',
		);
		assertContext(
			{
				name: 'family-empty-array',
				path: ['family', 'empty-array'],
				type: 'fontFamily',
				value: [],
				_order: 0,
			},
			'array',
		);
		for (const fontFamily of ['', []]) {
			assertContext(
				{
					name: 'font-empty',
					path: ['font', 'empty'],
					type: 'typography',
					value: {
						fontFamily,
						fontSize: '16px',
						fontWeight: 400,
						lineHeight: 1.5,
						letterSpacing: '0px',
					},
					_order: 0,
				},
				'object',
			);
		}
		for (const dashArray of [
			['-1px', '2px'],
			['0px', 0],
		]) {
			assertContext(
				{
					name: 'stroke-bad',
					path: ['stroke', 'bad'],
					type: 'strokeStyle',
					value: { dashArray, lineCap: 'round' },
					_order: 0,
				},
				'object',
			);
			assertContext(
				{
					name: 'border-bad',
					path: ['border', 'bad'],
					type: 'border',
					value: {
						color: '#000000',
						width: '1px',
						style: { dashArray, lineCap: 'round' },
					},
					_order: 0,
				},
				'object',
			);
		}
	});

	test('preflights strokeStyle and border line-cap companion collisions', () => {
		const structured = (type: 'strokeStyle' | 'border'): WaveToken => ({
			name: `${type}-main`,
			path: [type, 'main'],
			type,
			value:
				type === 'strokeStyle'
					? { dashArray: ['4px', '8px'], lineCap: 'round' }
					: {
							color: '#000',
							width: '1px',
							style: { dashArray: ['4px', '8px'], lineCap: 'round' },
						},
			_order: 0,
		});
		for (const type of ['strokeStyle', 'border'] as const) {
			const source = structured(type);
			const collision: WaveToken = {
				name: `${type}-main-line-cap`,
				path: [type, 'main', 'line-cap'],
				type: 'string',
				value: 'square',
				_order: 1,
			};
			expect(() => cssVariablesFormat([source, collision])).toThrow(
				`--${type}-main-line-cap`,
			);
		}
	});
});
