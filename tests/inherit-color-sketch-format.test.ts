import { describe, expect, test } from 'bun:test';
import { sketchFormat } from '../src/core/generator/formats/sketch.ts';
import type { WaveToken } from '../src/types/index.ts';

function token(partial: Partial<WaveToken> & { name: string }): WaveToken {
	return {
		path: partial.path ?? partial.name.split('-'),
		value: '#000000',
		_order: 0,
		...partial,
	};
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

		const result = sketchFormat(tokens);
		const parsed = JSON.parse(result);

		expect(parsed.style['interaction-danger-border'].color).toBe('#cc0000ff');
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

		const result = sketchFormat(tokens);
		const parsed = JSON.parse(result);

		expect(parsed.style['interaction-danger-border'].color).toBe('#ff00ffff');
	});

	test('should include opacity when inheritColor has opacity', () => {
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

		const result = sketchFormat(tokens);
		const parsed = JSON.parse(result);

		expect(parsed.style['interaction-danger-border'].color).toBe('#cc0000ff');
		expect(parsed.style['interaction-danger-border'].opacity).toBe(0.3);
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
