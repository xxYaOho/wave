import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

function findToken(tokens: WaveToken[], name: string): WaveToken {
	const t = tokens.find((tok) => tok.name === name);
	if (!t) throw new Error(`token ${name} not found`);
	return t;
}

describe('smoothShadow transformation', () => {
	test('derives smooth shadow layers from a single layer', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000cc',
						offsetX: 0,
						offsetY: 6,
						blur: 12,
						spread: 0,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			color: string;
			offsetX: number;
			offsetY: number;
			blur: number;
			spread: number;
		}[];

		expect(layers).toHaveLength(3);
		expect(layers[2]!.offsetY).toBe(6);
		expect(layers[2]!.blur).toBe(12);
	});

	test('scales shadow properties toward zero', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: 0,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			offsetY: number;
		}[];

		expect(layers).toHaveLength(3);
		expect(layers[0]!.offsetY).toBe(Math.round(4 * (1 - 2 / 3)));
		expect(layers[1]!.offsetY).toBe(Math.round(4 * (1 - 1 / 3)));
		expect(layers[2]!.offsetY).toBe(4);
	});

	test('orders layers from small to large', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000',
						offsetX: 0,
						offsetY: 10,
						blur: 20,
						spread: 0,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 5,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			blur: number;
		}[];

		expect(layers).toHaveLength(5);
		for (let i = 1; i < 5; i++) {
			expect(layers[i]!.blur).toBeGreaterThanOrEqual(layers[i - 1]!.blur);
		}
	});

	test('excludes the implicit zero layer', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000',
						offsetX: 0,
						offsetY: 4,
						blur: 8,
						spread: 0,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			offsetY: number;
			blur: number;
		}[];

		expect(layers).toHaveLength(3);
		expect(layers.every((l) => l.offsetY !== 0 || l.blur !== 0)).toBe(true);
	});

	test('preserves inset flag across all layers', () => {
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
						inset: true,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			inset?: boolean;
		}[];

		expect(layers).toHaveLength(3);
		expect(layers[0]!.inset).toBe(true);
		expect(layers[1]!.inset).toBe(true);
		expect(layers[2]!.inset).toBe(true);
	});

	test('handles rem units with 3 decimal places', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#000000',
						offsetX: '0.5rem',
						offsetY: '1rem',
						blur: '2rem',
						spread: 0,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			offsetX: string;
			offsetY: string;
			blur: string;
			spread: number;
		}[];

		expect(layers).toHaveLength(3);
		expect(layers[2]!.offsetX).toBe('0.5rem');
		expect(layers[2]!.blur).toBe('2rem');
		expect(layers[0]!.offsetX).toMatch(/rem$/);
		expect(layers[0]!.offsetY).toMatch(/rem$/);
	});

	test('derives target shadow layers from seed to target', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#0f172b05',
						offsetX: 0,
						offsetY: 1,
						blur: 2,
						spread: 1,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 4,
							target: {
								alpha: 0.08,
								offsetX: 0,
								offsetY: 4,
								blur: 8,
								spread: -2,
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			color: string;
			offsetX: number;
			offsetY: number;
			blur: number;
			spread: number;
		}[];

		expect(layers).toEqual([
			{ color: '#0f172b05', offsetX: 0, offsetY: 1, blur: 2, spread: 1 },
			{ color: '#0f172b0a', offsetX: 0, offsetY: 2, blur: 4, spread: 0 },
			{ color: '#0f172b0f', offsetX: 0, offsetY: 3, blur: 6, spread: -1 },
			{ color: '#0f172b14', offsetX: 0, offsetY: 4, blur: 8, spread: -2 },
		]);
	});

	test('keeps target mode step count after easing and rounding', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#0f172b05',
						offsetX: 0,
						offsetY: 1,
						blur: 2,
						spread: 1,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0.33, 1, 0.68, 1],
							step: 4,
							target: {
								alpha: 0.08,
								offsetX: 0,
								offsetY: 4,
								blur: 8,
								spread: -2,
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			color: string;
			offsetY: number;
			blur: number;
			spread: number;
		}[];

		expect(layers).toEqual([
			expect.objectContaining({
				color: '#0f172b05',
				offsetY: 1,
				blur: 2,
				spread: 1,
			}),
			expect.objectContaining({
				color: '#0f172b0f',
				offsetY: 3,
				blur: 6,
				spread: -1,
			}),
			expect.objectContaining({
				color: '#0f172b14',
				offsetY: 4,
				blur: 8,
				spread: -2,
			}),
			expect.objectContaining({
				color: '#0f172b14',
				offsetY: 4,
				blur: 8,
				spread: -2,
			}),
		]);
	});

	test('filters invalid zero target layers', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#0f172b00',
						offsetX: 0,
						offsetY: 0,
						blur: 0,
						spread: 0,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 2,
							target: {
								alpha: 0.08,
								offsetX: 0,
								offsetY: 4,
								blur: 8,
								spread: -2,
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as unknown[];

		expect(layers).toHaveLength(1);
	});

	test('interpolates resolved dimension value objects in target mode', () => {
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				raised: {
					$value: {
						color: '#0f172b05',
						offsetX: 0,
						offsetY: { value: 2, unit: 'px' },
						blur: { value: 4, unit: 'px' },
						spread: 1,
					},
					$extensions: {
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 4,
							target: {
								alpha: 0.08,
								offsetX: 0,
								offsetY: { value: 6, unit: 'px' },
								blur: { value: 8, unit: 'px' },
								spread: -2,
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const layers = findToken(result.tokens, 'shadow-raised').value as {
			offsetY: string;
			blur: string;
		}[];

		expect(layers).toHaveLength(4);
		expect(layers[0]!.offsetY).toBe('2px');
		expect(layers[1]!.offsetY).toBe('3px');
		expect(layers[2]!.offsetY).toBe('5px');
		expect(layers[3]!.offsetY).toBe('6px');
		expect(layers[3]!.blur).toBe('8px');
	});

	test('throws for invalid cubicBezier', () => {
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
						smoothShadow: {
							cubicBezier: 'invalid' as unknown as [
								number,
								number,
								number,
								number,
							],
							step: 3,
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'smoothShadow.cubicBezier must be an array of 4 numbers',
		);
	});

	test('throws for step < 1', () => {
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
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 0,
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'smoothShadow.step must be an integer >= 1',
		);
	});

	test('throws for target mode step < 2', () => {
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
						smoothShadow: {
							cubicBezier: [0, 0, 1, 1],
							step: 1,
							target: {
								alpha: 0.08,
								offsetX: 0,
								offsetY: 4,
								blur: 8,
								spread: -2,
							},
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'smoothShadow.step must be an integer >= 2 when target is provided',
		);
	});
});
