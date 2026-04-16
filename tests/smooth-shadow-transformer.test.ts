import { describe, expect, test } from 'bun:test';
import { transformToSDFormat } from '../src/core/transformer/theme-transformer.ts';
import type {
	ResolvedTokenGroup,
	SdTokenTree,
	SdTokenValue,
} from '../src/types/index.ts';

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

		const result = transformToSDFormat(input);
		const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue)
			.value as {
			color: string;
			offsetX: number;
			offsetY: number;
			blur: number;
			spread: number;
		}[];

		expect(layers).toHaveLength(3);
		// Last layer should keep original values
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

		const result = transformToSDFormat(input);
		const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue)
			.value as {
			color: string;
			offsetX: number;
			offsetY: number;
			blur: number;
			spread: number;
		}[];

		expect(layers).toHaveLength(3);
		// With linear curve [0,0,1,1], ratios for 4 points are [0, 0.33, 0.67, 1]
		// Visible ratios after dropping zero layer: [0, 0.33, 0.67]
		// Iterate backwards -> coeffs [0.33, 0.67, 1]
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

		const result = transformToSDFormat(input);
		const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue)
			.value as {
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

		const result = transformToSDFormat(input);
		const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue)
			.value as {
			offsetY: number;
			blur: number;
		}[];

		expect(layers).toHaveLength(3);
		// Ensure no fully zero layer exists
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

		const result = transformToSDFormat(input);
		const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue)
			.value as {
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

		const result = transformToSDFormat(input);
		const layers = ((result.tree.shadow as SdTokenTree).raised as SdTokenValue)
			.value as {
			offsetX: string;
			offsetY: string;
			blur: string;
			spread: number;
		}[];

		expect(layers).toHaveLength(3);
		// Linear curve, 4 points sampled: [0, 0.33, 0.67, 1]
		// Visible ratios: [0, 0.33, 0.67]
		// Backwards coeffs: [0.33, 0.67, 1]
		expect(layers[2]!.offsetX).toBe('0.5rem');
		expect(layers[2]!.blur).toBe('2rem');
		expect(layers[0]!.offsetX).toMatch(/rem$/);
		expect(layers[0]!.offsetY).toMatch(/rem$/);
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

		expect(() => transformToSDFormat(input)).toThrow(
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

		expect(() => transformToSDFormat(input)).toThrow(
			'smoothShadow.step must be an integer >= 1',
		);
	});
});
