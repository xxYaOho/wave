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
		expect(gradient[0]!.color).toBe('#ff000040');
	});

	test('throws with token path when unsupported color lacks fallback', () => {
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

		expect(() => transformToWaveTokens(input, undefined, 'hex')).toThrow(
			'theme.color.bad',
		);
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
