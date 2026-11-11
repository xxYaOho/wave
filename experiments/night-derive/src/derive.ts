/**
 * Night derivation from Day role leaves — pure color rule path.
 * Resolve Day (palette ref / HSL / hex) → hex, then dayHexToNightHex(role, knobs).
 * Does NOT use Material DynamicScheme isDark. paletteStepMap is not the main path.
 */
import {
	type ColorRuleKnobs,
	dayHexToNightHex,
	type RuleResult,
	remapFlatDayToNight,
} from './color-rules.js';
import {
	BLACK,
	isBlackRef,
	isWhiteRef,
	parsePaletteRef,
	TW3,
	WHITE,
} from './palettes.js';

export type Knobs = ColorRuleKnobs;
export type TokenLeaf = {
	$value: unknown;
	$description?: string;
	$type?: string;
	[k: string]: unknown;
};
export type MappedRole = {
	path: string;
	strategy: string;
	day: unknown;
	night: unknown;
	dayHex?: string | null;
	nightHex?: string | null;
};

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

function hslToHex(h: number, s: number, l: number): string {
	s /= 100;
	l /= 100;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

export function resolvePreviewHex(
	value: unknown,
	corerain: Record<string, Record<string, string>>,
	_mode: 'day' | 'night' = 'day',
): string | null {
	if (typeof value === 'string') {
		if (isWhiteRef(value)) return WHITE;
		if (isBlackRef(value)) return BLACK;
		if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value))
			return value.slice(0, 7).toLowerCase();
		if (/^#([0-9a-fA-F]{3})$/.test(value)) {
			const r = value[1],
				g = value[2],
				b = value[3];
			return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
		}
		const p = parsePaletteRef(value);
		if (p) {
			if (p.root === 'corerain') return corerain[p.family]?.[p.step] ?? null;
			if (p.root === 'tailwindcss') return TW3[p.family]?.[p.step] ?? null;
		}
		return null;
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const obj = value as Record<string, unknown>;
		if (obj.colorSpace === 'hsl' && Array.isArray(obj.components)) {
			const components = obj.components;
			if (
				components.length < 3 ||
				!components.every((component) => typeof component === 'number')
			)
				return null;
			const [h, s, l] = components as [number, number, number];
			return hslToHex(h, s, l);
		}
		if (typeof obj.color === 'string') {
			return resolvePreviewHex(obj.color, corerain, _mode);
		}
	}
	return null;
}

function walkLeaves(
	node: unknown,
	path = '',
): Array<{ path: string; leaf: TokenLeaf }> {
	const out: Array<{ path: string; leaf: TokenLeaf }> = [];
	if (!node || typeof node !== 'object') return out;
	const obj = node as Record<string, unknown>;
	if ('$value' in obj) {
		out.push({ path, leaf: obj as TokenLeaf });
		return out;
	}
	for (const [k, v] of Object.entries(obj)) {
		if (k.startsWith('$')) continue;
		out.push(...walkLeaves(v, path ? `${path}.${k}` : k));
	}
	return out;
}

function setPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
) {
	const parts = path.split('.');
	const leafKey = parts.at(-1);
	if (!leafKey) return;
	let cur: Record<string, unknown> = target;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (p === undefined) return;
		if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
		cur = cur[p] as Record<string, unknown>;
	}
	cur[leafKey] = value;
}

/** Apply knobs.dayRoleOverrides onto a cloned Day color tree (path → new $value). */
export function applyDayRoleOverrides(
	colorTree: Record<string, unknown>,
	overrides: Record<string, string> | undefined,
): Record<string, unknown> {
	const out = clone(colorTree);
	if (!overrides) return out;
	for (const [path, value] of Object.entries(overrides)) {
		if (!path || path.startsWith('$')) continue;
		if (typeof value !== 'string' || !value) continue;
		const parts = path.split('.');
		let cur: Record<string, unknown> = out;
		let ok = true;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (part === undefined) {
				ok = false;
				break;
			}
			const n = cur[part];
			if (!n || typeof n !== 'object') {
				ok = false;
				break;
			}
			cur = n as Record<string, unknown>;
		}
		if (!ok) continue;
		const leafKey = parts.at(-1);
		if (!leafKey) continue;
		const leaf = cur[leafKey];
		if (
			leaf &&
			typeof leaf === 'object' &&
			!Array.isArray(leaf) &&
			'$value' in (leaf as object)
		) {
			(leaf as TokenLeaf).$value = value;
			const desc = (leaf as TokenLeaf).$description;
			(leaf as TokenLeaf).$description =
				`${desc ? `${desc} · ` : ''}sandbox dayRoleOverride`;
		} else {
			cur[leafKey] = { $value: value, $description: 'sandbox dayRoleOverride' };
		}
	}
	return out;
}

/** Resolve Day color tree → flat hex map (palette refs / HSL / hex). */
export function flattenDayHex(
	colorTree: Record<string, unknown>,
	corerain: Record<string, Record<string, string>>,
): Record<string, string> {
	const flat: Record<string, string> = {};
	for (const { path, leaf } of walkLeaves(colorTree)) {
		// keep 8-digit transparent as-is for parity
		if (path === 'transparent' && typeof leaf.$value === 'string') {
			flat[path] = leaf.$value;
			continue;
		}
		const hex = resolvePreviewHex(leaf.$value, corerain, 'day');
		if (hex) flat[path] = hex;
	}
	// resolve theme.color.* / $ref against already-flat roles
	for (const { path, leaf } of walkLeaves(colorTree)) {
		if (flat[path]) continue;
		const v = leaf.$value;
		if (typeof v === 'string') {
			const m = v.match(/^\{theme\.color\.(.+)\}$/);
			const key = m?.[1];
			if (key && flat[key]) flat[path] = flat[key];
		} else if (
			v &&
			typeof v === 'object' &&
			typeof (v as { color?: string }).color === 'string'
		) {
			const c = (v as { color: string }).color;
			const m = c.match(/^\{theme\.color\.(.+)\}$/);
			const key = m?.[1];
			if (key && flat[key]) flat[path] = flat[key];
			else {
				const hx = resolvePreviewHex(c, corerain, 'day');
				if (hx) flat[path] = hx;
			}
		} else if (
			v &&
			typeof v === 'object' &&
			typeof (v as { $ref?: string }).$ref === 'string'
		) {
			const ref = (v as { $ref: string }).$ref;
			const m = ref.match(/^#\/theme\/color\/(.+)\/\$value$/);
			if (m) {
				const key = m[1];
				if (key) {
					const normalizedKey = key.replace(/\//g, '.');
					if (flat[normalizedKey]) flat[path] = flat[normalizedKey];
				}
			}
		}
	}
	return flat;
}

/**
 * Main Night path: pure color rules on resolved Day hex → Night hex leaves.
 * Semantic palette refs are resolved first; @night.yaml gets hex leaves for Wave overlay.
 */
export function deriveNightColorTree(
	dayColor: Record<string, unknown>,
	knobs: Knobs,
	corerain: Record<string, Record<string, string>>,
): {
	nightColor: Record<string, unknown>;
	mapped: MappedRole[];
	dayFlat: Record<string, string>;
	nightFlat: Record<string, string>;
} {
	const dayForRules = applyDayRoleOverrides(dayColor, knobs.dayRoleOverrides);
	const dayFlat = flattenDayHex(dayForRules, corerain);
	const { night: nightFlat, strategies } = remapFlatDayToNight(dayFlat, knobs);

	// Follow-role paths (border/outline that mirrored day refs): re-apply after accents exist
	// by transforming the day-resolved hex (already done). Keep alpha-bearing day shapes when useful.
	const nightColor: Record<string, unknown> = {};
	const mapped: MappedRole[] = [];

	for (const { path, leaf } of walkLeaves(dayForRules)) {
		const dayHex = dayFlat[path] ?? null;
		const nightHex = nightFlat[path] ?? null;
		const dayVal = leaf.$value;

		// Alpha composites: transform the resolved color; keep alpha ref when present
		if (
			dayVal &&
			typeof dayVal === 'object' &&
			!Array.isArray(dayVal) &&
			typeof (dayVal as { alpha?: unknown }).alpha === 'string' &&
			nightHex
		) {
			const outVal = {
				color: nightHex,
				alpha: (dayVal as { alpha: string }).alpha,
			};
			setPath(nightColor, path, { $value: outVal });
			mapped.push({
				path,
				strategy: `${strategies[path] ?? 'color-rule'}+keep-alpha`,
				day: dayVal,
				night: outVal,
				dayHex,
				nightHex,
			});
			continue;
		}

		if (path === 'transparent') {
			setPath(nightColor, path, { $value: dayVal });
			mapped.push({
				path,
				strategy: 'passthrough',
				day: dayVal,
				night: dayVal,
				dayHex,
				nightHex: typeof dayVal === 'string' ? dayVal : nightHex,
			});
			continue;
		}

		if (!nightHex) {
			setPath(nightColor, path, { $value: clone(dayVal) });
			mapped.push({
				path,
				strategy: 'passthrough-unresolved',
				day: dayVal,
				night: dayVal,
				dayHex,
				nightHex,
			});
			continue;
		}

		const out: TokenLeaf = { $value: nightHex };
		if (leaf.$description)
			out.$description = `${leaf.$description} (night color-rule draft)`.trim();
		setPath(nightColor, path, out);
		mapped.push({
			path,
			strategy: strategies[path] ?? 'color-rule',
			day: dayVal,
			night: nightHex,
			dayHex,
			nightHex,
		});
	}

	return { nightColor, mapped, dayFlat, nightFlat };
}

export function deriveStateTree(
	dayState: Record<string, unknown> | undefined,
	knobs: Knobs,
): { nightState: Record<string, unknown>; mapped: MappedRole[] } {
	const mapped: MappedRole[] = [];
	const nightState: Record<string, unknown> = {};
	if (!dayState || !knobs.includeStateInOverlay) return { nightState, mapped };

	for (const [k, leaf] of Object.entries(dayState)) {
		if (k.startsWith('$')) continue;
		const token = leaf as TokenLeaf;
		nightState[k] = {
			$value: clone(token.$value),
			...(token.$type ? { $type: token.$type } : {}),
		};
		mapped.push({
			path: `state.${k}`,
			strategy: knobs.state,
			day: token.$value,
			night: token.$value,
		});
	}
	return { nightState, mapped };
}

export type { ColorRuleKnobs, RuleResult };
export { dayHexToNightHex, hslToHex, remapFlatDayToNight };
