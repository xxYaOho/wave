/**
 * Pure Day→Night color rule function (sandbox).
 * Input: resolved Day hex (+ role path). Output: Night hex.
 * Trial knobs only — NOT Wave product defaults. Old Lab T65 is an observation, not approved.
 */
import {
	argbFromHex,
	Hct,
	hexFromArgb,
} from '@material/material-color-utilities';

export type TrialToneKnobs = {
	accentMain: number;
	accentOnMain: number;
	accentContainer: number;
	accentOnContainer: number;
	neutralMain: number;
	neutralOnMain: number;
	neutralContainer: number;
	neutralOnContainer: number;
	textEmphasis: number;
	textDefault: number;
	textSubtle: number;
	textSubtlest: number;
	textDisabled: number;
	surfaceBright: number;
	surfaceDefault: number;
	surfaceDim: number;
	containerHighest: number;
	containerHigh: number;
	containerDefault: number;
	containerLow: number;
	containerLowest: number;
	inverseSurface: number;
	inverseOnSurface: number;
	inversePrimary: number;
	shadow: number;
	scrim: number;
};

export type ChromaScaleKnobs = {
	accent: number;
	neutral: number;
	surface: number;
	text: number;
};

/** Absolute HCT chroma floors. Day whites/pastels have ~0 chroma; without a floor Night collapses to ash/mud. */
export type ChromaFloorKnobs = {
	accent: number;
	neutral: number;
	surface: number;
	text: number;
};

export type ColorRuleKnobs = {
	hueKeep: boolean;
	hueShiftByRole: Record<string, number>;
	/** HCT tone targets 0–100. TRIAL PLACEHOLDERS — not approved product defaults. */
	trialTone: TrialToneKnobs;
	chromaScale: ChromaScaleKnobs;
	/** Min chroma after scale — fights ash/mud from near-achromatic Day sources. */
	chromaFloor: ChromaFloorKnobs;
	cctBias: 'neutral' | 'warm' | 'cool' | string;
	cctHueShiftDeg: { warm: number; cool: number };
	/**
	 * Warm scenes only: Lab-mix fraction toward an amber pole at the same HCT tone.
	 * Mild tint (色彩混合) — NOT an absolute hue rotate to brown. 0 = no warm mix.
	 */
	cctWarmMix: number;
	/** Amber pole hue for warm Lab mix (~55). */
	cctWarmTargetHue: number;
	/** Pole chroma so a small mix still carries warm Lab a/b without full recolor. */
	cctWarmPoleChroma: number;
	/** When true, on-* uses (100 - dayTone) instead of trialTone slot (still trial). */
	onRoleUseInvert: boolean;
	borderAlphaBump: number;
	state: 'passthrough' | string;
	includeStateInOverlay: boolean;
	/** Debug only — not main Night path. */
	debugPaletteStepFallback?: boolean;
	/**
	 * Sandbox: rewrite Day role $value (palette ref / hex) before resolve→Night.
	 * Keys are role paths like "primary.main". "$comment" keys ignored.
	 */
	dayRoleOverrides?: Record<string, string>;
	/**
	 * Night scene / lightsLevel 1–5 → 月光/夜灯/晚间/烛光/晚霞.
	 * Moving it applies applyNightScene: surface/text follow scene; accent* stay at 晚间 anchor;
	 * cctBias + mild surface chromaFloor update. Fine trialTone sliders remain absolute afterward.
	 */
	lightsLevel: number;
};

export type RoleKind =
	| 'accent-main'
	| 'accent-on-main'
	| 'accent-container'
	| 'accent-on-container'
	| 'neutral-main'
	| 'neutral-on-main'
	| 'neutral-container'
	| 'neutral-on-container'
	| 'text'
	| 'surface'
	| 'layout-container'
	| 'inverse-surface'
	| 'inverse-on-surface'
	| 'inverse-primary'
	| 'border'
	| 'outline'
	| 'shadow'
	| 'scrim'
	| 'transparent'
	| 'other';

const ACCENT_ROOTS = new Set([
	'primary',
	'secondary',
	'error',
	'warning',
	'attention',
	'success',
	'info',
]);

export function classifyRole(path: string): {
	kind: RoleKind;
	root: string;
	slot: string;
} {
	const [root, slot = ''] = path.split('.');
	if (path === 'transparent') return { kind: 'transparent', root, slot };
	if (path === 'scrim') return { kind: 'scrim', root, slot };
	if (path === 'shadow') return { kind: 'shadow', root, slot };
	if (root === 'inverse') {
		if (slot === 'surface') return { kind: 'inverse-surface', root, slot };
		if (slot === 'on-surface')
			return { kind: 'inverse-on-surface', root, slot };
		if (slot === 'primary') return { kind: 'inverse-primary', root, slot };
		return { kind: 'other', root, slot };
	}
	if (root === 'text') return { kind: 'text', root, slot };
	if (root === 'surface') return { kind: 'surface', root, slot };
	if (root === 'container') return { kind: 'layout-container', root, slot };
	if (root === 'border') return { kind: 'border', root, slot };
	if (root === 'outline') return { kind: 'outline', root, slot };
	if (root === 'neutral') {
		if (slot === 'main') return { kind: 'neutral-main', root, slot };
		if (slot === 'on-main') return { kind: 'neutral-on-main', root, slot };
		if (slot === 'container') return { kind: 'neutral-container', root, slot };
		if (slot === 'on-container')
			return { kind: 'neutral-on-container', root, slot };
	}
	if (ACCENT_ROOTS.has(root)) {
		if (slot === 'main') return { kind: 'accent-main', root, slot };
		if (slot === 'on-main') return { kind: 'accent-on-main', root, slot };
		if (slot === 'container') return { kind: 'accent-container', root, slot };
		if (slot === 'on-container')
			return { kind: 'accent-on-container', root, slot };
	}
	return { kind: 'other', root, slot };
}

function clamp(n: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, n));
}

/**
 * Cool CCT: small additive HCT hue shift.
 * Warm CCT: no absolute rotate — warmth is Lab-mix (cctWarmMix) after HCT, see applyWarmLabMix.
 */
function cctShift(knobs: ColorRuleKnobs, apply: boolean): number {
	if (!apply || knobs.cctBias === 'neutral') return 0;
	// warm: intentionally 0 — absolute -155 recolored charcoal→brown; mix model below
	if (knobs.cctBias === 'warm') return 0;
	if (knobs.cctBias === 'cool') return knobs.cctHueShiftDeg?.cool ?? -10;
	return 0;
}

/** sRGB hex helpers for Lab warm mix (色彩混合). */
function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function srgbToLinear(c: number): number {
	const x = c / 255;
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb8(c: number): number {
	const x = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
	return Math.round(clamp(x * 255, 0, 255));
}
function hexToLab(hex: string): { L: number; a: number; b: number } {
	const [R, G, B] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
	let X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
	const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
	let Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
	X /= 0.95047;
	Z /= 1.08883;
	const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	const fx = f(X),
		fy = f(Y),
		fz = f(Z);
	return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
function labToHex(L: number, a: number, b: number): string {
	const fy = (L + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;
	const fInv = (t: number) => {
		const t3 = t * t * t;
		return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
	};
	const X = fInv(fx) * 0.95047;
	const Y = fInv(fy);
	const Z = fInv(fz) * 1.08883;
	const R = linearToSrgb8(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z);
	const G = linearToSrgb8(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z);
	const B = linearToSrgb8(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z);
	return `#${[R, G, B].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
function mixHexLab(coolHex: string, warmHex: string, t: number): string {
	const A = hexToLab(coolHex);
	const B = hexToLab(warmHex);
	return labToHex(
		A.L + (B.L - A.L) * t,
		A.a + (B.a - A.a) * t,
		A.b + (B.b - A.b) * t,
	);
}

/**
 * Dual-field warm mix falloff (surface / layout-container only; caller gates via wantsWarmMix).
 * lightsLevel 4 烛光 = local pool (stronger near light roles); 5 晚霞 = global veil (uniform 1).
 */
function warmMixFalloff(
	kind: RoleKind,
	slot: string,
	lightsLevel: number,
): number {
	const L = clampLightsLevel(lightsLevel);
	if (L === 5) return 1.0; // 晚霞 / global veil
	if (L !== 4) return 0; // cool/neutral scenes: mix already 0
	// 烛光 / local pool
	if (kind === 'layout-container') {
		if (slot === 'highest' || slot === 'high') return 1.0;
		if (slot === 'low' || slot === 'lowest') return 0.35;
		return 0.7; // default
	}
	if (kind === 'surface') {
		if (slot === 'bright') return 0.65;
		if (slot === 'dim') return 0.15;
		return 0.35; // default
	}
	return 0;
}

/** Mild warm tint: Lab-mix cool Night hex toward same-tone amber pole. effectiveMix = cctWarmMix × falloff. */
function applyWarmLabMix(
	coolHex: string,
	tone: number,
	knobs: ColorRuleKnobs,
	mixFalloff = 1,
): string {
	const mix = clamp((Number(knobs.cctWarmMix) || 0) * mixFalloff, 0, 1);
	if (mix <= 0) return coolHex;
	const targetHue = Number.isFinite(knobs.cctWarmTargetHue)
		? knobs.cctWarmTargetHue
		: 55;
	const poleC = Number.isFinite(knobs.cctWarmPoleChroma)
		? knobs.cctWarmPoleChroma
		: 12;
	const pole = hexFromArgb(
		Hct.from(targetHue, Math.max(0, poleC), tone).toInt(),
	).toLowerCase();
	return mixHexLab(coolHex, pole, mix).toLowerCase();
}

function toneFor(
	_path: string,
	kind: RoleKind,
	slot: string,
	dayTone: number,
	knobs: ColorRuleKnobs,
): number {
	const t = knobs.trialTone;
	const invert = () => clamp(100 - dayTone, 0, 100);

	switch (kind) {
		case 'accent-main':
			return t.accentMain;
		case 'accent-on-main':
			return knobs.onRoleUseInvert ? invert() : t.accentOnMain;
		case 'accent-container':
			return t.accentContainer;
		case 'accent-on-container':
			return knobs.onRoleUseInvert ? invert() : t.accentOnContainer;
		case 'neutral-main':
			return t.neutralMain;
		case 'neutral-on-main':
			return knobs.onRoleUseInvert ? invert() : t.neutralOnMain;
		case 'neutral-container':
			return t.neutralContainer;
		case 'neutral-on-container':
			return knobs.onRoleUseInvert ? invert() : t.neutralOnContainer;
		case 'text':
			if (slot === 'emphasis') return t.textEmphasis;
			if (slot === 'default') return t.textDefault;
			if (slot === 'subtle') return t.textSubtle;
			if (slot === 'subtlest') return t.textSubtlest;
			if (slot === 'disabled') return t.textDisabled;
			return t.textDefault;
		case 'surface':
			if (slot === 'bright') return t.surfaceBright;
			if (slot === 'dim') return t.surfaceDim;
			return t.surfaceDefault;
		case 'layout-container':
			if (slot === 'highest') return t.containerHighest;
			if (slot === 'high') return t.containerHigh;
			if (slot === 'low') return t.containerLow;
			if (slot === 'lowest') return t.containerLowest;
			return t.containerDefault;
		case 'inverse-surface':
			return t.inverseSurface;
		case 'inverse-on-surface':
			return t.inverseOnSurface;
		case 'inverse-primary':
			return t.inversePrimary;
		case 'shadow':
			return t.shadow;
		case 'scrim':
			return t.scrim;
		case 'border':
		case 'outline':
			// borders follow transformed neutrals/accents after resolve; if applied raw, nudge mid-light
			return knobs.onRoleUseInvert ? invert() : t.neutralMain;
		default:
			return knobs.onRoleUseInvert ? invert() : dayTone;
	}
}

/** Accent-container fills use softer chroma than accentMain (owl-eyes stay on *.main). Tone/chroma only — never warm-mixed (brand-safe). */
const ACCENT_CONTAINER_CHROMA_SCALE = 0.75;
const ACCENT_CONTAINER_CHROMA_FLOOR = 6;

function chromaScaleFor(kind: RoleKind, knobs: ColorRuleKnobs): number {
	const c = knobs.chromaScale;
	switch (kind) {
		case 'accent-container':
			return ACCENT_CONTAINER_CHROMA_SCALE;
		case 'accent-main':
		case 'accent-on-main':
		case 'accent-on-container':
		case 'inverse-primary':
		case 'outline':
			return c.accent;
		case 'neutral-main':
		case 'neutral-on-main':
		case 'neutral-container':
		case 'neutral-on-container':
		case 'border':
		case 'shadow':
		case 'scrim':
			return c.neutral;
		case 'surface':
		case 'layout-container':
		case 'inverse-surface':
		case 'inverse-on-surface':
			return c.surface;
		case 'text':
			return c.text;
		default:
			return 1;
	}
}

function chromaFloorFor(kind: RoleKind, knobs: ColorRuleKnobs): number {
	const f = knobs.chromaFloor ?? { accent: 0, neutral: 0, surface: 0, text: 0 };
	switch (kind) {
		case 'accent-container':
			return ACCENT_CONTAINER_CHROMA_FLOOR;
		case 'accent-main':
		case 'accent-on-main':
		case 'accent-on-container':
		case 'inverse-primary':
		case 'outline':
			return f.accent;
		case 'neutral-main':
		case 'neutral-on-main':
		case 'neutral-container':
		case 'neutral-on-container':
		case 'border':
			return f.neutral;
		case 'surface':
		case 'layout-container':
		case 'inverse-surface':
		case 'inverse-on-surface':
			return f.surface;
		case 'text':
			return f.text;
		default:
			return 0;
	}
}

/** Scale day chroma, then apply role floor so near-white Day leaves do not become ash Night. */
function chromaFor(
	kind: RoleKind,
	dayChroma: number,
	knobs: ColorRuleKnobs,
): { chroma: number; scale: number; floor: number } {
	const scale = chromaScaleFor(kind, knobs);
	const floor = chromaFloorFor(kind, knobs);
	// on-* drawn from white: keep near-achromatic dark ink; floor would tint "on" faces oddly
	if (
		kind === 'accent-on-main' ||
		kind === 'accent-on-container' ||
		kind === 'neutral-on-main' ||
		kind === 'neutral-on-container' ||
		kind === 'inverse-on-surface'
	) {
		return { chroma: Math.max(0, dayChroma * scale), scale, floor: 0 };
	}
	return {
		chroma: Math.max(floor, Math.max(0, dayChroma * scale)),
		scale,
		floor,
	};
}

function wantsCct(kind: RoleKind): boolean {
	return (
		kind === 'surface' ||
		kind === 'layout-container' ||
		kind === 'text' ||
		kind.startsWith('neutral') ||
		kind === 'border' ||
		kind === 'shadow' ||
		kind === 'inverse-surface' ||
		kind === 'inverse-on-surface'
	);
}

/**
 * Warm Lab mix — surface charcoal chrome ONLY.
 * Never: accents / on-* / accent containers / inverse.primary / text / brand-adjacent neutrals.
 * Brand hue character must stay identical across 晚间 vs 烛光/晚霞 (BMW blue test).
 */
function wantsWarmMix(kind: RoleKind): boolean {
	return kind === 'surface' || kind === 'layout-container';
}

/** Normalize #rgb / #rrggbb / #rrggbbaa → #rrggbb lower. */
export function normalizeHex(input: string): string | null {
	const s = input.trim();
	if (/^#([0-9a-fA-F]{8})$/.test(s)) return `#${s.slice(1, 7)}`.toLowerCase();
	if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toLowerCase();
	if (/^#([0-9a-fA-F]{3})$/.test(s)) {
		const r = s[1],
			g = s[2],
			b = s[3];
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	return null;
}

export type RuleResult = {
	hex: string;
	strategy: string;
	dayHct: { hue: number; chroma: number; tone: number };
	nightHct: { hue: number; chroma: number; tone: number };
};

/**
 * Pure color rule: Day hex → Night hex for one role path.
 * Keeps hue (optional role shift + CCT), remaps tone/chroma from explicit trial knobs.
 */
export function dayHexToNightHex(
	dayHex: string,
	path: string,
	knobs: ColorRuleKnobs,
): RuleResult {
	const hex = normalizeHex(dayHex);
	if (!hex) {
		return {
			hex: dayHex,
			strategy: 'passthrough-bad-hex',
			dayHct: { hue: 0, chroma: 0, tone: 0 },
			nightHct: { hue: 0, chroma: 0, tone: 0 },
		};
	}

	const { kind, slot } = classifyRole(path);
	if (kind === 'transparent') {
		return {
			hex,
			strategy: 'passthrough-transparent',
			dayHct: { hue: 0, chroma: 0, tone: 0 },
			nightHct: { hue: 0, chroma: 0, tone: 0 },
		};
	}

	const hct = Hct.fromInt(argbFromHex(hex));
	const dayH = { hue: hct.hue, chroma: hct.chroma, tone: hct.tone };

	let hue = dayH.hue;
	if (knobs.hueKeep) {
		const roleShift =
			knobs.hueShiftByRole?.[path] ??
			knobs.hueShiftByRole?.[`${classifyRole(path).root}`] ??
			0;
		hue = (hue + roleShift + cctShift(knobs, wantsCct(kind)) + 360) % 360;
	} else {
		hue = (hue + (knobs.hueShiftByRole?.[path] ?? 0) + 360) % 360;
	}

	const tone = toneFor(path, kind, slot, dayH.tone, knobs);
	const { chroma, scale, floor } = chromaFor(kind, dayH.chroma, knobs);
	let out = hexFromArgb(Hct.from(hue, chroma, tone).toInt()).toLowerCase();
	// Warm = weak Lab mix toward amber pole on surface charcoal chrome ONLY (brand-safe).
	// Dual-field: effectiveMix = cctWarmMix × falloff (烛光 local pool vs 晚霞 uniform veil).
	let effectiveWarmMix = 0;
	if (knobs.cctBias === 'warm' && wantsWarmMix(kind)) {
		const falloff = warmMixFalloff(
			kind,
			slot,
			knobs.lightsLevel ?? DEFAULT_LIGHTS_LEVEL,
		);
		effectiveWarmMix = clamp((Number(knobs.cctWarmMix) || 0) * falloff, 0, 1);
		if (effectiveWarmMix > 0) {
			out = applyWarmLabMix(out, tone, knobs, falloff);
		}
	}
	const nightHct = Hct.fromInt(argbFromHex(out));

	const floorTag = floor > 0 ? `|Cfloor${floor}` : '';
	const mixTag =
		effectiveWarmMix > 0
			? `|warmMix${Number(effectiveWarmMix.toFixed(5))}`
			: '';
	const strategy = `color-rule:hueKeep=${knobs.hueKeep}|T${tone.toFixed(0)}|C×${scale}${floorTag}|cct=${knobs.cctBias}${mixTag}`;

	return {
		hex: out,
		strategy,
		dayHct: dayH,
		nightHct: {
			hue: nightHct.hue,
			chroma: nightHct.chroma,
			tone: nightHct.tone,
		},
	};
}

/** WCAG relative luminance (sRGB). */
export function relativeLuminance(hex: string): number {
	const n = normalizeHex(hex);
	if (!n) return 0;
	const [R, G, B] = hexToRgb(n).map(srgbToLinear) as [number, number, number];
	return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
	const L1 = relativeLuminance(a);
	const L2 = relativeLuminance(b);
	const hi = Math.max(L1, L2);
	const lo = Math.min(L1, L2);
	return (hi + 0.05) / (lo + 0.05);
}

/** Near-white / near-dark ink tones for on-* over accent fills (Material-ish poles). */
export const ON_MAIN_LIGHT_TONE = 100;
export const ON_MAIN_DARK_TONE = 10;
/** Prefer ink that clears this WCAG ratio against the fill when possible. */
export const ON_MAIN_TARGET_CONTRAST = 4.5;
/** Approx. flip region vs pure black/white (~L*50). Documented; AA preference above is authoritative. */
export const ON_MAIN_Y_THRESHOLD = 0.179;

export type OnMainChoice = {
	hex: string;
	tone: number;
	choice: 'light' | 'dark';
	fillY: number;
	contrastLight: number;
	contrastDark: number;
};

/**
 * Dynamic on.main from Night fill luminance (production-like contrast).
 * Light = T100, dark = T10. Prefer light if CR≥4.5; else dark if CR≥4.5; else higher CR
 * (tie → Y < 0.179 ⇒ light). Brand hue stays on *.main; only on-* flips.
 */
export function onMainForFill(fillHex: string): OnMainChoice {
	const fill = normalizeHex(fillHex) ?? '#000000';
	const fillY = relativeLuminance(fill);
	const lightHex = hexFromArgb(
		Hct.from(0, 0, ON_MAIN_LIGHT_TONE).toInt(),
	).toLowerCase();
	const darkHex = hexFromArgb(
		Hct.from(0, 0, ON_MAIN_DARK_TONE).toInt(),
	).toLowerCase();
	const contrastLight = contrastRatio(fill, lightHex);
	const contrastDark = contrastRatio(fill, darkHex);
	let choice: 'light' | 'dark';
	if (contrastLight >= ON_MAIN_TARGET_CONTRAST) choice = 'light';
	else if (contrastDark >= ON_MAIN_TARGET_CONTRAST) choice = 'dark';
	else if (Math.abs(contrastLight - contrastDark) < 0.05) {
		choice = fillY < ON_MAIN_Y_THRESHOLD ? 'light' : 'dark';
	} else {
		choice = contrastLight >= contrastDark ? 'light' : 'dark';
	}
	return {
		hex: choice === 'light' ? lightHex : darkHex,
		tone: choice === 'light' ? ON_MAIN_LIGHT_TONE : ON_MAIN_DARK_TONE,
		choice,
		fillY,
		contrastLight,
		contrastDark,
	};
}

/** Apply dynamic on-main to all accent *.on-main roles from their Night *.main fills. */
export function applyDynamicAccentOnMain(
	night: Record<string, string>,
	strategies?: Record<string, string>,
): { primaryOnTone: number | null } {
	let primaryOnTone: number | null = null;
	for (const root of ACCENT_ROOTS) {
		const mainPath = `${root}.main`;
		const onPath = `${root}.on-main`;
		const fill = night[mainPath];
		if (!fill || !(onPath in night)) continue;
		const picked = onMainForFill(fill);
		night[onPath] = picked.hex;
		if (strategies) {
			strategies[onPath] =
				`color-rule:dynamic-on-main|${picked.choice}|Y${picked.fillY.toFixed(3)}|CL${picked.contrastLight.toFixed(2)}|CD${picked.contrastDark.toFixed(2)}|T${picked.tone}`;
		}
		if (root === 'primary') primaryOnTone = picked.tone;
	}
	return { primaryOnTone };
}

/** Remap an entire flat Day hex map → Night hex map via the pure rule. */
export function remapFlatDayToNight(
	dayFlat: Record<string, string>,
	knobs: ColorRuleKnobs,
): {
	night: Record<string, string>;
	strategies: Record<string, string>;
	primaryOnTone: number | null;
} {
	const night: Record<string, string> = {};
	const strategies: Record<string, string> = {};
	for (const [path, dayHex] of Object.entries(dayFlat)) {
		// Follow-refs already flattened to hex in emit; apply rule per path
		if (path === 'transparent' && dayHex.length === 9) {
			night[path] = dayHex;
			strategies[path] = 'passthrough-transparent';
			continue;
		}
		const r = dayHexToNightHex(dayHex, path, knobs);
		night[path] = r.hex;
		strategies[path] = r.strategy;
	}
	// Production-like contrast: derive accent *.on-main from Night *.main luminance (hue stays on main).
	const { primaryOnTone } = applyDynamicAccentOnMain(night, strategies);
	// Reflect primary choice into knobs.trialTone.accentOnMain for UI / knobs dump (does not force global default).
	if (primaryOnTone != null && knobs.trialTone) {
		knobs.trialTone.accentOnMain = primaryOnTone;
	}
	return { night, strategies, primaryOnTone };
}

/** Master lights: 1 = darkest Night, 5 = brightest Night (still dark chrome). */
export const LIGHTS_LEVEL_MIN = 1;
export const LIGHTS_LEVEL_MAX = 5;
/** Default ~ old mid-deep (former ~L4/10); YouMind-deep charcoal. */
export const DEFAULT_LIGHTS_LEVEL = 3;

/** trialTone keys driven by lightsLevel / scene baseline (surfaces, containers, text, chrome neutrals). */
export type LightsLinkedToneKey =
	| 'surfaceDim'
	| 'surfaceDefault'
	| 'surfaceBright'
	| 'containerLowest'
	| 'containerLow'
	| 'containerDefault'
	| 'containerHigh'
	| 'containerHighest'
	| 'neutralMain'
	| 'neutralOnMain'
	| 'neutralContainer'
	| 'neutralOnContainer'
	| 'textEmphasis'
	| 'textDefault'
	| 'textSubtle'
	| 'textSubtlest'
	| 'textDisabled'
	| 'inverseOnSurface';

export const LIGHTS_LINKED_KEYS: LightsLinkedToneKey[] = [
	'surfaceDim',
	'surfaceDefault',
	'surfaceBright',
	'containerLowest',
	'containerLow',
	'containerDefault',
	'containerHigh',
	'containerHighest',
	'neutralMain',
	'neutralOnMain',
	'neutralContainer',
	'neutralOnContainer',
	'textEmphasis',
	'textDefault',
	'textSubtle',
	'textSubtlest',
	'textDisabled',
	'inverseOnSurface',
];

/**
 * Accent / primary-like trialTone slots ANCHOR to 晚间 (lightsLevel 3).
 * Scene switches do NOT lerp these — owl-eyes = contrast vs deep surfaces, not brighter accent chroma.
 * accentMain DEFAULT stays 75 (current Day/Night primary.main distance). Preview exposes a trial
 * dial to temporarily pull Night closer; applyNightScene PRESERVES caller's accentMain so the dial
 * is not wiped on scene switch. Reset / knobs.json default restores 75.
 */
export const ACCENT_ANCHOR_TONES = {
	accentMain: 75,
	accentOnMain: 21,
	// Containers = large fills: sit near surface chrome (not T11 cave / full-chroma brick)
	accentContainer: 18,
	accentOnContainer: 86,
	inversePrimary: 75,
} as const;

export type AccentAnchorToneKey = keyof typeof ACCENT_ANCHOR_TONES;

export const NIGHT_SCENE_NAMES = [
	'月光',
	'夜灯',
	'晚间',
	'烛光',
	'晚霞',
] as const;
export type NightSceneName = (typeof NIGHT_SCENE_NAMES)[number];

export type NightScenePreset = {
	level: number;
	name: NightSceneName;
	cctBias: 'cool' | 'neutral' | 'warm';
	/** Lab-mix fraction toward amber pole (warm scenes only). Mild tint, not full recolor. */
	warmMix: number;
	/** Mild Night-safe surface chroma floor — keep near cool-scene levels; warmth comes from mix. */
	chromaFloorSurface: number;
	chromaFloorNeutral: number;
	chromaScaleSurface: number;
	chromaScaleNeutral: number;
};

/** Five named Night scenes — not a single brighter=more-chroma axis. */
export const NIGHT_SCENE_PRESETS: NightScenePreset[] = [
	{
		level: 1,
		name: '月光',
		cctBias: 'cool',
		warmMix: 0,
		chromaFloorSurface: 1.5,
		chromaFloorNeutral: 1.5,
		chromaScaleSurface: 1.15,
		chromaScaleNeutral: 1.0,
	},
	{
		level: 2,
		name: '夜灯',
		cctBias: 'cool',
		warmMix: 0,
		chromaFloorSurface: 2.5,
		chromaFloorNeutral: 2.0,
		chromaScaleSurface: 1.15,
		chromaScaleNeutral: 1.0,
	},
	{
		level: 3,
		name: '晚间',
		cctBias: 'neutral',
		warmMix: 0,
		chromaFloorSurface: 3.5,
		chromaFloorNeutral: 2.5,
		chromaScaleSurface: 1.15,
		chromaScaleNeutral: 1.0,
	},
	// 烛光: weaker surface-only warm Lab mix + dual-field local-pool falloff — brand accents untouched
	{
		level: 4,
		name: '烛光',
		cctBias: 'warm',
		warmMix: 0.035,
		chromaFloorSurface: 3.55,
		chromaFloorNeutral: 2.0,
		chromaScaleSurface: 1.15,
		chromaScaleNeutral: 1.0,
	},
	// 晚霞: softer global veil mix; still charcoal; zero brand hue drift
	{
		level: 5,
		name: '晚霞',
		cctBias: 'warm',
		warmMix: 0.04,
		chromaFloorSurface: 3.6,
		chromaFloorNeutral: 2.5,
		chromaScaleSurface: 1.15,
		chromaScaleNeutral: 1.0,
	},
];

export function nightSceneFor(level: number): NightScenePreset {
	const L = clampLightsLevel(level);
	return NIGHT_SCENE_PRESETS[L - 1]!;
}

export function nightSceneName(level: number): NightSceneName {
	return nightSceneFor(level).name;
}

/** Level 1 月光 — Raycast-depth near-black charcoal; recessed body text; bright key text. */
const LIGHTS_TONE_AT_1: Record<LightsLinkedToneKey, number> = {
	surfaceDim: 0,
	surfaceDefault: 2,
	surfaceBright: 4,
	containerLowest: 0,
	containerLow: 1,
	containerDefault: 2,
	containerHigh: 3,
	containerHighest: 5,
	neutralMain: 74,
	neutralOnMain: 8,
	neutralContainer: 8,
	neutralOnContainer: 94,
	textEmphasis: 99,
	textDefault: 96,
	textSubtle: 55,
	textSubtlest: 38,
	textDisabled: 28,
	inverseOnSurface: 8,
};

/** Level 5 晚霞 — elevated Night chrome (still Night, not Day). */
const LIGHTS_TONE_AT_5: Record<LightsLinkedToneKey, number> = {
	surfaceDim: 12,
	surfaceDefault: 18,
	surfaceBright: 26,
	containerLowest: 16,
	containerLow: 20,
	containerDefault: 24,
	containerHigh: 28,
	containerHighest: 34,
	neutralMain: 92,
	neutralOnMain: 20,
	neutralContainer: 26,
	neutralOnContainer: 82,
	textEmphasis: 96,
	textDefault: 90,
	textSubtle: 86,
	textSubtlest: 74,
	textDisabled: 56,
	inverseOnSurface: 20,
};

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function clampLightsLevel(level: number): number {
	const n = Number.isFinite(level) ? level : DEFAULT_LIGHTS_LEVEL;
	return Math.round(clamp(n, LIGHTS_LEVEL_MIN, LIGHTS_LEVEL_MAX));
}

/** Linked tone baseline for a lights level (lerp endpoints; hierarchy kept). Accents excluded. */
export function lightsLinkedTones(
	level: number,
): Record<LightsLinkedToneKey, number> {
	const L = clampLightsLevel(level);
	const t = (L - LIGHTS_LEVEL_MIN) / (LIGHTS_LEVEL_MAX - LIGHTS_LEVEL_MIN);
	const out = {} as Record<LightsLinkedToneKey, number>;
	for (const key of LIGHTS_LINKED_KEYS) {
		out[key] = Math.round(
			lerp(LIGHTS_TONE_AT_1[key], LIGHTS_TONE_AT_5[key], t),
		);
	}
	return out;
}

/**
 * Rewrite linked trialTone slots from lightsLevel baseline (surfaces/containers/text/neutrals).
 * Does NOT touch accent* / inversePrimary — use applyNightScene to also pin accent anchor + cct/floor.
 */
export function applyLightsBaseline(
	trialTone: TrialToneKnobs,
	level: number,
): TrialToneKnobs {
	return { ...trialTone, ...lightsLinkedTones(level) };
}

/**
 * Apply a named Night scene (月光…晚霞):
 * - rewrite linked surface/container/text/neutral tones
 * - pin accentOnMain (fallback; remap overwrites via dynamic on.main) / accentContainer / accentOnContainer / inversePrimary to 晚间 ACCENT_ANCHOR
 * - PRESERVE trialTone.accentMain (Primary Night 明度 dial) — scene must not wipe Day-Night distance
 * - set cctBias + surface/neutral chromaFloor + surface/neutral chromaScale (warm scenes tint more)
 * - leave accent chromaFloor/scale untouched (owl-eyes stay 晚间)
 */
export function applyNightScene(
	knobs: ColorRuleKnobs,
	level: number,
): ColorRuleKnobs {
	const L = clampLightsLevel(level);
	const scene = nightSceneFor(L);
	// Source of truth for Day→Night primary.main distance: caller's dial (default 75 from knobs/anchor).
	const accentMain = Number.isFinite(knobs.trialTone?.accentMain)
		? knobs.trialTone.accentMain
		: ACCENT_ANCHOR_TONES.accentMain;
	return {
		...knobs,
		lightsLevel: L,
		cctBias: scene.cctBias,
		cctWarmMix: scene.warmMix,
		chromaFloor: {
			...knobs.chromaFloor,
			surface: scene.chromaFloorSurface,
			neutral: scene.chromaFloorNeutral,
			// accent floor stays at caller's / 晚间 constant
		},
		chromaScale: {
			...knobs.chromaScale,
			surface: scene.chromaScaleSurface,
			neutral: scene.chromaScaleNeutral,
			// accent scale stays at caller's / 晚间 constant
		},
		trialTone: {
			...knobs.trialTone,
			...lightsLinkedTones(L),
			...ACCENT_ANCHOR_TONES,
			accentMain, // dial survives scene; other accent* still pinned to 晚间 anchor
		},
	};
}

export const DEFAULT_TRIAL_KNOBS: ColorRuleKnobs = {
	hueKeep: true,
	hueShiftByRole: {},
	trialTone: {
		accentMain: 75,
		accentOnMain: 21,
		accentContainer: 18,
		accentOnContainer: 86,
		neutralMain: 83,
		neutralOnMain: 14,
		neutralContainer: 17,
		neutralOnContainer: 88,
		textEmphasis: 98,
		textDefault: 93,
		textSubtle: 71,
		textSubtlest: 56,
		textDisabled: 42,
		surfaceBright: 15,
		surfaceDefault: 10,
		surfaceDim: 6,
		containerHighest: 20,
		containerHigh: 16,
		containerDefault: 13,
		containerLow: 11,
		containerLowest: 8,
		inverseSurface: 92,
		inverseOnSurface: 14,
		inversePrimary: 75,
		shadow: 0,
		scrim: 0,
	},
	chromaScale: {
		accent: 1.2,
		neutral: 1.0,
		surface: 1.15,
		text: 0.45,
	},
	chromaFloor: {
		accent: 16,
		neutral: 2.5,
		surface: 3.5,
		text: 0,
	},
	cctBias: 'neutral',
	// cool: small additive HCT shift. warm deg unused (warmth = Lab mix via cctWarmMix).
	cctHueShiftDeg: { warm: 0, cool: -10 },
	cctWarmMix: 0,
	cctWarmTargetHue: 55,
	cctWarmPoleChroma: 12,
	onRoleUseInvert: false,
	borderAlphaBump: 0,
	state: 'passthrough',
	includeStateInOverlay: true,
	debugPaletteStepFallback: false,
	dayRoleOverrides: {},
	lightsLevel: DEFAULT_LIGHTS_LEVEL,
};
