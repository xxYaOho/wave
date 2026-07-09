import { describe, expect, test } from 'bun:test';
import { cleanShadowZeroPx } from '../src/core/generator/formats/flat.ts';
import { shadowToCss } from '../src/core/generator/formats/utils.ts';

describe('css-var transform', () => {
	describe('shadowToCss', () => {
		test('adds px to numeric non-zero shadow lengths for browser CSS', () => {
			const result = shadowToCss([
				{ color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: -2 },
			]);

			expect(result).toBe('0 4px 8px -2px rgb(0 0 0 / 1)');
		});

		test('keeps zero shadow lengths unitless', () => {
			const result = shadowToCss([
				{ color: '#000000', offsetX: 0, offsetY: 0, blur: 0, spread: 0 },
			]);

			expect(result).toBe('0 0 0 0 rgb(0 0 0 / 1)');
		});

		test('preserves explicit rem shadow lengths', () => {
			const result = shadowToCss([
				{
					color: '#000000',
					offsetX: '0.5rem',
					offsetY: '1rem',
					blur: '2rem',
					spread: 0,
				},
			]);

			expect(result).toBe('0.5rem 1rem 2rem 0 rgb(0 0 0 / 1)');
		});

		test('adds px to numeric string lengths and normalizes zero px', () => {
			const result = shadowToCss([
				{
					color: '#000000',
					offsetX: '4',
					offsetY: '0px',
					blur: '2.5',
					spread: '-1',
				},
			]);

			expect(result).toBe('4px 0 2.5px -1px rgb(0 0 0 / 1)');
		});

		test('formats a single shadow object as one css shadow layer', () => {
			const result = shadowToCss({
				color: '#000000',
				offsetX: 0,
				offsetY: 1,
				blur: 2,
				spread: 0,
			});

			expect(result).toBe('0 1px 2px 0 rgb(0 0 0 / 1)');
		});

		test('formats px units while preserving rem', () => {
			const shadowValue = [
				{
					color: '#000000',
					offsetX: '0px',
					offsetY: '0rem',
					blur: '2px',
					spread: '0rem',
				},
				{ color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
			];

			const result = shadowToCss(shadowValue);

			expect(result).toContain('2px');
			expect(result).toContain('0rem');
			expect(result).toContain('0 4px 8px 0');
		});

		test('preserves non-zero rem units', () => {
			const shadowValue = [
				{
					color: '#00000080',
					offsetX: '0.5rem',
					offsetY: '1rem',
					blur: '2rem',
					spread: 0,
				},
			];

			const result = shadowToCss(shadowValue);

			expect(result).toContain('0.5rem');
			expect(result).toContain('1rem');
			expect(result).toContain('2rem');
		});

		test('converts color to rgba format', () => {
			const shadowValue = [
				{ color: '#000000cc', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
			];

			const result = shadowToCss(shadowValue);

			expect(result).toContain('rgb(0 0 0 / 0.8)');
		});

		test('handles inset flag', () => {
			const shadowValue = [
				{
					color: '#000000',
					offsetX: 0,
					offsetY: 2,
					blur: 4,
					spread: 0,
					inset: true,
				},
			];

			const result = shadowToCss(shadowValue);

			expect(result).toContain('inset');
		});

		test('joins multiple layers with comma', () => {
			const shadowValue = [
				{ color: '#000000', offsetX: 0, offsetY: 2, blur: 4, spread: 0 },
				{ color: '#000000', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
			];

			const result = shadowToCss(shadowValue);

			expect(result).toContain(', ');
		});
	});

	describe('cleanShadowZeroPx', () => {
		test('cleans all px units to numbers in shadow array', () => {
			const shadowValue = [
				{
					color: '#00000005',
					offsetX: '0px',
					offsetY: '0px',
					blur: '1px',
					spread: '0px',
				},
				{
					color: '#00000012',
					offsetX: 0,
					offsetY: '2px',
					blur: '5px',
					spread: 0,
				},
			];

			const result = cleanShadowZeroPx(shadowValue) as Array<
				Record<string, unknown>
			>;

			// 所有 px 应该被清理为数字
			expect(result[0]!.offsetX).toBe(0);
			expect(result[0]!.offsetY).toBe(0);
			expect(result[0]!.blur).toBe(1);
			expect(result[0]!.spread).toBe(0);
			// 数字 0 保持为 0
			expect(result[1]!.offsetX).toBe(0);
			expect(result[1]!.spread).toBe(0);
			// 非零 px 转为数字
			expect(result[1]!.offsetY).toBe(2);
			expect(result[1]!.blur).toBe(5);
		});

		test('preserves rem units in shadow', () => {
			const shadowValue = [
				{
					color: '#000000',
					offsetX: '0rem',
					offsetY: '1rem',
					blur: '0rem',
					spread: 0,
				},
			];

			const result = cleanShadowZeroPx(shadowValue) as Array<
				Record<string, unknown>
			>;

			// 0rem 应该被保留
			expect(result[0]!.offsetX).toBe('0rem');
			expect(result[0]!.blur).toBe('0rem');
			// 非零 rem 保持不变
			expect(result[0]!.offsetY).toBe('1rem');
		});

		test('handles non-array input', () => {
			expect(cleanShadowZeroPx('not an array')).toBe('not an array');
			expect(cleanShadowZeroPx(null)).toBe(null);
			expect(cleanShadowZeroPx({ color: '#000' })).toEqual({ color: '#000' });
		});
	});
});
