import { describe, expect, test } from 'bun:test';
import {
	flatJsoncFormat,
	flatJsonFormat,
} from '../src/core/generator/formats/flat.ts';
import { transformToWaveTokens } from '../src/core/transformer/theme-transformer.ts';
import type { WaveToken } from '../src/types/index.ts';

function makeToken(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

function expectFlatPayload(
	tokens: WaveToken[],
	expected: Record<string, unknown>,
): void {
	expect(JSON.parse(flatJsonFormat(tokens))).toEqual(expected);
	expect(JSON.parse(flatJsoncFormat(tokens))).toEqual(expected);
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

	test('inheritColor with alpha and opacity preserves both fields', () => {
		expectFlatPayload(
			[
				makeToken({
					name: 'theme-color-overlay',
					inheritColor: true,
					inheritColorAlpha: 0.4,
					inheritColorOpacity: 0.6,
				}),
			],
			{
				'theme-color-overlay': {
					color: '$COLOR_FOREGROUND',
					alpha: 0.4,
					opacity: 0.6,
				},
			},
		);
	});

	test('preserves every standard type payload in JSON and JSONC', () => {
		const tokens: WaveToken[] = [
			makeToken({ name: 'color', type: 'color', value: '#112233' }),
			makeToken({ name: 'dimension', type: 'dimension', value: '8px' }),
			makeToken({
				name: 'font-family',
				type: 'fontFamily',
				value: ['Inter', 'sans-serif'],
			}),
			makeToken({ name: 'font-weight', type: 'fontWeight', value: 700 }),
			makeToken({ name: 'duration', type: 'duration', value: '200ms' }),
			makeToken({
				name: 'cubic-bezier',
				type: 'cubicBezier',
				value: [0.4, 0, 0.2, 1],
			}),
			makeToken({ name: 'number', type: 'number', value: 0.5 }),
			makeToken({
				name: 'stroke-style',
				type: 'strokeStyle',
				value: { dashArray: ['4px', '8px'], lineCap: 'butt' },
			}),
			makeToken({
				name: 'border',
				type: 'border',
				value: {
					color: '#000000',
					width: '1px',
					style: { dashArray: ['4px', '8px'], lineCap: 'butt' },
				},
			}),
			makeToken({
				name: 'transition',
				type: 'transition',
				value: {
					duration: '200ms',
					delay: '0ms',
					timingFunction: [0.4, 0, 0.2, 1],
				},
			}),
			makeToken({
				name: 'shadow',
				type: 'shadow',
				value: {
					color: '#00000080',
					offsetX: '0px',
					offsetY: '4px',
					blur: '8px',
					spread: '0px',
					inset: false,
				},
			}),
			makeToken({
				name: 'gradient',
				type: 'gradient',
				value: [
					{ color: '#000000', position: 0 },
					{ color: '#ffffff', position: 1 },
				],
			}),
			makeToken({
				name: 'typography',
				type: 'typography',
				value: {
					fontFamily: 'Inter',
					fontSize: '16px',
					fontWeight: 400,
					letterSpacing: '0px',
					lineHeight: 1.5,
				},
			}),
		];

		expectFlatPayload(tokens, {
			color: '#112233',
			dimension: '8px',
			'font-family': ['Inter', 'sans-serif'],
			'font-weight': 700,
			duration: '200ms',
			'cubic-bezier': [0.4, 0, 0.2, 1],
			number: 0.5,
			'stroke-style': { dashArray: ['4px', '8px'], lineCap: 'butt' },
			border: {
				color: '#000000',
				width: '1px',
				style: { dashArray: ['4px', '8px'], lineCap: 'butt' },
			},
			transition: {
				duration: '200ms',
				delay: '0ms',
				timingFunction: [0.4, 0, 0.2, 1],
			},
			shadow: {
				color: '#00000080',
				offsetX: '0px',
				offsetY: '4px',
				blur: '8px',
				spread: '0px',
				inset: false,
			},
			gradient: [
				{ color: '#000000', position: 0 },
				{ color: '#ffffff', position: 1 },
			],
			typography: {
				fontFamily: 'Inter',
				fontSize: '16px',
				fontWeight: 400,
				letterSpacing: '0px',
				lineHeight: 1.5,
			},
		});
	});

	test('preserves unknown custom object and array values exactly', () => {
		const customObject = {
			value: 8,
			unit: 'vendor-unit',
			_vendorMetadata: { source: 'plugin' },
		};
		const customArray = [customObject, 'raw', 2];

		expectFlatPayload(
			[
				makeToken({
					name: 'custom-object',
					type: 'vendorObject',
					value: customObject,
				}),
				makeToken({
					name: 'custom-array',
					type: 'vendorArray',
					value: customArray,
				}),
			],
			{
				'custom-object': customObject,
				'custom-array': customArray,
			},
		);
	});

	test('preserves dimension units in shadow arrays', () => {
		const shadow = [
			{
				color: '#00000080',
				offsetX: '0px',
				offsetY: '4px',
				blur: '8px',
				spread: '0px',
				inset: false,
			},
		];

		expectFlatPayload(
			[makeToken({ name: 'shadow-stack', type: 'shadow', value: shadow })],
			{ 'shadow-stack': shadow },
		);
	});

	test('preserves clean none colors without emitting target color metadata', () => {
		const noneColor = {
			colorSpace: 'hsl',
			components: ['none', 0, 100],
			alpha: 0.5,
		};
		const tokens: WaveToken[] = [
			makeToken({
				name: 'color-none',
				type: 'color',
				value: noneColor,
				_targetColorSpace: 'hex',
			}),
			makeToken({
				name: 'border-none',
				type: 'border',
				value: { color: noneColor, width: '1px', style: 'solid' },
				_targetColorSpace: 'hex',
			}),
		];
		const expected = {
			'color-none': noneColor,
			'border-none': { color: noneColor, width: '1px', style: 'solid' },
		};

		expectFlatPayload(tokens, expected);
		expect(flatJsonFormat(tokens)).not.toContain('_targetColorSpace');
		expect(flatJsoncFormat(tokens)).not.toContain('_targetColorSpace');
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
				value: '8px',
				type: 'dimension',
				_composite: 'component.button',
				_order: 1,
			},
		];

		const out = flatJsonFormat(tokens);
		const parsed = JSON.parse(out);
		expect(parsed['component-button']).toEqual({
			fill: '#ff0000',
			radius: '8px',
		});
		expect(parsed['component-button-fill']).toBeUndefined();
	});

	test('emits materialized typography including legacy color in JSON', () => {
		const transformed = transformToWaveTokens({
			theme: {
				font: {
					$type: 'typography',
					$extensions: {
						typography: {
							defaults: {
								fontFamily: 'Inter',
								fontSize: 14,
								fontWeight: 400,
								lineHeight: 1.5,
								letterSpacing: 0,
							},
						},
					},
					body: { $value: { color: '#112233' } },
				},
			},
		}).tokens;

		const parsed = JSON.parse(flatJsonFormat(transformed));
		expect(parsed['theme-font-body']).toEqual({
			fontFamily: 'Inter',
			fontSize: '14px',
			fontWeight: 400,
			lineHeight: 1.5,
			letterSpacing: '0px',
			color: '#112233',
		});
		const jsonc = flatJsoncFormat(transformed);
		expect(jsonc).toContain('"fontSize":"14px"');
		expect(jsonc).toContain('"letterSpacing":"0px"');
		expect(jsonc).toContain('"color":"#112233"');
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
