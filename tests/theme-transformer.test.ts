import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

function findToken(tokens: WaveToken[], name: string): WaveToken {
	const t = tokens.find((tok) => tok.name === name);
	if (!t) throw new Error(`token ${name} not found`);
	return t;
}

describe('theme-transformer hex to color space conversion', () => {
	test('converts hex to oklch when targetColorSpace is oklch', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'oklch');
		const value = findToken(result.tokens, 'color-primary').value as string;
		expect(value).toMatch(/^oklch\(/);
	});

	test('converts hex to srgb when targetColorSpace is srgb', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'srgb');
		const value = findToken(result.tokens, 'color-primary').value as string;
		expect(value).toMatch(/^rgb\(/);
	});

	test('converts hex to hsl when targetColorSpace is hsl', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hsl');
		const value = findToken(result.tokens, 'color-primary').value as string;
		expect(value).toMatch(/^hsl\(/);
	});

	test('keeps hex when targetColorSpace is hex', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		const value = findToken(result.tokens, 'color-primary').value as string;
		expect(value).toBe('#ff00ff');
	});

	test('converts hex with alpha to oklch with alpha', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: { $value: '#ff00ff80' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'oklch');
		const value = findToken(result.tokens, 'color-primary').value as string;
		expect(value).toMatch(/\/ 0\.\d+\)$/);
	});

	test('converts black hex to oklch without NaN', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				blackPoint: { $value: '#000000' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'oklch');
		const value = findToken(result.tokens, 'color-blackpoint').value as string;
		expect(value).not.toContain('NaN');
		expect(value).toBe('oklch(0% 0 0)');
	});

	test('converts white hex to hsl without NaN', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				whitePoint: { $value: '#ffffff' },
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hsl');
		const value = findToken(result.tokens, 'color-whitepoint').value as string;
		expect(value).not.toContain('NaN');
		expect(value).toBe('hsl(0 0% 100%)');
	});
});
