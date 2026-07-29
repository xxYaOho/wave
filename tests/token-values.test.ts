import { describe, expect, test } from 'bun:test';
import {
	formatDashArray,
	validateBorderStrokeStyle,
} from '../src/core/stroke-style.ts';
import { parseDimension } from '../src/core/token-values/dimension.ts';
import { parseDuration } from '../src/core/token-values/duration.ts';
import { normalizeFontWeight } from '../src/core/token-values/font-weight.ts';
import { normalizeStrokeStyle } from '../src/core/token-values/stroke-style.ts';
import {
	parseTypographyDimension,
	validateTypographyField,
} from '../src/core/typography-value.ts';

describe('dimension values', () => {
	test('normalizes standard and Wave shorthand dimensions', () => {
		expect(parseDimension({ value: 8, unit: 'px' })).toEqual({
			ok: true,
			value: { value: 8, unit: 'px' },
		});
		expect(parseDimension({ value: -0.25, unit: 'rem' })).toEqual({
			ok: true,
			value: { value: -0.25, unit: 'rem' },
		});
		expect(parseDimension(8, { defaultUnit: 'px' })).toEqual({
			ok: true,
			value: { value: 8, unit: 'px' },
		});
		expect(parseDimension('8', { defaultUnit: 'px' })).toEqual({
			ok: true,
			value: { value: 8, unit: 'px' },
		});
		for (const unit of ['px', 'rem', 'pt', 'em', '%'] as const) {
			expect(parseDimension(`-1.5${unit}`)).toEqual({
				ok: true,
				value: { value: -1.5, unit },
			});
		}
	});

	test('rejects invalid units, malformed values, and non-finite numbers', () => {
		for (const value of [
			{ value: 8, unit: 's' },
			'1e2',
			Number.NaN,
			Number.POSITIVE_INFINITY,
		]) {
			expect(parseDimension(value).ok).toBe(false);
		}
	});
});

describe('duration values', () => {
	test('accepts only finite ms and s values', () => {
		expect(parseDuration({ value: 200, unit: 'ms' })).toEqual({
			ok: true,
			value: { value: 200, unit: 'ms' },
		});
		expect(parseDuration({ value: -0.1, unit: 's' })).toEqual({
			ok: true,
			value: { value: -0.1, unit: 's' },
		});
		expect(parseDuration({ value: 200, unit: 'px' }).ok).toBe(false);
		expect(parseDuration('200ms').ok).toBe(false);
	});
});

describe('fontWeight values', () => {
	const aliases: Record<string, number> = {
		thin: 100,
		hairline: 100,
		'extra-light': 200,
		'ultra-light': 200,
		light: 300,
		normal: 400,
		regular: 400,
		book: 400,
		medium: 500,
		'semi-bold': 600,
		'demi-bold': 600,
		bold: 700,
		'extra-bold': 800,
		'ultra-bold': 800,
		black: 900,
		heavy: 900,
		'extra-black': 950,
		'ultra-black': 950,
	};

	test('normalizes every standard named weight', () => {
		for (const [name, weight] of Object.entries(aliases)) {
			expect(normalizeFontWeight(name)).toEqual({ ok: true, value: weight });
		}
	});

	test('accepts the numeric range and rejects numeric strings', () => {
		expect(normalizeFontWeight(1)).toEqual({ ok: true, value: 1 });
		expect(normalizeFontWeight(400.5)).toEqual({ ok: true, value: 400.5 });
		expect(normalizeFontWeight(1000)).toEqual({ ok: true, value: 1000 });
		expect(normalizeFontWeight('400').ok).toBe(false);
		for (const value of [
			0,
			1001,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			'Bold',
			'1e2',
		]) {
			expect(normalizeFontWeight(value).ok).toBe(false);
		}
	});
});

describe('strokeStyle values', () => {
	test('normalizes standard strings and structured styles', () => {
		expect(normalizeStrokeStyle('solid')).toEqual({ ok: true, value: 'solid' });
		expect(
			normalizeStrokeStyle({
				dashArray: [-1, { value: 0, unit: 'px' }, '2rem'],
				lineCap: 'butt',
			}),
		).toEqual({
			ok: true,
			value: {
				dashArray: [
					{ value: -1 },
					{ value: 0, unit: 'px' },
					{ value: 2, unit: 'rem' },
					{ value: -1 },
					{ value: 0, unit: 'px' },
					{ value: 2, unit: 'rem' },
				],
				lineCap: 'butt',
			},
		});
	});

	test('requires both closed-shape fields and a legal lineCap', () => {
		for (const value of [
			{ dashArray: [4, 8] },
			{ dashArray: [4, 8], lineCap: 'flat' },
			{ dashArray: [], lineCap: 'round' },
			{ dashArray: [4, 8], lineCap: 'round', extra: true },
		]) {
			expect(normalizeStrokeStyle(value).ok).toBe(false);
		}
	});

	test('legacy schema entry accepts lineCap, negative, and all-zero dash values', () => {
		expect(
			validateBorderStrokeStyle(
				{ dashArray: [-1, 0], lineCap: 'square' },
				'theme.border.$value.style',
				'resolved',
			),
		).toEqual([]);
	});

	test('CSS dash formatting retains its platform-level restrictions', () => {
		expect(formatDashArray([4, '8px'])).toBe('4px 8px');
		expect(() => formatDashArray([-1, 2])).toThrow('invalid member');
		expect(() => formatDashArray([0, 0])).toThrow('positive member');
	});
});

describe('typography delegates to shared value contracts', () => {
	test('keeps the Wave dimension and lineHeight dialect', () => {
		expect(parseTypographyDimension('1.5rem')).toEqual({
			value: 1.5,
			unit: 'rem',
		});
		expect(validateTypographyField('fontWeight', 'demi-bold', 'resolved')).toBe(
			undefined,
		);
		for (const field of ['fontSize', 'letterSpacing'] as const) {
			expect(validateTypographyField(field, '1em', 'resolved')).toBe(undefined);
			expect(validateTypographyField(field, '25%', 'resolved')).toBe(undefined);
		}
		expect(validateTypographyField('lineHeight', 1.5, 'resolved')).toBe(
			undefined,
		);
		expect(validateTypographyField('lineHeight', '18pt', 'resolved')).toBe(
			undefined,
		);
		expect(validateTypographyField('lineHeight', '1em', 'resolved')).toContain(
			'px, pt, or rem',
		);
		expect(validateTypographyField('lineHeight', '120%', 'resolved')).toContain(
			'px, pt, or rem',
		);
	});
});
