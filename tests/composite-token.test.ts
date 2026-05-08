import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

describe('composite token output', () => {
	test('composite group emits flat siblings sharing the composite path', () => {
		const resolved: ResolvedTokenGroup = {
			component: {
				button: {
					outlineMax: {
						$extensions: { composite: true },
						fill: { $value: '#ffffff' },
						border: { $value: '#1d293d3d' },
						radius: { $value: '9999px' },
					},
				},
			},
		};

		const { tokens } = transformToWaveTokens(resolved);

		const fill = tokens.find(
			(t) => t.name === 'component-button-outlinemax-fill',
		);
		const border = tokens.find(
			(t) => t.name === 'component-button-outlinemax-border',
		);
		const radius = tokens.find(
			(t) => t.name === 'component-button-outlinemax-radius',
		);

		expect(fill?.value).toBe('#ffffff');
		expect(border?.value).toBe('#1d293d3d');
		expect(radius?.value).toBe('9999px');

		expect(fill?._composite).toBe('component.button.outlineMax');
		expect(border?._composite).toBe('component.button.outlineMax');
		expect(radius?._composite).toBe('component.button.outlineMax');
	});

	test('non-composite group emits flat tokens with no _composite tag', () => {
		const group: ResolvedTokenGroup = {
			primary: {
				main: { $value: '#0066cc' },
				onMain: { $value: '#ffffff' },
			},
		};

		const { tokens } = transformToWaveTokens({ theme: group });

		const main = tokens.find((t) => t.name === 'theme-primary-main');
		const onMain = tokens.find((t) => t.name === 'theme-primary-onmain');

		expect(main).toBeDefined();
		expect(onMain).toBeDefined();
		expect(main?._composite).toBeUndefined();
		expect(onMain?._composite).toBeUndefined();
	});

	test('composite and non-composite coexist', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					primary: { $value: '#0066cc' },
				},
			},
			component: {
				button: {
					outlineMax: {
						$extensions: { composite: true },
						fill: { $value: '#ffffff' },
						radius: { $value: '9999px' },
					},
				},
			},
		};

		const { tokens } = transformToWaveTokens(resolved);

		const flat = tokens.find((t) => t.name === 'theme-color-primary');
		expect(flat?._composite).toBeUndefined();

		const composite = tokens.find(
			(t) => t.name === 'component-button-outlinemax-fill',
		);
		expect(composite?._composite).toBe('component.button.outlineMax');
	});
});

describe('composite schema validation', () => {
	test('valid composite group passes validation', () => {
		const tree = {
			theme: {
				button: {
					outlineMax: {
						$extensions: { composite: true },
						fill: { $value: '#fff' },
						border: { $value: '#000' },
					},
				},
			},
		};

		const result = validateThemeSchema(tree);
		expect(result.valid).toBe(true);
	});

	test('composite group with child group is invalid', () => {
		const tree = {
			theme: {
				button: {
					outlineMax: {
						$extensions: { composite: true },
						fill: { $value: '#fff' },
						interaction: {
							hover: { $value: '#eee' },
						},
					},
				},
			},
		};

		const result = validateThemeSchema(tree);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some(
				(i) =>
					i.message.includes('composite group') &&
					i.message.includes('interaction'),
			),
		).toBe(true);
	});

	test('non-composite group with child groups is valid', () => {
		const tree = {
			theme: {
				button: {
					outline: {
						fill: { $value: '#fff' },
						interaction: {
							hover: { $value: '#eee' },
						},
					},
				},
			},
		};

		const result = validateThemeSchema(tree);
		expect(result.valid).toBe(true);
	});
});
