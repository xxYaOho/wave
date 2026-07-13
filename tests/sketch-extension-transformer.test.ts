import { describe, expect, test } from 'bun:test';
import { parseSketchExtension } from '../src/core/transformer/sketch-extension.ts';
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
	test('parses skip-only extensions and retains explicit false', () => {
		expect(parseSketchExtension({ sketch: { skip: true } })).toEqual({
			skip: true,
		});
		expect(parseSketchExtension({ sketch: { skip: false } })).toEqual({
			skip: false,
		});
	});

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

	test('inherits group sketch.path for descendant tokens', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					$extensions: { sketch: { path: 'foundation/color' } },
					primary: { $value: '#1872f0' },
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-color-primary');

		expect(token._sketch).toEqual({ path: 'foundation/color' });
	});

	test('uses nearest group sketch.path over ancestor path', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				$extensions: { sketch: { path: 'foundation/theme' } },
				color: {
					$type: 'color',
					$extensions: { sketch: { path: 'foundation/color' } },
					primary: { $value: '#1872f0' },
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-color-primary');

		expect(token._sketch).toEqual({ path: 'foundation/color' });
	});

	test('uses token sketch.path over inherited group path', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					$extensions: { sketch: { path: 'foundation/color' } },
					primary: {
						$value: '#1872f0',
						$extensions: { sketch: { path: 'foundation/brand' } },
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-color-primary');

		expect(token._sketch).toEqual({ path: 'foundation/brand' });
	});

	test('does not inherit group sketch.property', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					$type: 'number',
					$extensions: {
						sketch: {
							path: 'foundation/interaction',
							property: { opacity: true },
						},
					},
					hover: { $value: 0.16 },
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-hover');

		expect(token._sketch).toEqual({ path: 'foundation/interaction' });
	});

	test('combines inherited sketch.path with token sketch.property', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				dimension: {
					$type: 'number',
					$extensions: { sketch: { path: 'foundation/interaction' } },
					hover: {
						$value: 0.16,
						$extensions: { sketch: { property: { opacity: true } } },
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const token = tokenByName(result, 'theme-dimension-hover');

		expect(token._sketch).toEqual({
			path: 'foundation/interaction',
			property: { opacity: true },
		});
	});

	test('applies inherited sketch.path to composite group child tokens', () => {
		const resolved: ResolvedTokenGroup = {
			component: {
				button: {
					$extensions: {
						composite: true,
						sketch: { path: 'component/button' },
					},
					fill: { $type: 'color', $value: '#1872f0' },
					radius: { $type: 'dimension', $value: 8 },
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		const fill = tokenByName(result, 'component-button-fill');
		const radius = tokenByName(result, 'component-button-radius');

		expect(fill._sketch).toEqual({ path: 'component/button' });
		expect(radius._sketch).toEqual({ path: 'component/button' });
	});

	test('inherits nearest group skip and lets tokens explicitly restore output', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						sketch: { path: 'foundation/color', skip: true },
					},
					hidden: { $value: '#111111' },
					keep: {
						$value: '#222222',
						$extensions: { sketch: { skip: false } },
					},
					brand: {
						$extensions: { sketch: { skip: false } },
						primary: { $value: '#333333' },
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		expect(tokenByName(result, 'theme-color-hidden')._sketch).toEqual({
			path: 'foundation/color',
			skip: true,
		});
		expect(tokenByName(result, 'theme-color-keep')._sketch).toEqual({
			path: 'foundation/color',
			skip: false,
		});
		expect(tokenByName(result, 'theme-color-brand-primary')._sketch).toEqual({
			path: 'foundation/color',
			skip: false,
		});
	});

	test('applies inherited sketch.skip to composite child tokens', () => {
		const resolved: ResolvedTokenGroup = {
			component: {
				button: {
					$extensions: {
						composite: true,
						sketch: { path: 'component/button', skip: true },
					},
					fill: { $type: 'color', $value: '#1872f0' },
					radius: {
						$type: 'dimension',
						$value: 8,
						$extensions: { sketch: { skip: false } },
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		expect(tokenByName(result, 'component-button-fill')._sketch).toEqual({
			path: 'component/button',
			skip: true,
		});
		expect(tokenByName(result, 'component-button-radius')._sketch).toEqual({
			path: 'component/button',
			skip: false,
		});
	});
});
