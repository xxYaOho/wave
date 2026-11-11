import { describe, expect, test } from 'bun:test';
import {
	accentMainToneFromProduct,
	LUMINANCE_EV_VALUES,
	parseNightConfigSection,
	resolveNightParams,
} from '../src/core/night/params.ts';

describe('night param resolution', () => {
	test('defaults to scene=night luminance=0.7', () => {
		const resolved = resolveNightParams({});
		expect(resolved).toEqual({
			scene: 'night',
			lightsLevel: 3,
			luminance: 0.7,
			luminanceSource: 'default',
			sceneSource: 'default',
		});
	});

	test('luminance explicit beats luminance-ev and config', () => {
		const resolved = resolveNightParams(
			{ luminance: 0.85, luminanceEv: 'minimal', scene: 'moon' },
			{ luminance: 0.5, luminanceEv: 'low', scene: 'sunset' },
		);
		expect(resolved.scene).toBe('moon');
		expect(resolved.sceneSource).toBe('cli');
		expect(resolved.luminance).toBe(0.85);
		expect(resolved.luminanceSource).toBe('cli-luminance');
		expect(resolved.lightsLevel).toBe(1);
	});

	test('luminance-ev beats config when luminance omitted', () => {
		const resolved = resolveNightParams(
			{ luminanceEv: 'high' },
			{ luminance: 0.55, scene: 'candle-light' },
		);
		expect(resolved.luminance).toBe(LUMINANCE_EV_VALUES.high);
		expect(resolved.luminanceSource).toBe('cli-luminance-ev');
		expect(resolved.scene).toBe('candle-light');
		expect(resolved.sceneSource).toBe('config');
		expect(resolved.lightsLevel).toBe(4);
	});

	test('config luminance beats config luminance-ev', () => {
		const resolved = resolveNightParams(
			{},
			{ luminance: 0.62, luminanceEv: 'max', scene: 'night-light' },
		);
		expect(resolved.luminance).toBe(0.62);
		expect(resolved.luminanceSource).toBe('config-luminance');
		expect(resolved.lightsLevel).toBe(2);
	});

	test('legacy chroma aliases still resolve', () => {
		const fromLegacyCli = resolveNightParams({
			chroma: 0.8,
			chromaEv: 'minimal',
		});
		expect(fromLegacyCli.luminance).toBe(0.8);
		expect(fromLegacyCli.luminanceSource).toBe('cli-chroma');

		const fromLegacyConfig = resolveNightParams(
			{},
			{ chroma: 0.55, scene: 'moon' },
		);
		expect(fromLegacyConfig.luminance).toBe(0.55);
		expect(fromLegacyConfig.luminanceSource).toBe('config-chroma');

		const fromLegacyEv = resolveNightParams(
			{},
			parseNightConfigSection({ 'chroma-ev': 'max', scene: 'sunset' }),
		);
		expect(fromLegacyEv.luminance).toBe(LUMINANCE_EV_VALUES.max);
		expect(fromLegacyEv.luminanceSource).toBe('config-chroma-ev');
	});

	test('canonical luminance wins over legacy chroma on CLI', () => {
		const resolved = resolveNightParams({
			luminance: 0.9,
			chroma: 0.2,
			luminanceEv: 'minimal',
			chromaEv: 'max',
		});
		expect(resolved.luminance).toBe(0.9);
		expect(resolved.luminanceSource).toBe('cli-luminance');
	});

	test('rejects invalid scene and luminance-ev', () => {
		expect(() => resolveNightParams({ scene: 'dawn' })).toThrow(/--scene/);
		expect(() => resolveNightParams({ luminanceEv: 'ultra' })).toThrow(
			/--luminance-ev/,
		);
		expect(() => resolveNightParams({ luminance: 1.5 })).toThrow(/--luminance/);
	});

	test('parseNightConfigSection accepts luminance-ev and legacy chroma-ev', () => {
		expect(
			parseNightConfigSection({ scene: 'sunset', 'luminance-ev': 'minimal' }),
		).toEqual({ scene: 'sunset', luminanceEv: 'minimal' });
		expect(
			parseNightConfigSection({ scene: 'sunset', 'chroma-ev': 'minimal' }),
		).toEqual({
			scene: 'sunset',
			chromaEv: 'minimal',
		});
	});

	test('accentMainToneFromProduct is Primary Night 明度 (luminance×100)', () => {
		expect(accentMainToneFromProduct(0.7)).toBe(70);
		expect(accentMainToneFromProduct(0.5)).toBe(50);
		expect(accentMainToneFromProduct(0.9)).toBe(90);
		expect(accentMainToneFromProduct(0)).toBe(0);
		expect(accentMainToneFromProduct(1)).toBe(100);
	});
});
