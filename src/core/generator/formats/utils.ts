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

function formatShadowLength(val: unknown): string {
	if (typeof val === 'string') {
		if (val.endsWith('px')) {
			const num = parseFloat(val);
			return isNaN(num) ? val : String(num);
		}
		return val;
	}
	if (typeof val === 'number') return String(Math.round(val));
	return String(val);
}

export function shadowToCss(value: unknown): string {
	if (!Array.isArray(value)) {
		return String(value);
	}

	const layers = value.map((layer: unknown) => {
		if (typeof layer !== 'object' || layer === null) {
			return String(layer);
		}

		const l = layer as Record<string, unknown>;
		const offsetX = formatShadowLength(l.offsetX);
		const offsetY = formatShadowLength(l.offsetY);
		const blur = formatShadowLength(l.blur);
		const spread = formatShadowLength(l.spread);
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
