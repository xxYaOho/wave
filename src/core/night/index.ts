export {
	applyNightScene,
	type ColorRuleKnobs,
	DEFAULT_TRIAL_KNOBS,
	dayHexToNightHex,
	remapFlatDayToNight,
} from './color-rules.ts';
export {
	buildProductKnobs,
	deriveNightOverlay,
	flattenResolvedDayColors,
	type NightMappedRole,
} from './derive-overlay.ts';
export {
	type EmitNightInput,
	type EmitNightResult,
	emitNightOverlay,
} from './emit.ts';
export {
	accentMainToneFromProduct,
	CHROMA_EV_LEVELS,
	CHROMA_EV_VALUES,
	type ChromaEvLevel,
	clampChroma,
	clampLuminance,
	DEFAULT_NIGHT_CHROMA,
	DEFAULT_NIGHT_LUMINANCE,
	DEFAULT_NIGHT_SCENE,
	isChromaEvLevel,
	isLuminanceEvLevel,
	isNightSceneId,
	LUMINANCE_EV_LEVELS,
	LUMINANCE_EV_VALUES,
	type LuminanceEvLevel,
	NIGHT_SCENE_LEVEL,
	NIGHT_SCENES,
	type NightCliParams,
	type NightConfigSection,
	type NightSceneId,
	parseNightConfigSection,
	type ResolvedNightParams,
	resolveNightParams,
} from './params.ts';
