import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

describe('transformToWaveTokens', () => {
	test('emits a flat WaveToken array with kebab name and path', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff' },
				secondary: { $value: '#00ff00' },
			},
		};

		const result = transformToWaveTokens(input);

		expect(result.tokens.length).toBe(2);

		const primary = result.tokens.find((t) => t.name === 'color-primary')!;
		expect(primary).toBeDefined();
		expect(primary.path).toEqual(['color', 'primary']);
		expect(primary.value).toBe('#ff00ff');
		expect(primary.type).toBe('color');

		const secondary = result.tokens.find((t) => t.name === 'color-secondary')!;
		expect(secondary).toBeDefined();
		expect(secondary.path).toEqual(['color', 'secondary']);
		expect(secondary.value).toBe('#00ff00');
	});

	test('inherits parent group $type when token has none', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					accent: { $value: '#ff00ff' },
				},
			},
		};

		const result = transformToWaveTokens(input);
		const accent = result.tokens.find((t) => t.name === 'theme-color-accent')!;
		expect(accent.path).toEqual(['theme', 'color', 'accent']);
		expect(accent.type).toBe('color');
	});

	test('preserves token comment / deprecated metadata from $description / $deprecated', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '#ff00ff',
					$description: 'brand primary',
					$deprecated: 'use accent instead',
				},
			},
		};

		const result = transformToWaveTokens(input);
		const primary = result.tokens.find((t) => t.name === 'color-primary')!;
		expect(primary.comment).toBe('brand primary');
		expect(primary.deprecated).toBe('use accent instead');
	});

	test('emits group descriptions in groupComments', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				$description: 'theme root group',
				color: {
					$type: 'color',
					$description: 'color palette group',
					primary: { $value: '#ff00ff' },
				},
			},
		};

		const result = transformToWaveTokens(input);
		expect(result.groupComments.theme).toBe('theme root group');
		expect(result.groupComments['theme.color']).toBe('color palette group');
	});

	test('honours targetColorSpace=oklch on color tokens', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'oklch');
		const primary = result.tokens.find((t) => t.name === 'color-primary')!;
		expect(primary.value).toMatch(/^oklch\(/);
	});

	test('assigns increasing _order to retain emit order', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				a: { $value: '#000' },
				b: { $value: '#111' },
				c: { $value: '#222' },
			},
		};

		const result = transformToWaveTokens(input);
		const orders = result.tokens.map((t) => t._order);
		expect(orders).toEqual([...orders].sort((x, y) => x - y));
	});

	test('marks composite group children with _composite path', () => {
		const input: ResolvedTokenGroup = {
			component: {
				button: {
					$extensions: { composite: true },
					fill: { $value: '#ff0000', $type: 'color' },
					radius: { $value: 8, $type: 'dimension' },
				},
			},
		};

		const result = transformToWaveTokens(input);
		const fill = result.tokens.find(
			(t) => t.name === 'component-button-fill',
		)!;
		const radius = result.tokens.find(
			(t) => t.name === 'component-button-radius',
		)!;
		expect(fill._composite).toBe('component.button');
		expect(radius._composite).toBe('component.button');
	});
});
