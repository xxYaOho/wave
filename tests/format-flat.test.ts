import { describe, expect, test } from 'bun:test';
import {
	flatJsoncFormat,
	flatJsonFormat,
} from '../src/core/generator/formats/flat.ts';
import type { WaveToken } from '../src/types/index.ts';

function makeToken(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

describe('flatJsonFormat (Wave-native)', () => {
	test('emits a JSON object keyed by token name', () => {
		const tokens: WaveToken[] = [
			makeToken({ name: 'color-primary', value: '#ff0000' }),
			makeToken({ name: 'color-secondary', value: '#00ff00', _order: 1 }),
		];

		const out = flatJsonFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed['color-primary']).toBe('#ff0000');
		expect(parsed['color-secondary']).toBe('#00ff00');
	});

	test('honours filterLayer option to strip leading path segments from key', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#ff0000',
				_order: 0,
			},
		];

		const out = flatJsonFormat(tokens, { filterLayer: 1 });
		const parsed = JSON.parse(out);
		expect(parsed['color-primary']).toBe('#ff0000');
		expect(parsed['theme-color-primary']).toBeUndefined();
	});

	test('emits $COLOR_FOREGROUND placeholder for inheritColor tokens', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-primary',
				path: ['theme', 'color', 'primary'],
				value: '#0066cc',
				type: 'color',
				inheritColor: true,
				_order: 0,
			},
		];

		const out = flatJsonFormat(tokens);
		expect(out).toContain('$COLOR_FOREGROUND');
		expect(out).not.toContain('#0066cc');
	});

	test('inheritColor with opacity emits {color, opacity} object', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-semi',
				path: ['theme', 'color', 'semi'],
				value: '#cc0000',
				type: 'color',
				inheritColor: true,
				inheritColorOpacity: 0.5,
				_order: 0,
			},
		];

		const out = flatJsonFormat(tokens);
		expect(out).toContain('$COLOR_FOREGROUND');
		expect(out).toMatch(/opacity.*0\.5/);
	});

	test('inheritColor with alpha emits {color, alpha} object', () => {
		const tokens: WaveToken[] = [
			{
				name: 'theme-color-faded',
				path: ['theme', 'color', 'faded'],
				value: '#cc0000',
				type: 'color',
				inheritColor: true,
				inheritColorAlpha: 0.3,
				_order: 0,
			},
		];

		const out = flatJsonFormat(tokens);
		expect(out).toContain('$COLOR_FOREGROUND');
		expect(out).toMatch(/alpha.*0\.3/);
	});

	test('cleans 0px in shadow values to bare numbers', () => {
		const tokens: WaveToken[] = [
			{
				name: 'style-shadow-1',
				path: ['style', 'shadow-1'],
				value: [
					{
						color: '#000000',
						offsetX: '0px',
						offsetY: '2px',
						blur: '4px',
						spread: '0px',
					},
				],
				type: 'shadow',
				_order: 0,
			},
		];

		const out = flatJsonFormat(tokens);
		expect(out).not.toContain('"0px"');
		expect(out).not.toContain('"2px"');
	});

	test('groups _composite siblings into a nested object using property keys', () => {
		const tokens: WaveToken[] = [
			{
				name: 'component-button-fill',
				path: ['component', 'button', 'fill'],
				value: '#ff0000',
				type: 'color',
				_composite: 'component.button',
				_order: 0,
			},
			{
				name: 'component-button-radius',
				path: ['component', 'button', 'radius'],
				value: 8,
				type: 'dimension',
				_composite: 'component.button',
				_order: 1,
			},
		];

		const out = flatJsonFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed['component-button']).toEqual({ fill: '#ff0000', radius: 8 });
		expect(parsed['component-button-fill']).toBeUndefined();
	});
});

describe('flatJsoncFormat (Wave-native)', () => {
	test('appends inline // comment from token.comment', () => {
		const tokens: WaveToken[] = [
			{
				name: 'color-primary',
				path: ['color', 'primary'],
				value: '#ff0000',
				comment: 'brand primary',
				_order: 0,
			},
		];

		const out = flatJsoncFormat(tokens);
		expect(out).toContain('// brand primary');
		expect(out).toContain('"color-primary"');
	});
});
