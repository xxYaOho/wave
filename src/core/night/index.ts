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
	accentChromaFromProduct,
	CHROMA_EV_LEVELS,
	CHROMA_EV_VALUES,
	type ChromaEvLevel,
	clampChroma,
	DEFAULT_NIGHT_CHROMA,
	DEFAULT_NIGHT_SCENE,
	isChromaEvLevel,
	isNightSceneId,
	NIGHT_SCENE_LEVEL,
	NIGHT_SCENES,
	type NightCliParams,
	type NightConfigSection,
	type NightSceneId,
	parseNightConfigSection,
	type ResolvedNightParams,
	resolveNightParams,
} from './params.ts';
