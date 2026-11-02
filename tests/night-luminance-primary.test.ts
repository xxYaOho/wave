import { describe, expect, test } from 'bun:test';
import { dayHexToNightHex } from '../src/core/night/color-rules.ts';
import { buildProductKnobs } from '../src/core/night/derive-overlay.ts';
import {
	accentMainToneFromProduct,
	resolveNightParams,
} from '../src/core/night/params.ts';

/** Saturated brand blue similar to orca primary.main. */
const ORCA_LIKE_PRIMARY = '#1a72f0';

describe('night product luminance → Primary Night 明度 (accentMain tone)', () => {
	test('luminance maps linearly to accentMain tone (×100)', () => {
		expect(accentMainToneFromProduct(0.5)).toBe(50);
		expect(accentMainToneFromProduct(0.7)).toBe(70);
		expect(accentMainToneFromProduct(0.9)).toBe(90);
		expect(
			buildProductKnobs(resolveNightParams({ luminance: 0.5 })).trialTone
				.accentMain,
		).toBe(50);
		expect(
			buildProductKnobs(resolveNightParams({ luminance: 0.7 })).trialTone
				.accentMain,
		).toBe(70);
		expect(
			buildProductKnobs(resolveNightParams({ luminance: 0.9 })).trialTone
				.accentMain,
		).toBe(90);
	});

	test('#1a72f0 at luminance 0.5 lands mid Primary Night lightness (~T50)', () => {
		const knobs = buildProductKnobs(
			resolveNightParams({ scene: 'night', luminance: 0.5 }),
		);
		const at = dayHexToNightHex(ORCA_LIKE_PRIMARY, 'primary.main', knobs);
		expect(at.nightHct.hue).toBeCloseTo(at.dayHct.hue, 0);
		expect(at.nightHct.tone).toBeCloseTo(50, 0);
		// Mid night — not the old T75 washout, not near-white.
		expect(at.hex.toLowerCase()).not.toBe('#a5b8e7');
		expect(at.hex.toLowerCase()).not.toBe('#99b8ff');
		expect(at.nightHct.tone).toBeLessThan(60);
		expect(at.nightHct.tone).toBeGreaterThan(40);
	});

	test('#1a72f0 at luminance 0.7 ≈ T70; at 0.9 approaches white-ish (~T90)', () => {
		const k07 = buildProductKnobs(
			resolveNightParams({ scene: 'night', luminance: 0.7 }),
		);
		const k09 = buildProductKnobs(
			resolveNightParams({ scene: 'night', luminance: 0.9 }),
		);
		const at07 = dayHexToNightHex(ORCA_LIKE_PRIMARY, 'primary.main', k07);
		const at09 = dayHexToNightHex(ORCA_LIKE_PRIMARY, 'primary.main', k09);

		expect(at07.nightHct.tone).toBeCloseTo(70, 0);
		expect(at09.nightHct.tone).toBeCloseTo(90, 0);
		expect(at09.nightHct.tone).toBeGreaterThan(at07.nightHct.tone);
		// Near-white T90 may nudge hue slightly under sRGB clip; keep within ~2°.
		expect(Math.abs(at09.nightHct.hue - at09.dayHct.hue)).toBeLessThan(2);
		expect(at07.nightHct.hue).toBeCloseTo(at07.dayHct.hue, 0);
		expect(at07.hex).not.toBe(at09.hex);
	});

	test('scene apply preserves product accentMain; accent chromaScale stays settled', () => {
		const knobs = buildProductKnobs(
			resolveNightParams({ scene: 'sunset', luminance: 0.5 }),
		);
		expect(knobs.trialTone.accentMain).toBe(50);
		expect(knobs.chromaScale.accent).toBeCloseTo(1.2, 5);
		expect(knobs.chromaFloor.accent).toBeCloseTo(16, 5);
		expect(knobs.lightsLevel).toBe(5);
		expect(knobs.cctBias).toBe('warm');
	});
});
