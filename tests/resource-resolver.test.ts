import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	CircularReferenceError as IndexedCircularReferenceError,
	UnresolvedReferenceError as IndexedUnresolvedReferenceError,
	resolveReferences as indexedResolveReferences,
} from '../src/core/resolver/index.ts';
import { loadResource } from '../src/core/resolver/resource-loader.ts';
import {
	CircularReferenceError,
	resolveReferences,
	UnresolvedReferenceError,
} from '../src/core/resolver/theme-reference.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type {
	DtcgTokenGroup,
	ReferenceDataSources,
} from '../src/types/index.ts';

const rootDir = path.resolve(__dirname, '..');

describe('generalized resolver', () => {
	test('resolves curly-brace references for arbitrary dependency namespaces', () => {
		const tree: DtcgTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '{leonardo.global.color.black}',
				},
			},
		};

		const sources: ReferenceDataSources = {
			leonardo: {
				global: {
					color: {
						$type: 'color',
						black: { $value: '#000000' },
					},
				},
			},
		};

		const result = resolveReferences(tree, sources);
		expect(
			(result.color as { primary: { $value: string } }).primary.$value,
		).toBe('#000000');
	});

	test('resolves $ref against arbitrary dependency namespaces', () => {
		const tree = {
			shadow: {
				$value: '#2b3248',
			},
			gradient: {
				$type: 'gradient',
				$value: [
					{
						color: {
							$ref: '#/leonardo/global/color/black/$value',
							alpha: 0.5,
						},
						position: 0,
					},
				],
			},
		} as unknown as DtcgTokenGroup;

		const sources: ReferenceDataSources = {
			leonardo: {
				global: {
					color: {
						black: { $value: '#000000' },
					},
				},
			},
		};

		const result = resolveReferences(
			tree as unknown as DtcgTokenGroup,
			sources,
		);
		const gradient = result.gradient as unknown as {
			$value: { color: { alpha: number; color: string }; position: number }[];
		};
		expect(gradient.$value[0]!.color.alpha).toBe(0.5);
		expect(gradient.$value[0]!.color.color).toBe('#000000');
	});

	test('resolves theme internal references', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					primary: {
						$value: '#ff00ff',
					},
					secondary: {
						$value: '{theme.color.primary}',
					},
				},
			},
		};

		const sources: ReferenceDataSources = {};

		const result = resolveReferences(tree, sources);
		expect(
			(result.theme as unknown as { color: { secondary: { $value: string } } })
				.color.secondary.$value,
		).toBe('#ff00ff');
	});

	test('throws UnresolvedReferenceError for unknown namespaces in curly-brace refs (CQ-005)', () => {
		const tree: DtcgTokenGroup = {
			color: {
				primary: {
					$value: '{unknown.global.color.primary}',
				},
			},
		};

		const sources: ReferenceDataSources = {
			leonardo: {
				global: {
					color: {
						primary: { $value: '#000000' },
					},
				},
			},
		};

		// CQ-005: Curly-brace refs with unknown namespaces should throw like $ref
		// (unified failure strategy)
		expect(() => resolveReferences(tree, sources)).toThrow(
			UnresolvedReferenceError,
		);
	});

	test('throws UnresolvedReferenceError for unknown $ref namespaces', () => {
		const tree: DtcgTokenGroup = {
			color: {
				primary: {
					$value: {
						$ref: '#/unknown/global/color/black/$value',
					},
				},
			},
		};

		const sources: ReferenceDataSources = {};

		expect(() => resolveReferences(tree, sources)).toThrow('Unresolved');
	});

	test('resolves internal $ref with custom root key', () => {
		const tree: DtcgTokenGroup = {
			'theme-1': {
				color: {
					$type: 'color',
					primary: {
						$value: '#ff00ff',
					},
					secondary: {
						$value: {
							$ref: '#/theme-1/color/primary/$value',
						},
					},
				},
			},
		};

		const sources: ReferenceDataSources = {};

		const result = resolveReferences(tree, sources);
		expect(
			(
				result['theme-1'] as unknown as {
					color: { secondary: { $value: string } };
				}
			).color.secondary.$value,
		).toBe('#ff00ff');
	});

	test('resolves curly-brace internal references with custom root key', () => {
		const tree: DtcgTokenGroup = {
			'theme-1': {
				color: {
					$type: 'color',
					primary: {
						$value: '#00ff00',
					},
					secondary: {
						$value: '{theme-1.color.primary}',
					},
				},
			},
		};

		const sources: ReferenceDataSources = {};

		const result = resolveReferences(tree, sources);
		expect(
			(
				result['theme-1'] as unknown as {
					color: { secondary: { $value: string } };
				}
			).color.secondary.$value,
		).toBe('#00ff00');
	});

	test('resolves references inside $extensions', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				gradient: {
					$type: 'gradient',
					hero: {
						$value: [
							{ color: '#ff0000', position: 0 },
							{ color: '#0000ff', position: 1 },
						],
						$extensions: {
							smoothGradient: {
								cubicBezier: '{wave.global.dimension.cubicBezier.easeInCubic}',
								step: 5,
							},
						},
					},
				},
			},
		};

		const sources: ReferenceDataSources = {
			wave: {
				global: {
					dimension: {
						cubicBezier: {
							easeInCubic: { $value: [0.32, 0, 0.67, 1] },
						},
					},
				},
			},
		};

		const result = resolveReferences(tree, sources);
		const token = result.theme as unknown as {
			gradient: {
				hero: {
					$extensions: {
						smoothGradient: {
							cubicBezier: unknown;
							step: number;
						};
					};
				};
			};
		};

		expect(token.gradient.hero.$extensions.smoothGradient.cubicBezier).toEqual([
			0.32, 0, 0.67, 1,
		]);
		expect(token.gradient.hero.$extensions.smoothGradient.step).toBe(5);
	});

	test('resolves external and internal references inside group extensions', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				dimension: {
					family: { $value: ['system-ui', 'PingFang SC'] },
				},
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: '{theme.dimension.family}',
								fontSize: '{wave.dimension.pt.14}',
							},
						},
					},
				},
			},
		};
		const result = resolveReferences(tree, {
			wave: {
				dimension: { pt: { 14: { $value: { value: 14, unit: 'pt' } } } },
			},
		});
		const extensions = (
			(result.theme as Record<string, unknown>).font as Record<string, unknown>
		).$extensions as Record<string, unknown>;
		const typography = extensions.typography as Record<string, unknown>;
		const defaults = typography.defaults as Record<string, unknown>;

		expect(defaults.fontFamily).toEqual(['system-ui', 'PingFang SC']);
		expect(defaults.fontSize).toEqual({
			value: 14,
			unit: 'pt',
		});
	});

	test('preserves a direct composite color reference after resolution', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					text: { $value: '#112233' },
				},
				font: {
					$type: 'typography',
					body: {
						$value: {
							color: '{theme.color.text}',
							fontFamily: 'Inter',
							fontSize: 14,
							fontWeight: 400,
							lineHeight: 1.5,
							letterSpacing: 0,
						},
					},
				},
			},
		};

		const result = resolveReferences(tree, {});
		const body = (
			(result.theme as Record<string, unknown>).font as Record<string, unknown>
		).body as {
			$value: { color: string };
			_colorReference?: string;
			_sketchColorReference?: string;
		};
		expect(body.$value.color).toBe('#112233');
		expect(body._colorReference).toBe('{theme.color.text}');
		expect(body._sketchColorReference).toBe('{theme.color.text}');
	});

	test('preserves Sketch color metadata only for unmodified references', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					text: { $value: '#112233' },
				},
				font: {
					$type: 'typography',
					brace: {
						$value: { color: '{theme.color.text}' },
					},
					pointer: {
						$value: { color: { $ref: '#/theme/color/text' } },
					},
					pointerValue: {
						$value: { color: { $ref: '#/theme/color/text/$value' } },
					},
					alphaOverride: {
						$value: {
							color: {
								$ref: '#/theme/color/text',
								alpha: 0.5,
							},
						},
					},
				},
			},
		};

		const result = resolveReferences(tree, {});
		const font = (result.theme as Record<string, unknown>).font as Record<
			string,
			Record<string, unknown>
		>;

		expect(font.brace?._sketchColorReference).toBe('{theme.color.text}');
		expect(font.pointer?._sketchColorReference).toBe('#/theme/color/text');
		expect(font.pointerValue?._sketchColorReference).toBe(
			'#/theme/color/text/$value',
		);
		expect(font.alphaOverride?._colorReference).toBe('#/theme/color/text');
		expect(font.alphaOverride?._sketchColorReference).toBeUndefined();
	});

	test('preserves alpha from an un-suffixed pointer through transformation', () => {
		const result = resolveReferences(
			{
				theme: {
					color: { text: { $type: 'color', $value: '#112233' } },
					font: {
						body: {
							$type: 'typography',
							$value: {
								fontFamily: 'Inter',
								fontSize: 14,
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
								color: { $ref: '#/theme/color/text', alpha: 0.5 },
							},
						},
					},
				},
			},
			{},
		);
		const token = transformToWaveTokens(result).tokens.find(
			(candidate) => candidate.name === 'theme-font-body',
		);

		expect(token?._typographyColor).toBe('#11223380');
		expect(token?._colorReference).toBe('#/theme/color/text');
		expect(token?._sketchColorReference).toBeUndefined();
	});

	test('reports the full group extension path for unresolved references', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: { fontFamily: '{missing.font.family}' },
						},
					},
				},
			},
		};

		expect(() => resolveReferences(tree, {})).toThrow(
			'theme.font.$extensions.typography.defaults.fontFamily',
		);
	});

	test('rejects cyclic internal references in group extensions', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				fontA: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: {
									$ref: '#/theme/fontB/$extensions/typography/defaults/fontFamily',
								},
							},
						},
					},
				},
				fontB: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: {
									$ref: '#/theme/fontA/$extensions/typography/defaults/fontFamily',
								},
							},
						},
					},
				},
			},
		};

		expect(() => resolveReferences(tree, {})).toThrow(
			'theme.fontA.$extensions.typography.defaults.fontFamily',
		);
	});

	test('resolves references inside smoothShadow target', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					shadow: {
						$value: '#0f172b',
					},
				},
				style: {
					shadow: {
						$type: 'shadow',
						raised: {
							$value: {
								color: {
									$ref: '#/theme/color/shadow/$value',
									alpha: 0.02,
								},
								offsetX: 0,
								offsetY: '{wave.dimension.px.1}',
								blur: '{wave.dimension.px.2}',
								spread: 1,
							},
							$extensions: {
								smoothShadow: {
									cubicBezier: '{wave.dimension.cubicBezier.easeOutCubic}',
									step: 4,
									target: {
										alpha: 0.08,
										offsetX: 0,
										offsetY: '{wave.dimension.px.4}',
										blur: '{wave.dimension.px.8}',
										spread: -2,
									},
								},
							},
						},
					},
				},
			},
		};

		const sources: ReferenceDataSources = {
			wave: {
				dimension: {
					px: {
						1: { $value: { value: 1, unit: 'px' } },
						2: { $value: { value: 2, unit: 'px' } },
						4: { $value: { value: 4, unit: 'px' } },
						8: { $value: { value: 8, unit: 'px' } },
					},
					cubicBezier: {
						easeOutCubic: { $value: [0.33, 1, 0.68, 1] },
					},
				},
			},
		};

		const result = resolveReferences(tree, sources);
		const token = result.theme as unknown as {
			style: {
				shadow: {
					raised: {
						$value: {
							color: {
								color: string;
								alpha: number;
								_swatchName: string;
							};
							offsetY: { value: number; unit: string };
							blur: { value: number; unit: string };
						};
						$extensions: {
							smoothShadow: {
								cubicBezier: unknown;
								target: {
									offsetY: { value: number; unit: string };
									blur: { value: number; unit: string };
									spread: number;
								};
							};
						};
					};
				};
			};
		};

		expect(token.style.shadow.raised.$value.color).toEqual({
			color: '#0f172b',
			alpha: 0.02,
			_swatchName: 'color/shadow',
		});
		expect(token.style.shadow.raised.$value.offsetY).toEqual({
			value: 1,
			unit: 'px',
		});
		expect(
			token.style.shadow.raised.$extensions.smoothShadow.cubicBezier,
		).toEqual([0.33, 1, 0.68, 1]);
		expect(
			token.style.shadow.raised.$extensions.smoothShadow.target.offsetY,
		).toEqual({ value: 4, unit: 'px' });
		expect(
			token.style.shadow.raised.$extensions.smoothShadow.target.blur,
		).toEqual({ value: 8, unit: 'px' });
		expect(
			token.style.shadow.raised.$extensions.smoothShadow.target.spread,
		).toBe(-2);
	});

	test('resolves $ref to shadow token containing nested {value, unit} objects', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					shadow: {
						$value: '#2b3248',
					},
				},
				style: {
					shadowBase: {
						$type: 'shadow',
						$value: {
							color: { $ref: '#/theme/color/shadow/$value', alpha: 0.08 },
							offsetX: { value: 0 },
							offsetY: { value: '4px', unit: 'px' },
							blur: { value: 8 },
							spread: { value: -2 },
						},
					},
					shadowAlias: {
						$type: 'shadow',
						$value: {
							$ref: '#/theme/style/shadowBase/$value',
						},
					},
				},
			},
		};

		const sources: ReferenceDataSources = {};

		const result = resolveReferences(tree, sources);
		const alias = (
			result.theme as unknown as { style: { shadowAlias: { $value: unknown } } }
		).style.shadowAlias.$value as Record<string, unknown>;

		expect(alias.color).toEqual({
			color: '#2b3248',
			alpha: 0.08,
			_swatchName: 'color/shadow',
		});
		expect(alias.offsetX).toEqual({ value: 0 });
		expect(alias.offsetY).toEqual({ value: '4px', unit: 'px' });
		expect(alias.blur).toEqual({ value: 8 });
		expect(alias.spread).toEqual({ value: -2 });
	});

	test('resolves curly-brace reference to dimension {value, unit} inside shadow $value', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				style: {
					shadow1: {
						$type: 'shadow',
						$value: {
							color: { value: '#2b3248', alpha: 0.08 },
							offsetX: { value: 0, unit: 'px' },
							offsetY: '{wave.dimension.px.6}',
							blur: { value: 8, unit: 'px' },
							spread: { value: -2, unit: 'px' },
						},
					},
				},
			},
		};

		const sources: ReferenceDataSources = {
			wave: {
				dimension: {
					px: {
						6: {
							$type: 'dimension',
							$value: { value: 12, unit: 'px' },
						},
					},
				},
			},
		};

		const result = resolveReferences(tree, sources);
		const shadow = (
			result.theme as unknown as {
				style: { shadow1: { $value: Record<string, unknown> } };
			}
		).style.shadow1.$value;

		expect(shadow.offsetY).toEqual({ value: 12, unit: 'px' });
	});

	test('resolves external references before multi-pass internal references', () => {
		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					source: {
						$value: '{brand.palette.primary}',
					},
					alias: {
						$value: '{theme.color.source}',
					},
					nestedAlias: {
						$value: {
							color: '{theme.color.alias}',
							alpha: 0.4,
						},
					},
				},
			},
		};

		const sources: ReferenceDataSources = {
			brand: {
				palette: {
					primary: { $value: '#1267ff' },
				},
			},
		};

		const result = resolveReferences(tree, sources);
		const color = (
			result.theme as unknown as {
				color: {
					source: { $value: string };
					alias: { $value: string };
					nestedAlias: { $value: { color: string; alpha: number } };
				};
			}
		).color;

		expect(color.source.$value).toBe('#1267ff');
		expect(color.alias.$value).toBe('#1267ff');
		expect(color.nestedAlias.$value).toEqual({
			color: '#1267ff',
			alpha: 0.4,
		});
	});

	test('keeps public resolver barrel error identity aligned with theme-reference', () => {
		expect(indexedResolveReferences).toBe(resolveReferences);
		expect(IndexedCircularReferenceError).toBe(CircularReferenceError);
		expect(IndexedUnresolvedReferenceError).toBe(UnresolvedReferenceError);

		const tree: DtcgTokenGroup = {
			theme: {
				color: {
					primary: {
						$value: '{missing.color.primary}',
					},
				},
			},
		};

		let thrown: unknown;
		try {
			indexedResolveReferences(tree, {});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(UnresolvedReferenceError);
		expect(thrown).toBeInstanceOf(IndexedUnresolvedReferenceError);
	});
});

describe('dependency to dependency reference detection', () => {
	test('rejects dependency file containing cross-dependency curly-brace reference', async () => {
		const tempDir = path.join(rootDir, '.temp-test-cross-curly');
		await fs.mkdir(tempDir, { recursive: true });

		const filePath = path.join(tempDir, 'bad.yaml');
		// This resource exposes namespace 'self' but references 'other'
		await fs.writeFile(
			filePath,
			'self:\n  global:\n    color:\n      $type: color\n      bad:\n        $value: "{other.global.color.red}"\n',
		);

		const result = await loadResource('custom', filePath, tempDir);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Cross-dependency reference');
		}

		await fs.rm(tempDir, { recursive: true, force: true });
	});

	test('rejects dependency file containing cross-dependency $ref', async () => {
		const tempDir = path.join(rootDir, '.temp-test-cross-ref');
		await fs.mkdir(tempDir, { recursive: true });

		const filePath = path.join(tempDir, 'bad.yaml');
		await fs.writeFile(
			filePath,
			'self:\n  global:\n    color:\n      $type: color\n      bad:\n        $value:\n          $ref: "#/other/global/color/red/$value"\n',
		);

		const result = await loadResource('custom', filePath, tempDir);
		expect('line' in result).toBe(true);
		if ('line' in result) {
			expect(result.message).toContain('Cross-dependency reference');
		}

		await fs.rm(tempDir, { recursive: true, force: true });
	});

	test('allows dependency file with self-references', async () => {
		const tempDir = path.join(rootDir, '.temp-test-self-ref');
		await fs.mkdir(tempDir, { recursive: true });

		const filePath = path.join(tempDir, 'good.yaml');
		await fs.writeFile(
			filePath,
			'self:\n  global:\n    color:\n      $type: color\n      good:\n        $value: "{self.global.color.good}"\n',
		);

		const result = await loadResource('custom', filePath, tempDir);
		expect('namespace' in result).toBe(true);
		if ('namespace' in result) {
			expect(result.namespace).toBe('self');
		}

		await fs.rm(tempDir, { recursive: true, force: true });
	});
});
