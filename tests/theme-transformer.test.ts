import { describe, expect, test } from 'bun:test';
import { transformToSDFormat } from '../src/core/transformer/theme-transformer.ts';
import type { ResolvedTokenGroup, SdTokenTree } from '../src/types/index.ts';

describe('theme-transformer hex to color space conversion', () => {
	test('converts hex to oklch when targetColorSpace is oklch', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '#ff00ff',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'oklch');
		const colorTree = result.tree.color as SdTokenTree;
		const primaryValue = (colorTree.primary as { value: string }).value;
		expect(primaryValue).toMatch(/^oklch\(/);
	});

	test('converts hex to srgb when targetColorSpace is srgb', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '#ff00ff',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'srgb');
		const colorTree = result.tree.color as SdTokenTree;
		const primaryValue = (colorTree.primary as { value: string }).value;
		expect(primaryValue).toMatch(/^rgb\(/);
	});

	test('converts hex to hsl when targetColorSpace is hsl', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '#ff00ff',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'hsl');
		const colorTree = result.tree.color as SdTokenTree;
		const primaryValue = (colorTree.primary as { value: string }).value;
		expect(primaryValue).toMatch(/^hsl\(/);
	});

	test('keeps hex when targetColorSpace is hex', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '#ff00ff',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'hex');
		const colorTree = result.tree.color as SdTokenTree;
		const primaryValue = (colorTree.primary as { value: string }).value;
		expect(primaryValue).toBe('#ff00ff');
	});

	test('converts hex with alpha to oklch with alpha', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				primary: {
					$value: '#ff00ff80',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'oklch');
		const colorTree = result.tree.color as SdTokenTree;
		const primaryValue = (colorTree.primary as { value: string }).value;
		expect(primaryValue).toMatch(/\/ 0\.\d+\)$/);
	});

	test('converts black hex to oklch without NaN', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				blackPoint: {
					$value: '#000000',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'oklch');
		const colorTree = result.tree.color as SdTokenTree;
		const blackPointValue = (colorTree.blackPoint as { value: string }).value;
		expect(blackPointValue).not.toContain('NaN');
		expect(blackPointValue).toBe('oklch(0% 0 0)');
	});

	test('converts white hex to hsl without NaN', () => {
		const input: ResolvedTokenGroup = {
			color: {
				$type: 'color',
				whitePoint: {
					$value: '#ffffff',
				},
			},
		};

		const result = transformToSDFormat(input, undefined, 'hsl');
		const colorTree = result.tree.color as SdTokenTree;
		const whitePointValue = (colorTree.whitePoint as { value: string }).value;
		expect(whitePointValue).not.toContain('NaN');
		expect(whitePointValue).toBe('hsl(0 0% 100%)');
	});
});
