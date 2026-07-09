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
