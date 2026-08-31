import { describe, expect, test } from 'bun:test';
import { resolveReferences } from '../src/core/resolver/theme-reference.ts';
import { getTokenReferenceLineage } from '../src/core/transformer/reference-lineage.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { DtcgTokenGroup, ResolvedTokenGroup } from '../src/types/index.ts';

describe('transformToWaveTokens', () => {
	test('keeps internal whole and nested references in a private lineage sidecar', () => {
		const raw: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					base: { $value: '#112233' },
					alias: { $value: '{theme.color.base}' },
				},
				border: {
					$type: 'border',
					base: {
						$value: { color: '#112233', width: 1, style: 'solid' },
					},
					alias: {
						$value: {
							color: '{theme.color.base}',
							width: 1,
							style: 'solid',
						},
					},
				},
			},
		};
		const resolution = resolveReferences(raw, {});
		const withContext = transformToWaveTokens(
			resolution.tree,
			undefined,
			'hex',
			resolution,
		);

		expect(
			getTokenReferenceLineage(
				withContext.tokens.find((token) => token.name === 'theme-color-alias')!,
			),
		).toEqual([{ valuePath: [], targetPath: ['theme', 'color', 'base'] }]);
		expect(
			getTokenReferenceLineage(
				withContext.tokens.find(
					(token) => token.name === 'theme-border-alias',
				)!,
			),
		).toEqual([
			{ valuePath: ['color'], targetPath: ['theme', 'color', 'base'] },
		]);
	});

	test('inherits nearest typography default lineage and honors explicit fields', () => {
		const raw: DtcgTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: '{theme.font.family-base}',
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
							},
						},
					},
					'family-base': { $type: 'fontFamily', $value: ['Base'] },
					'family-heading': { $type: 'fontFamily', $value: ['Heading'] },
					heading: {
						$extensions: {
							typography: {
								defaults: {
									fontFamily: '{theme.font.family-heading}',
								},
							},
						},
						h1: { $value: { fontSize: 32 } },
						h2: { $value: { fontFamily: ['Literal'], fontSize: 24 } },
						h3: {
							$value: {
								fontFamily: '{theme.font.family-base}',
								fontSize: 20,
							},
						},
					},
					body: {
						$extensions: {
							typography: { defaults: { fontFamily: ['Body Literal'] } },
						},
						paragraph: { $value: { fontSize: 16 } },
					},
				},
			},
		};
		const resolution = resolveReferences(raw, {});
		const { tokens } = transformToWaveTokens(
			resolution.tree,
			undefined,
			'hex',
			resolution,
		);
		const lineage = (name: string) =>
			getTokenReferenceLineage(tokens.find((token) => token.name === name)!);

		expect(lineage('theme-font-heading-h1')).toEqual([
			{
				valuePath: ['fontFamily'],
				targetPath: ['theme', 'font', 'family-heading'],
			},
		]);
		expect(lineage('theme-font-heading-h2')).toEqual([]);
		expect(lineage('theme-font-heading-h3')).toEqual([
			{
				valuePath: ['fontFamily'],
				targetPath: ['theme', 'font', 'family-base'],
			},
		]);
		expect(lineage('theme-font-body-paragraph')).toEqual([]);
	});

	test('does not expose lineage through the public WaveToken shape', () => {
		const raw: DtcgTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					base: { $value: '#112233' },
					alias: { $value: '{theme.color.base}' },
				},
			},
		};
		const resolution = resolveReferences(raw, {});
		const plain = transformToWaveTokens(resolution.tree).tokens;
		const contextual = transformToWaveTokens(
			resolution.tree,
			undefined,
			'hex',
			resolution,
		).tokens;

		expect(contextual.map(Object.keys)).toEqual(plain.map(Object.keys));
		expect(contextual.map(Reflect.ownKeys)).toEqual(plain.map(Reflect.ownKeys));
		expect(contextual.map((token) => ({ ...token }))).toEqual(
			plain.map((token) => ({ ...token })),
		);
		expect(JSON.stringify(contextual)).toBe(JSON.stringify(plain));
		expect(contextual).toEqual(plain);
	});
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

	test('preserves outline metadata on border tokens', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				border: {
					outline: {
						focus: {
							$type: 'border',
							$value: { color: '#000000', width: 1, style: 'solid' },
							$extensions: { outline: { offset: 2 } },
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const focus = result.tokens.find(
			(t) => t.name === 'theme-border-outline-focus',
		)!;

		expect(focus.type).toBe('border');
		expect(focus._outline).toEqual({ offset: 2 });
	});

	test('normalizes border color and width value objects', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				border: {
					outline: {
						$type: 'border',
						$value: {
							color: {
								colorSpace: 'srgb',
								components: [0.145, 0.388, 0.922],
								hex: '#2563eb',
							},
							width: { value: 2, unit: 'px' },
							style: 'solid',
						},
						$extensions: { outline: { offset: 2 } },
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const border = result.tokens.find(
			(token) => token.name === 'theme-border-outline',
		);

		expect(border?.value).toEqual({
			color: '#2563eb',
			width: '2px',
			style: 'solid',
		});
		expect(border?._outline).toEqual({ offset: 2 });
	});

	test('normalizes shadow length value objects inside layer objects', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				shadow: {
					card: {
						$type: 'shadow',
						$value: {
							color: '#00000033',
							offsetX: 0,
							offsetY: { value: 4, unit: 'px' },
							blur: { value: 8, unit: 'px' },
							spread: 0,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input);
		const shadow = result.tokens.find(
			(token) => token.name === 'theme-shadow-card',
		);

		expect(shadow?.value).toEqual({
			color: '#00000033',
			offsetX: '0px',
			offsetY: '4px',
			blur: '8px',
			spread: '0px',
		});
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

	test('starts _order from zero for each transform call', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				a: { $value: '#000' },
			},
			component: {
				button: {
					$extensions: { composite: true },
					fill: { $value: '#111', $type: 'color' },
					radius: { $value: 8, $type: 'dimension' },
				},
			},
		};

		const first = transformToWaveTokens(input).tokens.map((t) => t._order);
		const second = transformToWaveTokens(input).tokens.map((t) => t._order);

		expect(first).toEqual([0, 1, 2]);
		expect(second).toEqual([0, 1, 2]);
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
		const fill = result.tokens.find((t) => t.name === 'component-button-fill')!;
		const radius = result.tokens.find(
			(t) => t.name === 'component-button-radius',
		)!;
		expect(fill._composite).toBe('component.button');
		expect(radius._composite).toBe('component.button');
	});

	test('materializes inherited typography defaults with nearest and token overrides', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: ['system-ui', 'PingFang SC'],
								fontSize: { value: 14, unit: 'pt' },
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
							},
						},
					},
					body: {
						$extensions: {
							typography: { defaults: { fontWeight: 500 } },
						},
						md: {
							$value: { fontSize: 16, color: '#112233' },
						},
					},
				},
			},
		};

		const token = transformToWaveTokens(input).tokens[0];
		expect(token?.value).toEqual({
			fontFamily: ['system-ui', 'PingFang SC'],
			fontSize: '16px',
			fontWeight: 500,
			lineHeight: 1.5,
			letterSpacing: '0px',
			color: '#112233',
		});
		expect(token?._typographyColor).toBe('#112233');
	});

	test('keeps typography color reference metadata separate from its value', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					body: {
						$value: {
							fontFamily: 'Inter',
							fontSize: 14,
							fontWeight: 400,
							lineHeight: 1.5,
							letterSpacing: 0,
							color: '#112233',
						},
						_colorReference: '{theme.color.text.emphasis}',
						_sketchColorReference: '{theme.color.text.emphasis}',
					},
				},
			},
		};

		const token = transformToWaveTokens(input).tokens[0]!;
		expect(token._colorReference).toBe('{theme.color.text.emphasis}');
		expect(token._sketchColorReference).toBe('{theme.color.text.emphasis}');
		expect(token._typographyColor).toBe('#112233');
		expect(token.value).toEqual({
			fontFamily: 'Inter',
			fontSize: '14px',
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: '0px',
			color: '#112233',
		});
	});

	test('keeps alpha from a resolved pointer wrapper without Sketch metadata', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					body: {
						$value: {
							fontFamily: 'Inter',
							fontSize: 14,
							fontWeight: 400,
							lineHeight: 1.5,
							letterSpacing: 0,
							color: { $value: '#112233', alpha: 0.5 },
						},
						_colorReference: '#/theme/color/text',
					},
				},
			},
		};

		const token = transformToWaveTokens(input).tokens[0]!;
		expect(token._typographyColor).toBe('#11223380');
		expect(token._colorReference).toBe('#/theme/color/text');
		expect(token._sketchColorReference).toBeUndefined();
	});

	test('keeps shared Sketch color metadata on border tokens', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				border: {
					$type: 'border',
					focus: {
						$value: { color: '#112233', width: 1, style: 'solid' },
						_sketchColorReference: '#/theme/color/text',
					},
				},
			},
		};

		const token = transformToWaveTokens(input).tokens[0]!;
		expect(token._sketchColorReference).toBe('#/theme/color/text');
		expect(token.value).toEqual({
			color: '#112233',
			width: '1px',
			style: 'solid',
		});
	});

	test('does not apply typography defaults to non-typography tokens', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: 'Inter',
								fontSize: 14,
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
							},
						},
					},
					count: { $type: 'number', $value: 2 },
				},
			},
		};

		expect(transformToWaveTokens(input).tokens[0]?.value).toBe(2);
	});

	test('propagates the theme.font rem baseline only to typography tokens', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							baseFontSize: 14,
							defaults: {
								fontFamily: 'Inter',
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
							},
						},
					},
					body: {
						$value: { fontSize: { value: 0.875, unit: 'rem' } },
					},
					fixed: { $value: { fontSize: 14 } },
					count: { $type: 'number', $value: 2 },
				},
			},
		};

		const first = transformToWaveTokens(input).tokens;
		expect(
			first.find((token) => token.name === 'theme-font-body'),
		).toMatchObject({ _typographyBaseFontSize: 14 });
		expect(first.find((token) => token.name === 'theme-font-count')).toEqual(
			expect.not.objectContaining({ _typographyBaseFontSize: 14 }),
		);
		expect(first.find((token) => token.name === 'theme-font-fixed')).toEqual(
			expect.not.objectContaining({ _typographyBaseFontSize: 14 }),
		);

		const second = transformToWaveTokens(input).tokens;
		expect(
			second.find((token) => token.name === 'theme-font-body'),
		).toMatchObject({ _typographyBaseFontSize: 14 });
	});

	test('resolves root typography baseline references before transformation', () => {
		for (const baseFontSize of [
			'{theme.number.base}',
			{ $ref: '#/theme/number/base/$value' },
		]) {
			const raw: DtcgTokenGroup = {
				theme: {
					number: { base: { $type: 'number', $value: 14 } },
					font: {
						$type: 'typography',
						$extensions: {
							typography: {
								baseFontSize,
								defaults: {
									fontFamily: 'Inter',
									fontWeight: 400,
									lineHeight: 1.5,
									letterSpacing: 0,
								},
							},
						},
						body: { $value: { fontSize: { value: 0.875, unit: 'rem' } } },
					},
				},
			};
			const { tree: resolved } = resolveReferences(raw, {});
			const font = (resolved.theme as Record<string, unknown>).font as Record<
				string,
				unknown
			>;
			const extensions = font.$extensions as Record<string, unknown>;
			const typography = extensions.typography as Record<string, unknown>;
			expect(typography.baseFontSize).toBe(14);
			expect(transformToWaveTokens(resolved).tokens).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: 'theme-font-body',
						_typographyBaseFontSize: 14,
					}),
				]),
			);
		}
	});

	test('throws the token path when materialized typography is incomplete', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				font: {
					$type: 'typography',
					body: {
						$value: {
							fontFamily: 'Inter',
							fontSize: 14,
							fontWeight: 400,
							lineHeight: 1.5,
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow('theme.font.body');
	});
});
