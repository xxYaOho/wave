import { describe, expect, test } from 'bun:test';
import {
	accentChromaFromProduct,
	CHROMA_EV_VALUES,
	parseNightConfigSection,
	resolveNightParams,
} from '../src/core/night/params.ts';

describe('night param resolution', () => {
	test('defaults to scene=night chroma=0.7', () => {
		const resolved = resolveNightParams({});
		expect(resolved).toEqual({
			scene: 'night',
			lightsLevel: 3,
			chroma: 0.7,
			chromaSource: 'default',
			sceneSource: 'default',
		});
	});

	test('chroma explicit beats chroma-ev and config', () => {
		const resolved = resolveNightParams(
			{ chroma: 0.85, chromaEv: 'minimal', scene: 'moon' },
			{ chroma: 0.5, chromaEv: 'low', scene: 'sunset' },
		);
		expect(resolved.scene).toBe('moon');
		expect(resolved.sceneSource).toBe('cli');
		expect(resolved.chroma).toBe(0.85);
		expect(resolved.chromaSource).toBe('cli-chroma');
		expect(resolved.lightsLevel).toBe(1);
	});

	test('chroma-ev beats config when chroma omitted', () => {
		const resolved = resolveNightParams(
			{ chromaEv: 'high' },
			{ chroma: 0.55, scene: 'candle-light' },
		);
		expect(resolved.chroma).toBe(CHROMA_EV_VALUES.high);
		expect(resolved.chromaSource).toBe('cli-chroma-ev');
		expect(resolved.scene).toBe('candle-light');
		expect(resolved.sceneSource).toBe('config');
		expect(resolved.lightsLevel).toBe(4);
	});

	test('config chroma beats config chroma-ev', () => {
		const resolved = resolveNightParams(
			{},
			{ chroma: 0.62, chromaEv: 'max', scene: 'night-light' },
		);
		expect(resolved.chroma).toBe(0.62);
		expect(resolved.chromaSource).toBe('config-chroma');
		expect(resolved.lightsLevel).toBe(2);
	});

	test('rejects invalid scene and chroma-ev', () => {
		expect(() => resolveNightParams({ scene: 'dawn' })).toThrow(/--scene/);
		expect(() => resolveNightParams({ chromaEv: 'ultra' })).toThrow(
			/--chroma-ev/,
		);
		expect(() => resolveNightParams({ chroma: 1.5 })).toThrow(/--chroma/);
	});

	test('parseNightConfigSection accepts chroma-ev alias', () => {
		expect(
			parseNightConfigSection({ scene: 'sunset', 'chroma-ev': 'minimal' }),
		).toEqual({ scene: 'sunset', chromaEv: 'minimal' });
	});

	test('accentChromaFromProduct anchors at 0.7', () => {
		const mid = accentChromaFromProduct(0.7);
		expect(mid.scale).toBeCloseTo(1.2, 5);
		expect(mid.floor).toBeCloseTo(16, 5);
		const low = accentChromaFromProduct(0.35);
		expect(low.scale).toBeLessThan(mid.scale);
		expect(low.floor).toBeLessThan(mid.floor);
	});
});
