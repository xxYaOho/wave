import { describe, expect, test } from 'bun:test';
import { resolveReferences } from '../src/core/resolver/index.ts';
import { transformToWaveTokens } from '../src/core/transformer/index.ts';
import type { ResolvedTokenGroup, WaveToken } from '../src/types/index.ts';

const HEX = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const HEX_ALT = 'ffffffffffffffffffffffffffffffff';

describe('token identity through the resolver', () => {
	test('external pass rebuild keeps token $id', () => {
		const tree = {
			theme: {
				color: {
					$type: 'color',
					primary: { $value: '#0066cc', $id: HEX },
				},
			},
		};

		const { tree: resolved } = resolveReferences(tree as never, {});

		const primary = (resolved as { theme: { color: Record<string, unknown> } })
			.theme.color.primary as Record<string, unknown>;
		expect(primary.$id).toBe(HEX);
	});

	test('internal pass rebuild keeps token $id on referenced and referencing tokens', () => {
		const tree = {
			theme: {
				color: {
					$type: 'color',
					primary: { $value: '#0066cc', $id: HEX },
					alias: { $value: '{theme.color.primary}', $id: HEX_ALT },
				},
			},
		};

		const { tree: resolved } = resolveReferences(tree as never, {});

		const color = (resolved as { theme: { color: Record<string, unknown> } })
			.theme.color;
		expect((color.primary as Record<string, unknown>).$id).toBe(HEX);
		// The referencing token keeps its own identity; no silent reassignment.
		expect((color.alias as Record<string, unknown>).$id).toBe(HEX_ALT);
	});

	test('$extends expansion keeps $id on inherited tokens', () => {
		const tree = {
			theme: {
				component: {
					base: {
						$type: 'color',
						fill: { $value: '#ffffff', $id: HEX },
					},
					extended: {
						$extends: '{theme.component.base}',
						fill: { $value: '#f0f0f0', $id: HEX_ALT },
					},
				},
			},
		};

		const { tree: resolved } = resolveReferences(tree as never, {});

		const extended = (
			resolved as { theme: { component: Record<string, unknown> } }
		).theme.component.extended as Record<string, unknown>;
		expect((extended.fill as Record<string, unknown>).$id).toBe(HEX_ALT);
	});
});

describe('WaveToken identity emission', () => {
	test('non-empty $id becomes WaveToken.id; empty slots do not', () => {
		const resolved = {
			theme: {
				color: {
					$type: 'color',
					registered: { $value: '#0066cc', $id: HEX },
					slot: { $value: '#0066cc', $id: null },
					blank: { $value: '#0066cc', $id: '   ' },
					unregistered: { $value: '#0066cc' },
				},
			},
		} as never as ResolvedTokenGroup;

		const { tokens } = transformToWaveTokens(resolved);
		const byName = new Map(tokens.map((token) => [token.name, token]));

		expect(byName.get('theme-color-registered')?.id).toBe(HEX);
		expect(byName.get('theme-color-slot')?.id).toBeUndefined();
		expect(byName.get('theme-color-blank')?.id).toBeUndefined();
		expect(byName.get('theme-color-unregistered')?.id).toBeUndefined();
	});

	test('derived smoothShadow expansion follows the source token id as one record', () => {
		const resolved = {
			theme: {
				shadow: {
					$type: 'shadow',
					soft: {
						$value: {
							color: '#00000040',
							offsetX: '2px',
							offsetY: '2px',
							blur: '4px',
							spread: '0px',
						},
						$id: HEX,
						$extensions: {
							smoothShadow: { cubicBezier: [0.4, 0, 0.2, 1], step: 3 },
						},
					},
				},
			},
		} as never as ResolvedTokenGroup;

		const { tokens } = transformToWaveTokens(resolved);

		expect(tokens).toHaveLength(1);
		expect(tokens[0]?.id).toBe(HEX);
	});

	test('duplicate $id in a single pass keeps the first in document order and clears the rest', () => {
		const resolved = {
			theme: {
				color: {
					$type: 'color',
					first: { $value: '#0066cc', $id: HEX },
					second: { $value: '#0066ff', $id: HEX },
					other: { $value: '#ffffff', $id: HEX_ALT },
				},
			},
		} as never as ResolvedTokenGroup;

		const { tokens } = transformToWaveTokens(resolved);
		const byName = new Map<string, WaveToken>(
			tokens.map((token) => [token.name, token]),
		);

		expect(byName.get('theme-color-first')?.id).toBe(HEX);
		expect(byName.get('theme-color-second')?.id).toBeUndefined();
		expect(byName.get('theme-color-other')?.id).toBe(HEX_ALT);
	});
});
