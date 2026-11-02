/**
 * Product Night param resolution: scene + chroma (+ chroma-ev).
 * Priority: explicit chroma > chroma-ev > $config.night > defaults.
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

export const CHROMA_EV_LEVELS = [
	'minimal',
	'low',
	'medium',
	'high',
	'max',
] as const;

export type ChromaEvLevel = (typeof CHROMA_EV_LEVELS)[number];

/** Fixed chroma-ev → numeric chroma (0–1). */
export const CHROMA_EV_VALUES: Record<ChromaEvLevel, number> = {
	minimal: 0.5,
	low: 0.6,
	medium: 0.7,
	high: 0.75,
	max: 0.85,
};

export const DEFAULT_NIGHT_SCENE: NightSceneId = 'night';
export const DEFAULT_NIGHT_CHROMA = 0.7;

/** Settled accent defaults at chroma=0.7 (night-derive knobs). */
export const ANCHOR_PRODUCT_CHROMA = 0.7;
export const ANCHOR_ACCENT_CHROMA_SCALE = 1.2;
export const ANCHOR_ACCENT_CHROMA_FLOOR = 16;

export interface NightConfigSection {
	scene?: NightSceneId;
	chroma?: number;
	chromaEv?: ChromaEvLevel;
}

export interface NightCliParams {
	scene?: string;
	chroma?: number;
	chromaEv?: string;
}

export interface ResolvedNightParams {
	scene: NightSceneId;
	lightsLevel: number;
	chroma: number;
	chromaSource:
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

export function isChromaEvLevel(value: unknown): value is ChromaEvLevel {
	return (
		typeof value === 'string' &&
		(CHROMA_EV_LEVELS as readonly string[]).includes(value)
	);
}

export function clampChroma(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_NIGHT_CHROMA;
	return Math.min(1, Math.max(0, value));
}

/**
 * Map product chroma (0–1) onto accent chromaScale/floor.
 * chroma=0.7 matches settled night-derive accent defaults.
 */
export function accentChromaFromProduct(chroma: number): {
	scale: number;
	floor: number;
} {
	const c = clampChroma(chroma);
	const t = c / ANCHOR_PRODUCT_CHROMA;
	return {
		scale: Math.min(2.4, Math.max(0.2, ANCHOR_ACCENT_CHROMA_SCALE * t)),
		floor: Math.min(40, Math.max(0, ANCHOR_ACCENT_CHROMA_FLOOR * t)),
	};
}

export function parseNightConfigSection(
	raw: unknown,
): NightConfigSection | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
	const obj = raw as Record<string, unknown>;
	const out: NightConfigSection = {};
	if (isNightSceneId(obj.scene)) out.scene = obj.scene;
	if (typeof obj.chroma === 'number' && Number.isFinite(obj.chroma)) {
		out.chroma = clampChroma(obj.chroma);
	}
	const ev = obj.chromaEv ?? obj['chroma-ev'];
	if (isChromaEvLevel(ev)) out.chromaEv = ev;
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

	let chroma = DEFAULT_NIGHT_CHROMA;
	let chromaSource: ResolvedNightParams['chromaSource'] = 'default';
	if (config?.chromaEv !== undefined) {
		chroma = CHROMA_EV_VALUES[config.chromaEv];
		chromaSource = 'config-chroma-ev';
	}
	if (config?.chroma !== undefined) {
		chroma = clampChroma(config.chroma);
		chromaSource = 'config-chroma';
	}
	if (cli.chromaEv !== undefined) {
		if (!isChromaEvLevel(cli.chromaEv)) {
			throw new Error(
				`Invalid --chroma-ev ${JSON.stringify(cli.chromaEv)}. Expected one of: ${CHROMA_EV_LEVELS.join(', ')}`,
			);
		}
		chroma = CHROMA_EV_VALUES[cli.chromaEv];
		chromaSource = 'cli-chroma-ev';
	}
	if (cli.chroma !== undefined) {
		if (!Number.isFinite(cli.chroma) || cli.chroma < 0 || cli.chroma > 1) {
			throw new Error(
				`Invalid --chroma ${String(cli.chroma)}. Expected a number in 0..1`,
			);
		}
		chroma = clampChroma(cli.chroma);
		chromaSource = 'cli-chroma';
	}

	return {
		scene,
		lightsLevel: NIGHT_SCENE_LEVEL[scene],
		chroma,
		chromaSource,
		sceneSource,
	};
}
