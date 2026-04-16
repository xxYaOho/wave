import { describe, expect, test } from 'bun:test';
import { transformToSDFormat } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup } from '../src/types/index.ts';

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

			const result = transformToSDFormat(resolved);
			const tree = result.tree as Record<
				string,
				Record<string, Record<string, unknown>>
			>;
			const token = tree.theme?.color?.primary as {
				inheritColor?: boolean;
				value: unknown;
			};

			expect(token?.inheritColor).toBe(true);
			expect(token?.value).toBe('#0066cc');
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

			const result = transformToSDFormat(resolved);
			const tree = result.tree as Record<
				string,
				Record<string, Record<string, unknown>>
			>;
			const token = tree.theme?.color?.primary as {
				inheritColor?: boolean;
				inheritColorOpacity?: number;
				value: unknown;
			};

			expect(token?.inheritColor).toBe(true);
			expect(token?.inheritColorOpacity).toBe(0.5);
			expect(token?.value).toEqual({ opacity: 0.5, _color: '#0066cc' });
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

			const result = transformToSDFormat(resolved);
			const tree = result.tree as Record<
				string,
				Record<string, Record<string, unknown>>
			>;
			const token = tree.theme?.color?.primary as {
				inheritColorOpacity?: number;
			};

			expect(token?.inheritColorOpacity).toBe(0.75);
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

			const result = transformToSDFormat(resolved);
			const tree = result.tree as Record<
				string,
				Record<string, Record<string, unknown>>
			>;
			const token = tree.theme?.color?.border as {
				inheritColor?: boolean;
				inheritColorSiblingSlot?: string;
			};

			expect(token?.inheritColor).toBe(true);
			expect(token?.inheritColorSiblingSlot).toBe('label');
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

			const result = transformToSDFormat(resolved);
			const tree = result.tree as Record<
				string,
				Record<string, Record<string, unknown>>
			>;
			const token = tree.theme?.color?.border as {
				inheritColor?: boolean;
				inheritColorOpacity?: number;
				inheritColorSiblingSlot?: string;
				value: unknown;
			};

			expect(token?.inheritColor).toBe(true);
			expect(token?.inheritColorOpacity).toBe(0.3);
			expect(token?.inheritColorSiblingSlot).toBe('label');
			expect(token?.value).toEqual({ opacity: 0.3, _color: '#cc0000' });
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

			const result = transformToSDFormat(resolved);
			const tree = result.tree as Record<
				string,
				Record<string, Record<string, unknown>>
			>;
			const token = tree.theme?.color?.primary as {
				currentColorOpacity?: number;
				inheritColor?: boolean;
			};

			expect(token?.currentColorOpacity).toBe(0.5);
			expect(token?.inheritColor).toBeUndefined();
		});
	});
});
