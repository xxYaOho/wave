import { describe, expect, test } from 'bun:test';
import {
	flatJsoncFormat,
	flatJsonFormat,
} from '../src/core/generator/formats/flat.ts';
import type { WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

describe('inheritColor JSON Format', () => {
	test('should output $COLOR_FOREGROUND for inheritColor: true', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#0066cc',
				type: 'color',
				inheritColor: true,
			}),
		];

		const result = flatJsonFormat(tokens);
		expect(result).toContain('$COLOR_FOREGROUND');
		expect(result).not.toContain('#0066cc');
	});

	test('should output object with opacity for inheritColor with opacity', () => {
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

		const result = flatJsonFormat(tokens);
		expect(result).toContain('$COLOR_FOREGROUND');
		expect(result).toMatch(/opacity.*0.5/);
	});

	test('should not leak siblingSlot into JSON', () => {
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

		const result = flatJsonFormat(tokens);
		expect(result).toContain('$COLOR_FOREGROUND');
		expect(result).not.toContain('label');
		expect(result).not.toContain('siblingSlot');
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

		const result = flatJsonFormat(tokens);
		expect(result).toContain('#ff0000');
		expect(result).not.toContain('$COLOR_FOREGROUND');
	});

	test('should work with jsonc format too', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#0066cc',
				type: 'color',
				inheritColor: true,
				inheritColorOpacity: 0.3,
			}),
		];

		const result = flatJsoncFormat(tokens);
		expect(result).toContain('$COLOR_FOREGROUND');
		expect(result).toMatch(/opacity.*0.3/);
	});
});
