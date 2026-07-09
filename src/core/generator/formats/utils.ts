import { hexToRgbComponents } from '../../transformer/color-space.ts';

function colorToRgba(colorVal: unknown): string {
	const colorStr = String(colorVal);
	if (!colorStr.startsWith('#')) {
		return colorStr;
	}

	const components = hexToRgbComponents(colorStr);
	if (!components) return colorStr;

	const { red, green, blue, alpha } = components;
	const alphaRounded = Math.round(alpha * 100) / 100;
	return `rgb(${red} ${green} ${blue} / ${alphaRounded})`;
}

export function formatCssLength(value: unknown): string {
	if (typeof value === 'number') {
		if (value === 0) return '0';
		return `${Math.round(value * 1000) / 1000}px`;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^-?0(?:\.0+)?px$/.test(trimmed)) return '0';
		if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
			const numeric = Number(trimmed);
			return numeric === 0 ? '0' : `${trimmed}px`;
		}
		return trimmed;
	}
	return String(value);
}

export function shadowToCss(value: unknown): string {
	const shadowLayers = Array.isArray(value) ? value : [value];
	const layers = shadowLayers.map((layer: unknown) => {
		if (typeof layer !== 'object' || layer === null) {
			return String(layer);
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
	if (!Array.isArray(value)) {
		return String(value);
	}

	const stops = value.map((stop: unknown) => {
		if (typeof stop !== 'object' || stop === null) {
			return String(stop);
		}

		const s = stop as Record<string, unknown>;
		const color = colorToRgba(s.color);
		const position =
			typeof s.position === 'number' ? Math.round(s.position * 100) : 0;

		return `${color} ${position}%`;
	});

	return `linear-gradient(to right, ${stops.join(', ')})`;
}
