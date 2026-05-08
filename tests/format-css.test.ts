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
});
