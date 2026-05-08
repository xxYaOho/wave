import { describe, expect, test } from 'bun:test';
import { roundTo } from '../src/core/transformer/number-format.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

function findToken(tokens: WaveToken[], name: string): WaveToken {
	const t = tokens.find((tok) => tok.name === name);
	if (!t) throw new Error(`token ${name} not found`);
	return t;
}

describe('smoothGradient transformation', () => {
	test('expands 2-stop gradient to 5 stops with linear positions', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0 },
						{ color: '#0000ff', position: 1 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 5,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const stops = findToken(result.tokens, 'gradient-smooth').value as {
			color: string;
			position: number;
		}[];

		expect(stops).toHaveLength(5);
		expect(stops[0]?.position).toBe(0);
		expect(stops[1]?.position).toBeCloseTo(0.25, 5);
		expect(stops[2]?.position).toBeCloseTo(0.5, 5);
		expect(stops[3]?.position).toBeCloseTo(0.75, 5);
		expect(stops[4]?.position).toBe(1);
	});

	test('expands 2-stop gradient to 7 stops', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0 },
						{ color: '#0000ff', position: 1 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 7,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const stops = findToken(result.tokens, 'gradient-smooth').value as {
			color: string;
			position: number;
		}[];

		expect(stops).toHaveLength(7);
		expect(stops[0]?.position).toBe(0);
		expect(stops[6]?.position).toBe(1);
		for (let i = 0; i < 7; i++) {
			expect(stops[i]?.position).toBe(roundTo(i / 6, 2));
		}
	});

	test('alpha follows the curve with clamped values', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000ff', position: 0 },
						{ color: '#0000ffff', position: 1 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 5,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const stops = findToken(result.tokens, 'gradient-smooth').value as {
			color: string;
			position: number;
		}[];

		expect(stops[0]?.color).toMatch(/^#ff0000/);
		expect(stops[4]?.color).toMatch(/^#0000ff/);

		for (const stop of stops) {
			expect(stop.color).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
		}
	});

	test('throws if stops count is not 2', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [{ color: '#ff0000', position: 0 }],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'smoothGradient requires exactly 2 stops',
		);
	});

	test('throws for invalid curve', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0 },
						{ color: '#0000ff', position: 1 },
					],
					$extensions: {
						smoothGradient: {
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
			'smoothGradient.cubicBezier must be an array of 4 numbers',
		);
	});

	test('throws for invalid steps', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0 },
						{ color: '#0000ff', position: 1 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 1,
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'smoothGradient.step must be an integer >= 2',
		);
	});

	test('$extensions is consumed and not present in token output', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0 },
						{ color: '#0000ff', position: 1 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 3,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const token = findToken(result.tokens, 'gradient-smooth');
		expect(token.value).toHaveLength(3);
		expect((token as Record<string, unknown>).$extensions).toBeUndefined();
	});

	test('scales positions within original range [0, 0.5]', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0 },
						{ color: '#0000ff', position: 0.5 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 5,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const stops = findToken(result.tokens, 'gradient-smooth').value as {
			position: number;
		}[];

		expect(stops).toHaveLength(5);
		expect(stops[0]?.position).toBe(0);
		expect(stops[1]?.position).toBe(0.13);
		expect(stops[2]?.position).toBe(0.25);
		expect(stops[3]?.position).toBe(0.38);
		expect(stops[4]?.position).toBe(0.5);
	});

	test('supports reverse position range [0.5, 0]', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [
						{ color: '#ff0000', position: 0.5 },
						{ color: '#0000ff', position: 0 },
					],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 5,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const stops = findToken(result.tokens, 'gradient-smooth').value as {
			position: number;
		}[];

		expect(stops).toHaveLength(5);
		expect(stops[0]?.position).toBe(0.5);
		expect(stops[1]?.position).toBe(0.38);
		expect(stops[2]?.position).toBe(0.25);
		expect(stops[3]?.position).toBe(0.13);
		expect(stops[4]?.position).toBe(0);
	});

	test('defaults missing position to 0 or 1', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				smooth: {
					$value: [{ color: '#ff0000' }, { color: '#0000ff', position: 0.75 }],
					$extensions: {
						smoothGradient: {
							cubicBezier: [0, 0, 1, 1],
							step: 5,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const stops = findToken(result.tokens, 'gradient-smooth').value as {
			position: number;
		}[];

		expect(stops).toHaveLength(5);
		expect(stops[0]?.position).toBe(0);
		expect(stops[4]?.position).toBe(0.75);
	});
});
