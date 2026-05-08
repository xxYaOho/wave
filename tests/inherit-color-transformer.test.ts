import { describe, expect, test } from 'bun:test';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

function findToken(
	tokens: WaveToken[],
	name: string,
): WaveToken | undefined {
	return tokens.find((t) => t.name === name);
}

describe('inheritColor Transformer', () => {
	describe('Boolean form: inheritColor: true', () => {
		test('should set inheritColor flag on color token', () => {
			const resolved: ResolvedTokenGroup = {
				theme: {
					color: {
						primary: {
							$value: '#0066cc',
							$type: 'color',
							$extensions: {
								inheritColor: true,
							},
						},
					},
				},
			};

			const result = transformToWaveTokens(resolved);
			const token = findToken(result.tokens, 'theme-color-primary')!;

			expect(token.inheritColor).toBe(true);
			expect(token.value).toBe('#0066cc');
		});
	});

	describe('Object form with opacity', () => {
		test('should extract opacity number', () => {
			const resolved: ResolvedTokenGroup = {
				theme: {
					color: {
						primary: {
							$value: '#0066cc',
							$type: 'color',
							$extensions: {
								inheritColor: {
									property: {
										opacity: 0.5,
									},
								},
							},
						},
					},
				},
			};

			const result = transformToWaveTokens(resolved);
			const token = findToken(result.tokens, 'theme-color-primary')!;

			expect(token.inheritColor).toBe(true);
			expect(token.inheritColorOpacity).toBe(0.5);
			expect(token.value).toEqual({ opacity: 0.5, _color: '#0066cc' });
		});

		test('should extract resolved opacity from object', () => {
			const resolved: ResolvedTokenGroup = {
				theme: {
					color: {
						primary: {
							$value: '#0066cc',
							$type: 'color',
							$extensions: {
								inheritColor: {
									property: {
										opacity: { $value: 0.75 },
									},
								},
							},
						},
					},
				},
			};

			const result = transformToWaveTokens(resolved);
			const token = findToken(result.tokens, 'theme-color-primary')!;

			expect(token.inheritColorOpacity).toBe(0.75);
		});
	});

	describe('Object form with siblingSlot', () => {
		test('should extract siblingSlot for Sketch', () => {
			const resolved: ResolvedTokenGroup = {
				theme: {
					color: {
						border: {
							$value: '#cc0000',
							$type: 'color',
							$extensions: {
								inheritColor: {
									siblingSlot: 'label',
								},
							},
						},
					},
				},
			};

			const result = transformToWaveTokens(resolved);
			const token = findToken(result.tokens, 'theme-color-border')!;

			expect(token.inheritColor).toBe(true);
			expect(token.inheritColorSiblingSlot).toBe('label');
		});

		test('should handle both opacity and siblingSlot', () => {
			const resolved: ResolvedTokenGroup = {
				theme: {
					color: {
						border: {
							$value: '#cc0000',
							$type: 'color',
							$extensions: {
								inheritColor: {
									property: {
										opacity: 0.3,
									},
									siblingSlot: 'label',
								},
							},
						},
					},
				},
			};

			const result = transformToWaveTokens(resolved);
			const token = findToken(result.tokens, 'theme-color-border')!;

			expect(token.inheritColor).toBe(true);
			expect(token.inheritColorOpacity).toBe(0.3);
			expect(token.inheritColorSiblingSlot).toBe('label');
			expect(token.value).toEqual({ opacity: 0.3, _color: '#cc0000' });
		});
	});

	describe('Legacy currentColor compatibility', () => {
		test('should still process currentColor for backward compatibility', () => {
			const resolved: ResolvedTokenGroup = {
				theme: {
					color: {
						primary: {
							$value: '#0066cc',
							$type: 'color',
							$extensions: {
								currentColor: {
									opacity: 0.5,
								},
							},
						},
					},
				},
			};

			const result = transformToWaveTokens(resolved);
			const token = findToken(result.tokens, 'theme-color-primary')!;

			expect(token.currentColorOpacity).toBe(0.5);
			expect(token.inheritColor).toBeUndefined();
		});
	});
});
