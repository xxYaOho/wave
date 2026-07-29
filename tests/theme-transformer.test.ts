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

describe('gradient and shadow semantic materialization', () => {
	test('clamps gradient positions without mutating authored stops', () => {
		const stops = [
			{ color: '#ff0000', position: -0.25 },
			{ color: '#0000ff', position: 1.25 },
		];
		const before = structuredClone(stops);
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				clamped: { $value: stops },
			},
		};

		const { tokens } = transformToWaveTokens(input);
		expect(findToken(tokens, 'gradient-clamped').value).toEqual([
			{ color: '#ff0000', position: 0 },
			{ color: '#0000ff', position: 1 },
		]);
		expect(stops).toEqual(before);
	});

	test('materializes one stop at both endpoints and preserves object color', () => {
		const color = {
			colorSpace: 'hsl' as const,
			components: ['none' as const, 0, 100],
		};
		const stops = [{ color, position: 0.4 }];
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				single: { $value: stops },
			},
		};

		const { tokens } = transformToWaveTokens(input);
		expect(findToken(tokens, 'gradient-single').value).toEqual([
			{ color, position: 0 },
			{ color, position: 1 },
		]);
		expect(stops).toEqual([{ color, position: 0.4 }]);
	});

	test('preserves authored order and uses stable endpoint tie rules', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				unsorted: {
					$value: [
						{ color: '#600000', position: 0.6 },
						{ color: '#210000', position: 0.2 },
						{ color: '#220000', position: 0.2 },
						{ color: '#810000', position: 0.8 },
						{ color: '#820000', position: 0.8 },
					],
				},
			},
		};

		const { tokens } = transformToWaveTokens(input);
		expect(findToken(tokens, 'gradient-unsorted').value).toEqual([
			{ color: '#210000', position: 0 },
			{ color: '#600000', position: 0.6 },
			{ color: '#210000', position: 0.2 },
			{ color: '#220000', position: 0.2 },
			{ color: '#810000', position: 0.8 },
			{ color: '#820000', position: 0.8 },
			{ color: '#820000', position: 1 },
		]);
	});

	test('rejects an empty gradient with its token path', () => {
		const input: ResolvedTokenGroup = {
			gradient: {
				$type: 'gradient',
				empty: { $value: [] },
			},
		};

		expect(() => transformToWaveTokens(input)).toThrow(
			'gradient requires at least one stop at gradient.empty',
		);
	});

	test('preserves ordinary shadow inset true, false, and absence', () => {
		const layer = {
			color: '#000000',
			offsetX: 0,
			offsetY: 2,
			blur: 4,
			spread: 0,
		};
		const input: ResolvedTokenGroup = {
			shadow: {
				$type: 'shadow',
				withTrue: { $value: { ...layer, inset: true } },
				withFalse: { $value: { ...layer, inset: false } },
				without: { $value: layer },
			},
		};

		const { tokens } = transformToWaveTokens(input);
		expect(
			(findToken(tokens, 'shadow-withtrue').value as Record<string, unknown>)
				.inset,
		).toBe(true);
		expect(
			(findToken(tokens, 'shadow-withfalse').value as Record<string, unknown>)
				.inset,
		).toBe(false);
		expect(
			'inset' in
				(findToken(tokens, 'shadow-without').value as Record<string, unknown>),
		).toBe(false);
	});
});

describe('theme-transformer DTCG color fallback', () => {
	test('does not treat non-color string tokens as colors', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				content: {
					label: {
						$type: 'string',
						$value: 'Submit',
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-content-label').value).toBe(
			'Submit',
		);
	});

	test('uses DTCG hex fallback when components contain legacy percent string', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					primary: {
						main: {
							$value: {
								colorSpace: 'oklch',
								components: ['51.8%', 0.251, 262.6],
								hex: '#0052f5',
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-color-primary-main').value).toBe(
			'#0052f5',
		);
	});

	test('uses fallback from legacy color-space wrapper object', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					primary: {
						main: {
							$value: {
								oklch: {
									colorSpace: 'oklch',
									components: ['51.8%', 0.251, 262.6],
									hex: '#0052f5',
								},
							},
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-color-primary-main').value).toBe(
			'#0052f5',
		);
	});

	test('keeps legacy color object with alpha compatible', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					overlay: {
						$value: {
							color: '#112233',
							alpha: 0.25,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-color-overlay').value).toBe(
			'#11223340',
		);
	});

	test('keeps legacy theme.color object compatible without explicit color type', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					overlay: {
						$value: {
							color: {
								colorSpace: 'oklch',
								components: [0.208, 0.042, 265.755],
							},
							alpha: 0.85,
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		expect(findToken(result.tokens, 'theme-color-overlay').value).toMatch(
			/^#[0-9a-f]{8}$/i,
		);
	});

	test('uses DTCG hex fallback with alpha for shadow and gradient colors', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				style: {
					shadow: {
						$type: 'shadow',
						raised: {
							$value: [
								{
									color: {
										colorSpace: 'display-p3',
										components: [1, 0, 1],
										alpha: 0.5,
										hex: '#ff00ff',
									},
									offsetX: 0,
									offsetY: 4,
									blur: 8,
									spread: 0,
								},
							],
						},
					},
					gradient: {
						$type: 'gradient',
						accent: {
							$value: [
								{
									color: {
										colorSpace: 'hsl',
										components: ['none', 100, 50],
										alpha: 0.25,
										hex: '#ff0000',
									},
									position: 0,
								},
							],
						},
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		const shadow = findToken(result.tokens, 'theme-style-shadow-raised')
			.value as Array<Record<string, unknown>>;
		const gradient = findToken(result.tokens, 'theme-style-gradient-accent')
			.value as Array<Record<string, unknown>>;
		expect(shadow[0]!.color).toBe('#ff00ff80');
		expect(shadow[0]!.offsetX).toBe('0px');
		expect(shadow[0]!.offsetY).toBe('4px');
		expect(shadow[0]!.blur).toBe('8px');
		expect(shadow[0]!.spread).toBe('0px');
		expect(gradient[0]!.color).toBe('#ff000040');
	});

	test('uses fallback from legacy color-space wrapper inside gradient color', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				gradient: {
					$type: 'gradient',
					fallback: {
						$value: [
							{
								color: {
									oklch: {
										colorSpace: 'oklch',
										components: ['51.8%', 0.251, 262.6],
										hex: '#0052f5',
									},
									alpha: 0.25,
								},
								position: 0,
							},
						],
					},
				},
			},
		};

		const result = transformToWaveTokens(input, undefined, 'hex');
		const gradient = findToken(result.tokens, 'theme-gradient-fallback')
			.value as Array<Record<string, unknown>>;
		expect(gradient[0]!.color).toBe('#0052f540');
	});

	test('preserves unsupported standalone color and records target color space', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					bad: {
						$value: {
							colorSpace: 'display-p3',
							components: [1, 0, 1],
						},
					},
				},
			},
		};

		const { tokens } = transformToWaveTokens(input, undefined, 'hex');
		const token = findToken(tokens, 'theme-color-bad');
		expect(token.value).toEqual({
			colorSpace: 'display-p3',
			components: [1, 0, 1],
		});
		expect(token._targetColorSpace).toBe('hex');
	});

	test('preserves clean color objects in every standard composite color slot', () => {
		const noneColor = {
			colorSpace: 'hsl' as const,
			components: ['none' as const, 0, 100],
			alpha: 0.5,
			_swatchName: 'must-not-leak',
		};
		const input: ResolvedTokenGroup = {
			border: {
				$type: 'border',
				preserved: {
					$value: { color: noneColor, width: 1, style: 'solid' },
				},
			},
			shadow: {
				$type: 'shadow',
				preserved: {
					$value: {
						color: noneColor,
						offsetX: 0,
						offsetY: 1,
						blur: 2,
						spread: 0,
					},
				},
			},
			gradient: {
				$type: 'gradient',
				preserved: {
					$value: [{ color: noneColor, position: 0 }],
				},
			},
			typography: {
				$type: 'typography',
				preserved: {
					$value: {
						fontFamily: 'Inter',
						fontSize: 16,
						fontWeight: 400,
						letterSpacing: 0,
						lineHeight: 1.5,
						color: noneColor,
					},
				},
			},
		};

		const { tokens } = transformToWaveTokens(input, undefined, 'hex');
		const expectedColor = {
			colorSpace: 'hsl',
			components: ['none', 0, 100],
			alpha: 0.5,
		};
		for (const name of [
			'border-preserved',
			'shadow-preserved',
			'gradient-preserved',
			'typography-preserved',
		]) {
			expect(findToken(tokens, name)._targetColorSpace).toBe('hex');
		}
		expect(
			(findToken(tokens, 'border-preserved').value as Record<string, unknown>)
				.color,
		).toEqual(expectedColor);
		expect(
			(findToken(tokens, 'shadow-preserved').value as Record<string, unknown>)
				.color,
		).toEqual(expectedColor);
		expect(
			(
				findToken(tokens, 'gradient-preserved').value as Array<
					Record<string, unknown>
				>
			)[0]!.color,
		).toEqual(expectedColor);
		expect(
			(
				findToken(tokens, 'typography-preserved').value as Record<
					string,
					unknown
				>
			).color,
		).toEqual(expectedColor);
		expect(
			findToken(tokens, 'typography-preserved')._typographyColor,
		).toBeUndefined();
	});

	test('throws with token path for standalone hex object under color type', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				color: {
					$type: 'color',
					bad: {
						$value: {
							hex: '#0052f5',
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input, undefined, 'hex')).toThrow(
			'Unsupported color value at theme.color.bad',
		);
	});

	test('throws with token path for standalone hex object in shadow color', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				style: {
					shadow: {
						$type: 'shadow',
						bad: {
							$value: [
								{
									color: {
										hex: '#0052f5',
									},
									offsetX: 0,
									offsetY: 4,
									blur: 8,
									spread: 0,
								},
							],
						},
					},
				},
			},
		};

		expect(() => transformToWaveTokens(input, undefined, 'hex')).toThrow(
			'Unsupported color value at theme.style.shadow.bad[0].color',
		);
	});
});

describe('theme-transformer standard value normalization', () => {
	test('dispatches standalone primitive normalization by effective type', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				dimension: {
					$type: 'dimension',
					space: { $value: 8 },
				},
				duration: {
					$type: 'duration',
					fast: { $value: { value: 200, unit: 'ms' } },
				},
				weight: {
					$type: 'fontWeight',
					strong: { $value: 'demi-bold' },
				},
				stroke: {
					$type: 'strokeStyle',
					antline: {
						$value: {
							dashArray: [4, { value: 8, unit: 'px' }, '1rem'],
							lineCap: 'butt',
						},
					},
				},
				custom: {
					$type: 'vendorValue',
					structured: { $value: { value: 8, unit: 'px' } },
				},
			},
		};

		const { tokens } = transformToWaveTokens(input);
		expect(findToken(tokens, 'theme-dimension-space').value).toBe('8px');
		expect(findToken(tokens, 'theme-duration-fast').value).toBe('200ms');
		expect(findToken(tokens, 'theme-weight-strong').value).toBe(600);
		expect(findToken(tokens, 'theme-stroke-antline').value).toEqual({
			dashArray: ['4px', '8px', '1rem', '4px', '8px', '1rem'],
			lineCap: 'butt',
		});
		expect(findToken(tokens, 'theme-custom-structured').value).toEqual({
			value: 8,
			unit: 'px',
		});
	});

	test('normalizes dimension-like fields inside standard composites', () => {
		const input: ResolvedTokenGroup = {
			theme: {
				border: {
					$type: 'border',
					antline: {
						$value: {
							color: '#112233',
							width: 1,
							style: {
								dashArray: [4, '8pt', 2],
								lineCap: 'square',
							},
						},
					},
				},
				transition: {
					$type: 'transition',
					enter: {
						$value: {
							duration: { value: 0.2, unit: 's' },
							delay: { value: -50, unit: 'ms' },
							timingFunction: [0.4, 0, 0.2, 1],
						},
					},
				},
				shadow: {
					$type: 'shadow',
					raised: {
						$value: {
							color: '#00000080',
							offsetX: -1,
							offsetY: { value: 4, unit: 'px' },
							blur: '0.5rem',
							spread: 0,
							inset: true,
						},
					},
				},
				font: {
					$type: 'typography',
					body: {
						$value: {
							fontFamily: 'Inter',
							fontSize: 16,
							fontWeight: 'book',
							letterSpacing: '0.02em',
							lineHeight: 1.5,
						},
					},
					caption: {
						$value: {
							fontFamily: 'Inter',
							fontSize: '12pt',
							fontWeight: 400.5,
							letterSpacing: 0,
							lineHeight: { value: 18, unit: 'px' },
						},
					},
				},
			},
		};

		const { tokens } = transformToWaveTokens(input);
		expect(findToken(tokens, 'theme-border-antline').value).toEqual({
			color: '#112233',
			width: '1px',
			style: {
				dashArray: ['4px', '8pt', '2px', '4px', '8pt', '2px'],
				lineCap: 'square',
			},
		});
		expect(findToken(tokens, 'theme-transition-enter').value).toEqual({
			duration: '0.2s',
			delay: '-50ms',
			timingFunction: [0.4, 0, 0.2, 1],
		});
		expect(findToken(tokens, 'theme-shadow-raised').value).toEqual({
			color: '#00000080',
			offsetX: '-1px',
			offsetY: '4px',
			blur: '0.5rem',
			spread: '0px',
			inset: true,
		});
		expect(findToken(tokens, 'theme-font-body').value).toEqual({
			fontFamily: 'Inter',
			fontSize: '16px',
			fontWeight: 400,
			letterSpacing: '0.02em',
			lineHeight: 1.5,
		});
		expect(findToken(tokens, 'theme-font-caption').value).toEqual({
			fontFamily: 'Inter',
			fontSize: '12pt',
			fontWeight: 400.5,
			letterSpacing: '0px',
			lineHeight: '18px',
		});
	});
});
