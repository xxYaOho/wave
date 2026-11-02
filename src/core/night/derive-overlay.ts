/**
 * Build a Night overlay tree from a resolved Day theme using pure color-rules.
 */
import { normalizeColorValue } from '../transformer/color-value.ts';
import {
	applyNightScene,
	type ColorRuleKnobs,
	DEFAULT_TRIAL_KNOBS,
	remapFlatDayToNight,
} from './color-rules.ts';
import { accentMainToneFromProduct, type ResolvedNightParams } from './params.ts';

export type NightMappedRole = {
	path: string;
	strategy: string;
	dayHex: string | null;
	nightHex: string | null;
	alpha: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setPath(
	tree: Record<string, unknown>,
	path: string,
	leaf: Record<string, unknown>,
): void {
	const parts = path.split('.');
	let cursor: Record<string, unknown> = tree;
	for (let i = 0; i < parts.length - 1; i++) {
		const key = parts[i]!;
		const next = cursor[key];
		if (!isObject(next)) {
			cursor[key] = {};
		}
		cursor = cursor[key] as Record<string, unknown>;
	}
	cursor[parts[parts.length - 1]!] = leaf;
}

function walkColorLeaves(
	node: unknown,
	parts: string[],
	visit: (path: string, value: unknown) => void,
): void {
	if (!isObject(node)) return;
	if (Object.hasOwn(node, '$value')) {
		if (parts.length > 0) visit(parts.join('.'), node.$value);
		return;
	}
	for (const [key, child] of Object.entries(node)) {
		if (key.startsWith('$') || key.startsWith('_')) continue;
		walkColorLeaves(child, [...parts, key], visit);
	}
}

function toHex6(
	value: unknown,
	path: string,
): { hex: string; alpha: number } | null {
	if (path === 'transparent' && typeof value === 'string') {
		return { hex: value.toLowerCase(), alpha: 0 };
	}
	try {
		const normalized = normalizeColorValue(value, 'hex', path);
		const hex =
			typeof normalized.hex6 === 'string'
				? normalized.hex6.toLowerCase()
				: typeof normalized.value === 'string'
					? normalized.value.slice(0, 7).toLowerCase()
					: null;
		if (!hex?.startsWith('#')) return null;
		return { hex, alpha: normalized.alpha };
	} catch {
		return null;
	}
}

function formatNightValue(hex: string, alpha: number): string {
	if (alpha >= 1) return hex;
	if (alpha <= 0) return `${hex}00`;
	const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${hex}${a}`;
}

export function buildProductKnobs(params: ResolvedNightParams): ColorRuleKnobs {
	// Product luminance = Primary Night 明度 → trialTone.accentMain (validation preview dial).
	// Settled accent chromaScale/floor (彩度) stay at night-derive defaults — separate axis.
	const accentMain = accentMainToneFromProduct(params.luminance);
	const base: ColorRuleKnobs = {
		...DEFAULT_TRIAL_KNOBS,
		dayRoleOverrides: {},
		includeStateInOverlay: true,
		state: 'passthrough',
		trialTone: {
			...DEFAULT_TRIAL_KNOBS.trialTone,
			accentMain,
		},
	};
	return applyNightScene(base, params.lightsLevel);
}

export function flattenResolvedDayColors(
	colorTree: Record<string, unknown>,
): Record<string, { hex: string; alpha: number }> {
	const flat: Record<string, { hex: string; alpha: number }> = {};
	walkColorLeaves(colorTree, [], (path, value) => {
		const resolved = toHex6(value, path);
		if (resolved) flat[path] = resolved;
	});
	return flat;
}

export function deriveNightOverlay(input: {
	resolvedTheme: Record<string, unknown>;
	params: ResolvedNightParams;
}): {
	overlay: { theme: Record<string, unknown> };
	mapped: NightMappedRole[];
	knobs: ColorRuleKnobs;
	dayFlat: Record<string, string>;
	nightFlat: Record<string, string>;
} {
	const colorTree = isObject(input.resolvedTheme.color)
		? input.resolvedTheme.color
		: {};
	const dayResolved = flattenResolvedDayColors(colorTree);
	const dayFlat: Record<string, string> = {};
	const alphaByPath: Record<string, number> = {};
	for (const [path, entry] of Object.entries(dayResolved)) {
		dayFlat[path] = entry.hex;
		alphaByPath[path] = entry.alpha;
	}

	const knobs = buildProductKnobs(input.params);
	const { night: nightFlat, strategies } = remapFlatDayToNight(dayFlat, knobs);

	const nightColor: Record<string, unknown> = {};
	const mapped: NightMappedRole[] = [];

	for (const [path, dayHex] of Object.entries(dayFlat)) {
		const alpha = alphaByPath[path] ?? 1;
		if (path === 'transparent') {
			setPath(nightColor, path, { $value: dayFlat[path] });
			mapped.push({
				path,
				strategy: 'passthrough',
				dayHex,
				nightHex: dayHex,
				alpha,
			});
			continue;
		}
		const nightHex = nightFlat[path];
		if (!nightHex) {
			setPath(nightColor, path, {
				$value: formatNightValue(dayHex, alpha),
			});
			mapped.push({
				path,
				strategy: 'passthrough-unresolved',
				dayHex,
				nightHex: null,
				alpha,
			});
			continue;
		}
		setPath(nightColor, path, {
			$value: formatNightValue(nightHex, alpha),
		});
		mapped.push({
			path,
			strategy: strategies[path] ?? 'color-rule',
			dayHex,
			nightHex,
			alpha,
		});
	}

	const theme: Record<string, unknown> = { color: nightColor };
	if (knobs.includeStateInOverlay && isObject(input.resolvedTheme.state)) {
		const nightState: Record<string, unknown> = {};
		for (const [key, leaf] of Object.entries(input.resolvedTheme.state)) {
			if (
				key.startsWith('$') ||
				!isObject(leaf) ||
				!Object.hasOwn(leaf, '$value')
			)
				continue;
			nightState[key] = { $value: structuredClone(leaf.$value) };
			mapped.push({
				path: `state.${key}`,
				strategy: knobs.state,
				dayHex: null,
				nightHex: null,
				alpha: 1,
			});
		}
		if (Object.keys(nightState).length > 0) theme.state = nightState;
	}

	return {
		overlay: { theme },
		mapped,
		knobs,
		dayFlat,
		nightFlat,
	};
}
