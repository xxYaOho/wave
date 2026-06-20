import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

function tokenByName(
	result: ReturnType<typeof transformToWaveTokens>,
	name: string,
) {
	const token = result.tokens.find((item) => item.name === name);
	if (!token) throw new Error(`Missing token ${name}`);
	return token;
}

describe('sketch extension transformer', () => {
	test('normalizes sketch.path and sketch.property', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								sketch: {
									path: 'foundation/interaction/hover',
									property: { opacity: true },
								},
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-interaction-hover');

		expect(token._sketch).toEqual({
			path: 'foundation/interaction/hover',
			property: { opacity: true },
		});
	});

	test('ignores legacy sketchMap', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: { sketchMap: 'opacity' },
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-interaction-hover');

		expect(token._sketch).toBeUndefined();
	});

	test('normalizes sketch.property when sketchMap is also present', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					radius: {
						card: {
							$type: 'dimension',
							$value: 8,
							$extensions: {
								sketchMap: 'opacity',
								sketch: { property: { cornerRadius: true } },
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-radius-card');

		expect(token._sketch).toEqual({ property: { cornerRadius: true } });
	});
});
