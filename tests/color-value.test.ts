import { describe, expect, test } from 'bun:test';
import {
	ColorValueError,
	normalizeColorValue,
	toSketchHex8,
} from '../src/core/transformer/color-value.ts';

describe('normalizeColorValue', () => {
	test('converts numeric DTCG oklch to hex', () => {
		const result = normalizeColorValue(
			{
				colorSpace: 'oklch',
				components: [0.518, 0.251, 262.6],
				hex: '#0052f5',
			},
			'hex',
			'theme.color.primary.main',
		);
		expect(result.value).toMatch(/^#[0-9a-f]{6}$/i);
		expect(result.source).toBe('dtcg-components');
	});

	test('falls back to six digit hex when components contain none', () => {
		const result = normalizeColorValue(
			{
				colorSpace: 'hsl',
				components: ['none', 0, 100],
				hex: '#ffffff',
			},
			'hex',
			'theme.color.white',
		);
		expect(result.value).toBe('#ffffff');
		expect(result.hex8).toBe('#ffffffff');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('falls back to six digit hex when components contain legacy percent strings', () => {
		const result = normalizeColorValue(
			{
				colorSpace: 'oklch',
				components: ['51.8%', 0.251, 262.6],
				hex: '#0052f5',
			},
			'hex',
			'theme.color.primary.main',
		);
		expect(result.value).toBe('#0052f5');
		expect(result.hex8).toBe('#0052f5ff');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('supports legacy color-space wrapper object with fallback color', () => {
		const result = normalizeColorValue(
			{
				oklch: {
					colorSpace: 'oklch',
					components: ['51.8%', 0.251, 262.6],
					hex: '#0052f5',
				},
			},
			'hex',
			'theme.color.primary.main',
		);
		expect(result.value).toBe('#0052f5');
		expect(result.hex8).toBe('#0052f5ff');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('supports legacy color-space wrapper object with outer alpha', () => {
		const result = normalizeColorValue(
			{
				oklch: {
					colorSpace: 'oklch',
					components: ['51.8%', 0.251, 262.6],
					hex: '#0052f5',
				},
				alpha: 0.25,
			},
			'hex',
			'theme.gradient.fallback[0].color',
		);
		expect(result.value).toBe('#0052f540');
		expect(result.hex8).toBe('#0052f540');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('supports referenced token object wrapper with DTCG $value', () => {
		const result = normalizeColorValue(
			{
				$value: {
					colorSpace: 'oklch',
					components: ['51.8%', 0.251, 262.6],
					hex: '#0052f5',
				},
				_swatchName: 'color/main-600',
			},
			'hex',
			'theme.color.primary.main',
		);
		expect(result.value).toBe('#0052f5');
		expect(result.hex8).toBe('#0052f5ff');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('rejects standalone hex object', () => {
		expect(() =>
			normalizeColorValue({ hex: '#0052f5' }, 'hex', 'theme.color.bad'),
		).toThrow(ColorValueError);
	});

	test('rejects DTCG fallback hex with alpha channel', () => {
		expect(() =>
			normalizeColorValue(
				{
					colorSpace: 'oklch',
					components: ['none', 0, 0],
					hex: '#0052f5ff',
				},
				'hex',
				'theme.color.bad',
			),
		).toThrow('DTCG color hex fallback must be #RRGGBB');
	});

	test('rejects invalid hex fallback even when numeric components are computable', () => {
		expect(() =>
			normalizeColorValue(
				{
					colorSpace: 'oklch',
					components: [0.518, 0.251, 262.6],
					hex: '#0052f5ff',
				},
				'hex',
				'theme.color.bad',
			),
		).toThrow('DTCG color hex fallback must be #RRGGBB');
	});

	test('legacy explicit alpha overrides hex alpha', () => {
		const result = normalizeColorValue(
			{ color: '#11223380', alpha: 0.25 },
			'hex',
			'theme.color.overlay',
		);
		expect(result.value).toBe('#11223340');
		expect(result.hex8).toBe('#11223340');
	});

	test('legacy object supports nested DTCG fallback color and alpha', () => {
		const result = normalizeColorValue(
			{
				color: {
					colorSpace: 'display-p3',
					components: [1, 0, 1],
					hex: '#ff00ff',
				},
				alpha: 0.5,
			},
			'hex',
			'theme.color.overlay',
		);
		expect(result.value).toBe('#ff00ff80');
		expect(result.source).toBe('dtcg-hex-fallback');
	});

	test('converts legacy hex to requested color space', () => {
		const result = normalizeColorValue('#ff00ff', 'hsl', 'theme.color.accent');
		expect(result.value).toMatch(/^hsl\(/);
		expect(result.source).toBe('legacy-string');
	});
});

describe('toSketchHex8', () => {
	test('canonicalizes legacy hex forms', () => {
		expect(toSketchHex8('#fff')).toBe('#ffffffff');
		expect(toSketchHex8('#0000')).toBe('#00000000');
		expect(toSketchHex8('#112233')).toBe('#112233ff');
		expect(toSketchHex8('#11223380')).toBe('#11223380');
	});
});
