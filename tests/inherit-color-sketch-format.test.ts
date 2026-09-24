import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import type { SketchPayloadV2, WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
}

function assetByName(payload: SketchPayloadV2, name: string) {
	return payload.assets.find((asset) => asset.name === name);
}

describe('inheritColor Sketch Format', () => {
	test('should use siblingSlot color when found', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-interaction-interaction-danger-label',
				path: ['theme', 'style', 'interaction', 'danger', 'label'],
				value: '#cc0000',
				type: 'color',
			}),
			token({
				name: 'theme-style-interaction-interaction-danger-border',
				path: ['theme', 'style', 'interaction', 'danger', 'border'],
				value: { _color: '#ff0000' },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'label',
				_order: 1,
			}),
		];

		const result = sketchFormat(tokens, { filterLayer: 2 });
		const parsed = JSON.parse(result) as SketchPayloadV2;

		// inheritColor 派生形态归类为 color 记录。
		expect(assetByName(parsed, 'interaction-danger-border')).toEqual({
			name: 'interaction-danger-border',
			kind: 'color',
			color: '#cc0000ff',
		});
	});

	test('should fallback to diagnostic pink when sibling not found', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-interaction-interaction-danger-border',
				path: ['theme', 'style', 'interaction', 'danger', 'border'],
				value: { _color: '#ff0000' },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'nonexistent',
			}),
		];

		const result = sketchFormat(tokens, { filterLayer: 2 });
		const parsed = JSON.parse(result) as SketchPayloadV2;

		expect(assetByName(parsed, 'interaction-danger-border')).toEqual({
			name: 'interaction-danger-border',
			kind: 'color',
			color: '#ff00ffff',
		});
	});

	test('should fold inheritColor opacity into the HEX8 alpha channel', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-interaction-interaction-danger-label',
				path: ['theme', 'style', 'interaction', 'danger', 'label'],
				value: '#cc0000',
				type: 'color',
			}),
			token({
				name: 'theme-style-interaction-interaction-danger-border',
				path: ['theme', 'style', 'interaction', 'danger', 'border'],
				value: { _color: '#ff0000', opacity: 0.3 },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'label',
				inheritColorOpacity: 0.3,
				_order: 1,
			}),
		];

		const result = sketchFormat(tokens, { filterLayer: 2 });
		const parsed = JSON.parse(result) as SketchPayloadV2;

		// color 记录只有 color 字段：opacity 折入 HEX8（255 * 0.3 -> 0x4d）。
		expect(assetByName(parsed, 'interaction-danger-border')).toEqual({
			name: 'interaction-danger-border',
			kind: 'color',
			color: '#cc00004d',
		});
	});

	test('should not leak inheritColor metadata into output', () => {
		const tokens: WaveToken[] = [
			token({
				name: 'theme-style-interaction-interaction-danger-border',
				path: ['theme', 'style', 'interaction', 'danger', 'border'],
				value: { _color: '#ff0000' },
				type: 'color',
				inheritColor: true,
				inheritColorSiblingSlot: 'label',
			}),
		];

		const result = sketchFormat(tokens);

		expect(result).not.toContain('inheritColor');
		expect(result).not.toContain('siblingSlot');
	});
});
