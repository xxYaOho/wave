import { describe, expect, test } from 'bun:test';
import {
	convertColorSpace,
	isDtcgColorSpaceValue,
} from '../src/core/transformer/color-space.ts';
import type { DtcgColorSpaceValue } from '../src/types/index.ts';

describe('isDtcgColorSpaceValue', () => {
	test('returns true for valid OKLCH color space value', () => {
		const value: DtcgColorSpaceValue = {
			colorSpace: 'oklch',
			components: [0.7, 0.3, 328],
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns true for valid sRGB color space value', () => {
		const value: DtcgColorSpaceValue = {
			colorSpace: 'srgb',
			components: [1, 0, 1],
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns true for valid HSL color space value', () => {
		const value: DtcgColorSpaceValue = {
			colorSpace: 'hsl',
			components: [330, 100, 50],
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns true for value with alpha', () => {
		const value: DtcgColorSpaceValue = {
			colorSpace: 'oklch',
			components: [0.7, 0.3, 328],
			alpha: 0.5,
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns true for DTCG color with hex fallback', () => {
		const value = {
			colorSpace: 'oklch',
			components: [0.518, 0.251, 262.6],
			alpha: 1,
			hex: '#0052f5',
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns true for DTCG color with none component', () => {
		const value = {
			colorSpace: 'hsl',
			components: ['none', 0, 100],
			hex: '#ffffff',
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns true for DTCG standard space with fallback even when not computable by Wave v1', () => {
		const value = {
			colorSpace: 'display-p3',
			components: [1, 0, 1],
			hex: '#ff00ff',
		};
		expect(isDtcgColorSpaceValue(value)).toBe(true);
	});

	test('returns false for object with hex but without colorSpace and components', () => {
		expect(isDtcgColorSpaceValue({ hex: '#0052f5' })).toBe(false);
	});

	test('returns false for unsupported color space', () => {
		const value = {
			colorSpace: 'unsupported',
			components: [1, 2, 3],
		};
		expect(isDtcgColorSpaceValue(value)).toBe(false);
	});

	test('returns false for non-array components', () => {
		const value = {
			colorSpace: 'oklch',
			components: 'not-an-array',
		};
		expect(isDtcgColorSpaceValue(value)).toBe(false);
	});

	test('returns false for null', () => {
		expect(isDtcgColorSpaceValue(null)).toBe(false);
	});

	test('returns false for non-object', () => {
		expect(isDtcgColorSpaceValue('oklch')).toBe(false);
	});
});

describe('convertColorSpace', () => {
	describe('OKLCH to hex', () => {
		test('converts OKLCH to hex', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'oklch',
				components: [0.7, 0.3, 328],
				alpha: 1,
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/^#[0-9a-f]{6}$/i);
		});

		test('converts OKLCH with alpha to hex with alpha suffix', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'oklch',
				components: [0.7, 0.3, 328],
				alpha: 0.5,
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/^#[0-9a-f]{8}$/i);
		});
	});

	describe('OKLCH to oklch output', () => {
		test('outputs oklch format when target is oklch', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'oklch',
				components: [0.7, 0.3, 328],
			};
			const result = convertColorSpace(value, 'oklch');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/^oklch\(/);
			expect(result.value).not.toContain('/');
		});

		test('includes alpha in oklch output when alpha < 1', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'oklch',
				components: [0.7, 0.3, 328],
				alpha: 0.5,
			};
			const result = convertColorSpace(value, 'oklch');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/\/ 0\.5\)$/);
		});
	});

	describe('sRGB conversion', () => {
		test('converts sRGB to hex', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'srgb',
				components: [1, 0, 1],
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(true);
			expect(result.value).toBe('#ff00ff');
		});

		test('outputs sRGB format when target is srgb', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'srgb',
				components: [1, 0, 1],
			};
			const result = convertColorSpace(value, 'srgb');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/^rgb\(/);
		});

		test('includes alpha in sRGB output when alpha < 1', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'srgb',
				components: [1, 0, 1],
				alpha: 0.8,
			};
			const result = convertColorSpace(value, 'srgb');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/\/ 0\.8\)$/);
		});
	});

	describe('HSL conversion', () => {
		test('converts HSL to hex', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'hsl',
				components: [300, 100, 50],
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(true);
			expect(result.value).toBe('#ff00ff');
		});

		test('outputs HSL format when target is hsl', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'hsl',
				components: [300, 100, 50],
			};
			const result = convertColorSpace(value, 'hsl');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/^hsl\(/);
		});

		test('includes alpha in HSL output when alpha < 1', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'hsl',
				components: [300, 100, 50],
				alpha: 0.5,
			};
			const result = convertColorSpace(value, 'hsl');
			expect(result.success).toBe(true);
			expect(result.value).toMatch(/\/ 0\.5\)$/);
		});
	});

	describe('error handling', () => {
		test('returns error for wrong components length', () => {
			const value = {
				colorSpace: 'oklch' as const,
				components: [0.7, 0.3],
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(false);
			expect(result.error).toContain('components must have 3 elements');
		});

		test('returns error for non-numeric components', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'hsl',
				components: ['none', 0, 100],
				hex: '#ffffff',
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(false);
			expect(result.error).toContain(
				'components must be numeric for conversion',
			);
		});

		test('returns error for standard color space not computable by Wave v1', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'display-p3',
				components: [1, 0, 1],
				hex: '#ff00ff',
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(false);
			expect(result.error).toContain('Unsupported colorSpace: display-p3');
		});

		test('returns error for alpha out of range', () => {
			const value: DtcgColorSpaceValue = {
				colorSpace: 'oklch',
				components: [0.7, 0.3, 328],
				alpha: 1.5,
			};
			const result = convertColorSpace(value, 'hex');
			expect(result.success).toBe(false);
			expect(result.error).toContain('alpha must be between 0 and 1');
		});

		test('includes token path in error message', () => {
			const value = {
				colorSpace: 'oklch' as const,
				components: [0.7, 0.3],
			};
			const result = convertColorSpace(value, 'hex', 'theme.color.primary');
			expect(result.success).toBe(false);
			expect(result.error).toContain('theme.color.primary');
		});
	});
});
