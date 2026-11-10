import { describe, expect, test } from 'bun:test';
import { validateThemeSchema } from '../src/core/schema/theme.ts';
import {
	getOutlineExtension,
	parseSketchExtension,
} from '../src/core/transformer/sketch-extension.ts';
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

describe('platform.sketch extension schema (M2 new form)', () => {
	test('accepts path/property/skip on tokens', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					interaction: {
						hover: {
							$type: 'number',
							$value: 0.16,
							$extensions: {
								platform: {
									sketch: {
										path: 'foundation/interaction/hover',
										property: { opacity: true },
									},
								},
							},
						},
					},
					mute: {
						$type: 'dimension',
						$value: 0,
						$extensions: {
							platform: { sketch: { skip: true } },
						},
					},
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('accepts group-level path/skip inheritance carriers', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						platform: {
							sketch: { path: 'foundation/color', skip: true },
						},
					},
					primary: { $value: '#1872f0' },
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test('rejects group-level property on platform.sketch', () => {
		const result = validateThemeSchema({
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						platform: {
							sketch: { property: { opacity: true } },
						},
					},
					primary: { $value: '#1872f0' },
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes(
					'sketch.property is only supported on token extensions',
				),
			),
		).toBe(true);
	});

	test('validates platform.sketch.outline against the border contract', () => {
		const valid = validateThemeSchema({
			theme: {
				border: {
					focus: {
						$type: 'border',
						$value: {
							color: '#000000',
							width: 1,
							style: 'solid',
						},
						$extensions: {
							platform: {
								sketch: { outline: { offset: 2 } },
							},
						},
					},
				},
			},
		});
		expect(valid.valid).toBe(true);
		expect(valid.issues).toEqual([]);

		const wrongType = validateThemeSchema({
			theme: {
				color: {
					primary: {
						$value: '#1872f0',
						$extensions: {
							platform: {
								sketch: { outline: { offset: 2 } },
							},
						},
					},
				},
			},
		});
		expect(wrongType.valid).toBe(false);
		expect(
			wrongType.issues.some((issue) =>
				issue.message.includes('outline can only be used with $type "border"'),
			),
		).toBe(true);

		const badOffset = validateThemeSchema({
			theme: {
				border: {
					focus: {
						$type: 'border',
						$value: { color: '#000000', width: 1, style: 'solid' },
						$extensions: {
							platform: {
								sketch: { outline: { offset: -1 } },
							},
						},
					},
				},
			},
		});
		expect(badOffset.valid).toBe(false);
		expect(
			badOffset.issues.some((issue) =>
				issue.message.includes(
					'outline.offset must be a non-negative finite number',
				),
			),
		).toBe(true);
	});

	test('rejects malformed platform containers and unknown sketch fields', () => {
		const nonObjectPlatform = validateThemeSchema({
			theme: {
				color: {
					primary: {
						$value: '#1872f0',
						$extensions: { platform: 'sketch' },
					},
				},
			},
		});
		expect(nonObjectPlatform.valid).toBe(false);
		expect(
			nonObjectPlatform.issues.some((issue) =>
				issue.message.includes('platform extension must be an object'),
			),
		).toBe(true);

		const unknownField = validateThemeSchema({
			theme: {
				color: {
					primary: {
						$value: '#1872f0',
						$extensions: {
							platform: { sketch: { weight: 'bold' } },
						},
					},
				},
			},
		});
		expect(unknownField.valid).toBe(false);
		expect(
			unknownField.issues.some((issue) =>
				issue.message.includes('Unknown sketch field "weight"'),
			),
		).toBe(true);

		const unknownPlatform = validateThemeSchema({
			theme: {
				color: {
					primary: {
						$value: '#1872f0',
						$extensions: { platform: { figma: {} } },
					},
				},
			},
		});
		expect(unknownPlatform.valid).toBe(true);
		expect(
			unknownPlatform.issues.some(
				(issue) =>
					issue.level === 'warning' &&
					issue.message.includes('Unknown platform extension "figma"'),
			),
		).toBe(true);
	});

	test('legacy sketch family is rejected with migration guidance (Task-5)', () => {
		const legacySketch = validateThemeSchema({
			theme: {
				dimension: {
					hover: {
						$type: 'number',
						$value: 0.5,
						$extensions: { sketch: { path: 'legacy/path' } },
					},
				},
			},
		});
		expect(legacySketch.valid).toBe(false);
		expect(
			legacySketch.issues.some(
				(issue) =>
					issue.level === 'error' &&
					issue.path.endsWith('$extensions.sketch') &&
					issue.message.includes('wave token migrate extensions'),
			),
		).toBe(true);

		const legacyOutline = validateThemeSchema({
			theme: {
				border: {
					focus: {
						$type: 'border',
						$value: { color: '#000000', width: 1, style: 'solid' },
						$extensions: { outline: { offset: 2 } },
					},
				},
			},
		});
		expect(legacyOutline.valid).toBe(false);
		expect(
			legacyOutline.issues.some(
				(issue) =>
					issue.level === 'error' &&
					issue.path.endsWith('$extensions.outline') &&
					issue.message.includes('platform.sketch.outline'),
			),
		).toBe(true);
	});

	test('legacy keys alongside platform.sketch still error (no silent merge)', () => {
		const result = validateThemeSchema({
			theme: {
				dimension: {
					hover: {
						$type: 'number',
						$value: 0.5,
						$extensions: {
							sketch: { path: 'legacy/path' },
							platform: { sketch: { path: 'platform/path' } },
						},
					},
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(
			result.issues.some((issue) =>
				issue.message.includes(
					'legacy extension "sketch" is no longer supported',
				),
			),
		).toBe(true);
	});
});

describe('platform.sketch extension parse (M2 new form)', () => {
	test('parses path/property/skip identically to the legacy form', () => {
		expect(
			parseSketchExtension({
				platform: { sketch: { path: 'a/b', skip: false } },
			}),
		).toEqual({ path: 'a/b', skip: false });
		expect(
			parseSketchExtension({
				platform: { sketch: { property: { opacity: true } } },
			}),
		).toEqual({ property: { opacity: true } });
		expect(parseSketchExtension({ platform: {} })).toBeUndefined();
	});

	test('parser is blind to legacy keys (schema rejects them instead)', () => {
		expect(
			parseSketchExtension({ sketch: { path: 'legacy/path' } }),
		).toBeUndefined();
		expect(getOutlineExtension({ outline: { offset: 1 } })).toBeUndefined();
		expect(
			parseSketchExtension({
				sketch: { path: 'legacy/path', skip: true },
				platform: { sketch: { path: 'platform/path' } },
			}),
		).toEqual({ path: 'platform/path' });
		expect(
			getOutlineExtension({
				outline: { offset: 1 },
				platform: { sketch: { outline: { offset: 2 } } },
			}),
		).toEqual({ offset: 2 });
	});

	test('transformer inherits group-level platform.sketch path and skip', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					$extensions: {
						platform: { sketch: { path: 'foundation/color' } },
					},
					primary: { $value: '#1872f0' },
				},
				font: {
					$extensions: { platform: { sketch: { skip: true } } },
					body: {
						$type: 'fontFamily',
						$value: 'Helvetica',
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		expect(tokenByName(result, 'theme-color-primary')._sketch).toEqual({
			path: 'foundation/color',
		});
		expect(tokenByName(result, 'theme-font-body')._sketch).toEqual({
			skip: true,
		});
	});

	test('transformer derives _outline from platform.sketch.outline', () => {
		const resolved: ResolvedTokenGroup = {
			theme: {
				border: {
					focus: {
						$type: 'border',
						$value: { color: '#000000', width: 1, style: 'solid' },
						$extensions: {
							platform: { sketch: { outline: { offset: 2 } } },
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(resolved);
		expect(tokenByName(result, 'theme-border-focus')._outline).toEqual({
			offset: 2,
		});
	});
});
