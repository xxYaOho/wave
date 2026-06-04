import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { leonardoRecipePath } from './paths.ts';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const DEFAULT_RECIPE = {
	colors: {
		gray: '#808080',
		red: '#f53f3f',
		orange: '#f77234',
		green: '#00b42a',
		blue: '#165dff',
		purple: '#722ed1',
	},
	ratios: {
		mode: 'explicit',
		values: [1.05, 1.31, 1.66, 2.14, 2.81, 3.74, 5.1, 7, 9.59, 12.82, 16.29],
	},
};

type Recipe = {
	colors: Record<string, string>;
	ratios: number[];
};

function clampChannel(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): [number, number, number] {
	const normalized = hex.replace(/^#/, '');
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		throw new Error(`Invalid hex color in Leonardo recipe: ${hex}`);
	}
	return [
		Number.parseInt(normalized.slice(0, 2), 16),
		Number.parseInt(normalized.slice(2, 4), 16),
		Number.parseInt(normalized.slice(4, 6), 16),
	];
}

function toHex(rgb: [number, number, number]): string {
	return `#${rgb.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

function mix(
	base: [number, number, number],
	target: [number, number, number],
	amount: number,
): string {
	return toHex([
		base[0] + (target[0] - base[0]) * amount,
		base[1] + (target[1] - base[1]) * amount,
		base[2] + (target[2] - base[2]) * amount,
	]);
}

function ratioWeights(ratios: number[]): number[] {
	const min = Math.min(...ratios);
	const max = Math.max(...ratios);
	if (max === min) return ratios.map(() => 0.5);
	return ratios.map((ratio) => (ratio - min) / (max - min));
}

function normalizeRecipe(raw: unknown): Recipe {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {
			colors: DEFAULT_RECIPE.colors,
			ratios: DEFAULT_RECIPE.ratios.values,
		};
	}
	const obj = raw as Record<string, unknown>;
	const rawColors =
		obj.colors && typeof obj.colors === 'object' && !Array.isArray(obj.colors)
			? (obj.colors as Record<string, unknown>)
			: DEFAULT_RECIPE.colors;
	const colors: Record<string, string> = {};
	for (const [name, value] of Object.entries(rawColors)) {
		if (typeof value === 'string') colors[name] = value;
	}

	const rawRatios = obj.ratios;
	let ratios = DEFAULT_RECIPE.ratios.values;
	if (Array.isArray(rawRatios)) {
		const values = rawRatios.filter(
			(value): value is number => typeof value === 'number',
		);
		if (values.length > 0) ratios = values;
	} else if (
		rawRatios &&
		typeof rawRatios === 'object' &&
		!Array.isArray(rawRatios)
	) {
		const ratioObj = rawRatios as Record<string, unknown>;
		if (Array.isArray(ratioObj.values)) {
			const values = ratioObj.values.filter(
				(value): value is number => typeof value === 'number',
			);
			if (values.length > 0) ratios = values;
		} else if (
			typeof ratioObj.min === 'number' &&
			typeof ratioObj.max === 'number'
		) {
			const min = ratioObj.min;
			const max = ratioObj.max;
			const steps = Math.max(2, Number(ratioObj.steps ?? SHADES.length));
			ratios = Array.from({ length: steps }, (_, index) => {
				const t = index / (steps - 1);
				return min + (max - min) * t;
			});
		}
	}

	return { colors, ratios };
}

async function loadRecipe(): Promise<{
	recipe: Recipe;
	source: 'user' | 'builtin';
}> {
	const filePath = leonardoRecipePath();
	try {
		const raw = await fs.readFile(filePath, 'utf-8');
		return { recipe: normalizeRecipe(yaml.load(raw)), source: 'user' };
	} catch {
		return {
			recipe: normalizeRecipe(DEFAULT_RECIPE),
			source: 'builtin',
		};
	}
}

function paletteForMode(
	recipe: Recipe,
	mode: 'light' | 'dark',
): Record<string, unknown> {
	const weights = ratioWeights(recipe.ratios).slice(0, SHADES.length);
	const out: Record<string, unknown> = {
		black: { $value: '#000000' },
		white: { $value: '#ffffff' },
		transparent: { $value: '#00000000' },
	};
	const white: [number, number, number] = [255, 255, 255];
	const black: [number, number, number] = [0, 0, 0];

	for (const [name, hex] of Object.entries(recipe.colors)) {
		const base = parseHex(hex);
		const shadeTokens: Record<string, unknown> = {};
		for (let index = 0; index < SHADES.length; index++) {
			const shade = SHADES[index]!;
			const weight = weights[index] ?? index / (SHADES.length - 1);
			const value =
				mode === 'light'
					? mix(white, base, weight)
					: mix(black, base, 1 - weight * 0.15);
			shadeTokens[String(shade)] = { $value: value };
		}
		out[name] = shadeTokens;
	}
	return out;
}

function toYaml(namespace: string, data: Record<string, unknown>): string {
	return yaml.dump(
		{
			[namespace]: {
				color: {
					$type: 'color',
					...data,
				},
			},
		},
		{ lineWidth: -1, noRefs: true },
	);
}

export async function buildLeonardoResources(): Promise<{
	files: { name: string; content: string }[];
	recipeSource: 'user' | 'builtin';
}> {
	const { recipe, source } = await loadRecipe();
	return {
		recipeSource: source,
		files: [
			{
				name: 'leonardo-light',
				content: toYaml('leonardo-light', paletteForMode(recipe, 'light')),
			},
			{
				name: 'leonardo-dark',
				content: toYaml('leonardo-dark', paletteForMode(recipe, 'dark')),
			},
		],
	};
}
