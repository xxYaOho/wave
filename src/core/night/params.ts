/**
 * Product Night param resolution: scene + luminance (+ luminance-ev).
 * Priority: explicit luminance > luminance-ev > legacy chroma aliases > $config > defaults.
 *
 * `luminance` / `luminance-ev` = Primary Night 明度 (accentMain HCT tone),
 * matching night-derive validation preview 「Primary Night 明度」— NOT HCT chroma/彩度.
 * Legacy `$config.night.chroma` / `--chroma` / `chroma-ev` still parse as aliases.
 */

export const NIGHT_SCENES = [
	'moon',
	'night-light',
	'night',
	'candle-light',
	'sunset',
] as const;

export type NightSceneId = (typeof NIGHT_SCENES)[number];

/** English product scene → lightsLevel (1–5 月光…晚霞). */
export const NIGHT_SCENE_LEVEL: Record<NightSceneId, number> = {
	moon: 1,
	'night-light': 2,
	night: 3,
	'candle-light': 4,
	sunset: 5,
};

export const LUMINANCE_EV_LEVELS = [
	'minimal',
	'low',
	'medium',
	'high',
	'max',
] as const;

export type LuminanceEvLevel = (typeof LUMINANCE_EV_LEVELS)[number];

/** Fixed luminance-ev → numeric luminance (0–1). */
export const LUMINANCE_EV_VALUES: Record<LuminanceEvLevel, number> = {
	minimal: 0.5,
	low: 0.6,
	medium: 0.7,
	high: 0.75,
	max: 0.85,
};

/** @deprecated Use LUMINANCE_EV_LEVELS — kept for brief migration. */
export const CHROMA_EV_LEVELS = LUMINANCE_EV_LEVELS;
/** @deprecated Use LuminanceEvLevel. */
export type ChromaEvLevel = LuminanceEvLevel;
/** @deprecated Use LUMINANCE_EV_VALUES. */
export const CHROMA_EV_VALUES = LUMINANCE_EV_VALUES;

export const DEFAULT_NIGHT_SCENE: NightSceneId = 'night';
/** Default product luminance = mid-high Primary Night 明度 (→ HCT tone 70). */
export const DEFAULT_NIGHT_LUMINANCE = 0.7;
/** @deprecated Use DEFAULT_NIGHT_LUMINANCE. */
export const DEFAULT_NIGHT_CHROMA = DEFAULT_NIGHT_LUMINANCE;

export interface NightConfigSection {
	scene?: NightSceneId;
	luminance?: number;
	luminanceEv?: LuminanceEvLevel;
	/** @deprecated Prefer luminance. */
	chroma?: number;
	/** @deprecated Prefer luminanceEv. */
	chromaEv?: LuminanceEvLevel;
}

export interface NightCliParams {
	scene?: string;
	luminance?: number;
	luminanceEv?: string;
	/** @deprecated Prefer luminance. */
	chroma?: number;
	/** @deprecated Prefer luminanceEv. */
	chromaEv?: string;
}

export interface ResolvedNightParams {
	scene: NightSceneId;
	lightsLevel: number;
	/** Primary Night 明度 dial 0–1 (→ accentMain tone ×100). */
	luminance: number;
	luminanceSource:
		| 'cli-luminance'
		| 'cli-luminance-ev'
		| 'config-luminance'
		| 'config-luminance-ev'
		| 'cli-chroma'
		| 'cli-chroma-ev'
		| 'config-chroma'
		| 'config-chroma-ev'
		| 'default';
	sceneSource: 'cli' | 'config' | 'default';
}

export function isNightSceneId(value: unknown): value is NightSceneId {
	return (
		typeof value === 'string' &&
		(NIGHT_SCENES as readonly string[]).includes(value)
	);
}

export function isLuminanceEvLevel(value: unknown): value is LuminanceEvLevel {
	return (
		typeof value === 'string' &&
		(LUMINANCE_EV_LEVELS as readonly string[]).includes(value)
	);
}

/** @deprecated Use isLuminanceEvLevel. */
export const isChromaEvLevel = isLuminanceEvLevel;

export function clampLuminance(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_NIGHT_LUMINANCE;
	return Math.min(1, Math.max(0, value));
}

/** @deprecated Use clampLuminance. */
export const clampChroma = clampLuminance;

/**
 * Product luminance → Primary Night 明度 (NOT HCT 彩度).
 * Matches night-derive preview dial 「Primary Night 明度」→ trialTone.accentMain.
 * Mapping: tone = clamp(luminance,0..1) × 100  (0.5→T50 mid, 0.7→T70, 0.9→T90≈near white).
 * Settled accent chromaScale/floor (1.2 / 16) stay fixed — that 彩度 axis is separate.
 */
export function accentMainToneFromProduct(luminance: number): number {
	return clampLuminance(luminance) * 100;
}

export function parseNightConfigSection(
	raw: unknown,
): NightConfigSection | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
	const obj = raw as Record<string, unknown>;
	const out: NightConfigSection = {};
	if (isNightSceneId(obj.scene)) out.scene = obj.scene;

	// Canonical luminance keys; legacy chroma* kept separate so resolve can tag source.
	if (typeof obj.luminance === 'number' && Number.isFinite(obj.luminance)) {
		out.luminance = clampLuminance(obj.luminance);
	} else if (typeof obj.chroma === 'number' && Number.isFinite(obj.chroma)) {
		out.chroma = clampLuminance(obj.chroma);
	}

	const canonEv = obj.luminanceEv ?? obj['luminance-ev'];
	if (isLuminanceEvLevel(canonEv)) {
		out.luminanceEv = canonEv;
	} else {
		const legacyEv = obj.chromaEv ?? obj['chroma-ev'];
		if (isLuminanceEvLevel(legacyEv)) out.chromaEv = legacyEv;
	}
	return out;
}

export function resolveNightParams(
	cli: NightCliParams,
	config?: NightConfigSection,
): ResolvedNightParams {
	let scene: NightSceneId = DEFAULT_NIGHT_SCENE;
	let sceneSource: ResolvedNightParams['sceneSource'] = 'default';
	if (config?.scene) {
		scene = config.scene;
		sceneSource = 'config';
	}
	if (cli.scene !== undefined) {
		if (!isNightSceneId(cli.scene)) {
			throw new Error(
				`Invalid --scene ${JSON.stringify(cli.scene)}. Expected one of: ${NIGHT_SCENES.join(', ')}`,
			);
		}
		scene = cli.scene;
		sceneSource = 'cli';
	}

	let luminance = DEFAULT_NIGHT_LUMINANCE;
	let luminanceSource: ResolvedNightParams['luminanceSource'] = 'default';

	// Config: luminance-ev / legacy chroma-ev, then luminance / legacy chroma
	const configEv = config?.luminanceEv ?? config?.chromaEv;
	if (configEv !== undefined) {
		luminance = LUMINANCE_EV_VALUES[configEv];
		luminanceSource = config?.luminanceEv
			? 'config-luminance-ev'
			: 'config-chroma-ev';
	}
	const configLum = config?.luminance ?? config?.chroma;
	if (configLum !== undefined) {
		luminance = clampLuminance(configLum);
		luminanceSource =
			config?.luminance !== undefined ? 'config-luminance' : 'config-chroma';
	}

	// CLI legacy chroma-ev / chroma (below canonical so --luminance wins)
	if (cli.chromaEv !== undefined) {
		if (!isLuminanceEvLevel(cli.chromaEv)) {
			throw new Error(
				`Invalid --chroma-ev ${JSON.stringify(cli.chromaEv)}. Expected one of: ${LUMINANCE_EV_LEVELS.join(', ')}`,
			);
		}
		luminance = LUMINANCE_EV_VALUES[cli.chromaEv];
		luminanceSource = 'cli-chroma-ev';
	}
	if (cli.chroma !== undefined) {
		if (!Number.isFinite(cli.chroma) || cli.chroma < 0 || cli.chroma > 1) {
			throw new Error(
				`Invalid --chroma ${String(cli.chroma)}. Expected a number in 0..1`,
			);
		}
		luminance = clampLuminance(cli.chroma);
		luminanceSource = 'cli-chroma';
	}

	// CLI canonical luminance-ev / luminance
	if (cli.luminanceEv !== undefined) {
		if (!isLuminanceEvLevel(cli.luminanceEv)) {
			throw new Error(
				`Invalid --luminance-ev ${JSON.stringify(cli.luminanceEv)}. Expected one of: ${LUMINANCE_EV_LEVELS.join(', ')}`,
			);
		}
		luminance = LUMINANCE_EV_VALUES[cli.luminanceEv];
		luminanceSource = 'cli-luminance-ev';
	}
	if (cli.luminance !== undefined) {
		if (
			!Number.isFinite(cli.luminance) ||
			cli.luminance < 0 ||
			cli.luminance > 1
		) {
			throw new Error(
				`Invalid --luminance ${String(cli.luminance)}. Expected a number in 0..1`,
			);
		}
		luminance = clampLuminance(cli.luminance);
		luminanceSource = 'cli-luminance';
	}

	return {
		scene,
		lightsLevel: NIGHT_SCENE_LEVEL[scene],
		luminance,
		luminanceSource,
		sceneSource,
	};
}
