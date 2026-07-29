import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

function findToken(tokens: WaveToken[], name: string): WaveToken {
	const t = tokens.find((tok) => tok.name === name);
	if (!t) throw new Error(`token ${name} not found`);
	return t;
}

describe('smoothShadow contract', () => {
	test('derives layers from a single shadow layer with smoothShadow extension', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000cc',
						offsetX: 0,
						offsetY: 8,
						blur: 16,
						spread: 0,
					},
					$extensions: {
						smoothShadow: { cubicBezier: [0, 0, 1, 1], step: 3 },
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			color: string;
			offsetX: string;
			offsetY: string;
			blur: string;
			spread: string;
		}[];

		expect(layers).toHaveLength(3);
		expect(layers[2]!.offsetY).toBe('8px');
		expect(layers[2]!.blur).toBe('16px');
	});

	test('preserves 8-digit hex when base color already has alpha', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000cc',
						offsetX: 0,
						offsetY: 8,
						blur: 16,
						spread: 0,
					},
					$extensions: {
						smoothShadow: { cubicBezier: [0, 0, 1, 1], step: 3 },
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			color: string;
		}[];

		for (const layer of layers) {
			expect(layer.color).toHaveLength(9);
			expect(layer.color).toMatch(/^#[0-9a-f]{8}$/);
		}
	});

	test('$extensions is consumed and not present in token output', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000',
						offsetX: 0,
						offsetY: 2,
						blur: 4,
						spread: 0,
					},
					$extensions: {
						smoothShadow: { cubicBezier: [0, 0, 1, 1], step: 2 },
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const token = findToken(result.tokens, 'shadow-raised');
		expect(token.value).toHaveLength(2);
		expect(
			(token as unknown as Record<string, unknown>).$extensions,
		).toBeUndefined();
	});

	test('rejects a preserved DTCG color instead of silently using black', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				preserved: {
					$value: {
						color: { colorSpace: 'hsl', components: ['none', 0, 100] },
						offsetX: 0,
						offsetY: 2,
						blur: 4,
						spread: 0,
					},
					$extensions: {
						smoothShadow: { cubicBezier: [0, 0, 1, 1], step: 2 },
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'smoothShadow requires a convertible string color at shadow.preserved.color',
		);
	});
});
