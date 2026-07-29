import { hexToRgbComponents } from '../../transformer/color-space.ts';

function scalarShape(value: unknown): string {
	return Array.isArray(value)
		? 'array'
		: value === null
			? 'null'
			: typeof value;
}

function assertScalar(
	value: unknown,
	context: string,
): asserts value is string | number {
	if (typeof value !== 'string' && typeof value !== 'number') {
		throw new Error(`${context} must be a scalar, got ${scalarShape(value)}`);
	}
}

function colorToRgba(colorVal: unknown): string {
	assertScalar(colorVal, 'CSS color');
	const colorStr = String(colorVal);
	if (!colorStr.startsWith('#')) return colorStr;

	const components = hexToRgbComponents(colorStr);
	if (!components) return colorStr;

	const { red, green, blue, alpha } = components;
	const alphaRounded = Math.round(alpha * 100) / 100;
	return `rgb(${red} ${green} ${blue} / ${alphaRounded})`;
}

export function formatCssLength(value: unknown): string {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error('CSS length must be finite');
		if (value === 0) return '0';
		return `${Math.round(value * 1000) / 1000}px`;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^-?0(?:\.0+)?px$/.test(trimmed)) return '0';
		if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)) {
			const numeric = Number(trimmed);
			return numeric === 0 ? '0' : `${trimmed}px`;
		}
		if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:px|pt|rem|em|%)$/i.test(trimmed)) {
			return trimmed;
		}
	}
	throw new Error(
		`CSS length must be a normalized dimension, got ${scalarShape(value)}`,
	);
}

export function cssLengthNumber(value: unknown): number | undefined {
	if (typeof value === 'number')
		return Number.isFinite(value) ? value : undefined;
	if (typeof value !== 'string') return undefined;
	const match = value
		.trim()
		.match(/^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?:px|pt|rem|em|%)?$/i);
	return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function shadowToCss(value: unknown): string {
	const shadowLayers = Array.isArray(value) ? value : [value];
	if (shadowLayers.length === 0)
		throw new Error('CSS shadow must not be empty');
	const layers = shadowLayers.map((layer: unknown, index) => {
		if (typeof layer !== 'object' || layer === null || Array.isArray(layer)) {
			throw new Error(`CSS shadow layer ${index} must be an object`);
		}

		const l = layer as Record<string, unknown>;
		const offsetX = formatCssLength(l.offsetX);
		const offsetY = formatCssLength(l.offsetY);
		const blur = formatCssLength(l.blur);
		const spread = formatCssLength(l.spread);
		const color = colorToRgba(l.color);
		const inset = l.inset === true ? 'inset ' : '';

		return `${inset}${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
	});

	return layers.join(', ');
}

export function gradientToCss(value: unknown): string {
	if (!Array.isArray(value) || value.length < 2) {
		throw new Error('CSS gradient must contain at least two stops');
	}

	const stops = value.map((stop: unknown, index) => {
		if (typeof stop !== 'object' || stop === null || Array.isArray(stop)) {
			throw new Error(`CSS gradient stop ${index} must be an object`);
		}

		const s = stop as Record<string, unknown>;
		const color = colorToRgba(s.color);
		if (typeof s.position !== 'number' || !Number.isFinite(s.position)) {
			throw new Error(`CSS gradient stop ${index} position must be finite`);
		}
		const position = Math.round(s.position * 100_000_000) / 1_000_000;

		return `${color} ${position}%`;
	});

	return `linear-gradient(to right, ${stops.join(', ')})`;
}
