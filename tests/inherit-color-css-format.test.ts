import { describe, expect, test } from 'bun:test';
import { cssVariablesFormat } from '../src/core/generator/formats/css.ts';
import type { WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

describe('inheritColor CSS Format', () => {
	test('should output currentColor for inheritColor: true', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#0066cc',
				type: 'color',
				inheritColor: true,
			}),
		];

		const result = cssVariablesFormat(tokens);
		expect(result).toContain('currentColor');
		expect(result).not.toContain('color-mix');
	});

	test('should output color-mix for inheritColor with opacity', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#0066cc',
				type: 'color',
				inheritColor: true,
				inheritColorOpacity: 0.12,
			}),
		];

		const result = cssVariablesFormat(tokens);
		expect(result).toContain(
			'color-mix(in srgb, currentColor 12%, transparent)',
		);
	});

	test('should output color-mix with correct percentage for different opacity values', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-semi',
				path: ['theme', 'color', 'semi'],
				value: '#cc0000',
				type: 'color',
				inheritColor: true,
				inheritColorOpacity: 0.5,
			}),
		];

		const result = cssVariablesFormat(tokens);
		expect(result).toContain(
			'color-mix(in srgb, currentColor 50%, transparent)',
		);
	});

	test('should still support legacy currentColorOpacity', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-legacy',
				path: ['theme', 'color', 'legacy'],
				value: '#0066cc',
				type: 'color',
				currentColorOpacity: 0.3,
			}),
		];

		const result = cssVariablesFormat(tokens);
		expect(result).toContain(
			'color-mix(in srgb, currentColor 30%, transparent)',
		);
	});

	test('should not affect non-inheritColor tokens', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-normal',
				path: ['theme', 'color', 'normal'],
				value: '#ff0000',
				type: 'color',
			}),
		];

		const result = cssVariablesFormat(tokens);
		expect(result).toContain('#ff0000');
		expect(result).not.toContain('currentColor');
	});

	test('should not leak siblingSlot into CSS output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-border',
				path: ['theme', 'color', 'border'],
				value: '#cc0000',
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'label',
			}),
		];

		const result = cssVariablesFormat(tokens);
		expect(result).toContain('currentColor');
		expect(result).not.toContain('label');
		expect(result).not.toContain('siblingSlot');
	});
});
