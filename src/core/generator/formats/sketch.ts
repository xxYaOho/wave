import type {
	SketchPropertyMap,
	WaveFormatFn,
	WaveToken,
} from '../../../types/index.ts';

interface SketchShadowLayer {
	x: number | string;
	y: number | string;
	blur: number | string;
	spread: number | string;
	color: string;
}

function findSiblingToken(
	tokens: WaveToken[],
	currentPath: string[],
	siblingSlot: string,
): WaveToken | undefined {
	const parentPath = currentPath.slice(0, -1);
	const siblingPath = [...parentPath, siblingSlot];

	for (const token of tokens) {
		if (token.path.length === siblingPath.length) {
			const match = token.path.every((p, i) => p === siblingPath[i]);
			if (match) return token;
		}
	}
	return undefined;
}

function hexToSketchColor(hex: string): string {
	if (hex.length === 9) return hex;
	if (hex.length === 7) return `${hex}ff`;
	return hex;
}

function cleanValue(val: number | string): number | string {
	if (typeof val === 'string' && val.endsWith('px')) {
		const num = parseFloat(val);
		return Number.isNaN(num) ? val : num;
	}
	return val;
}

function tokenPathLabel(token: WaveToken): string {
	return token.path.join('.');
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function parseFiniteNumber(value: unknown): number | undefined {
	if (isFiniteNumber(value)) return value;
	if (typeof value !== 'string') return undefined;
	const parsed = parseFloat(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDimensionNumber(value: unknown): number | undefined {
	if (isFiniteNumber(value)) return value;
	if (typeof value !== 'string') return undefined;
	if (!/^-?\d+(?:\.\d+)?px$/.test(value.trim())) return undefined;
	return parseFiniteNumber(value);
}

function resolveSketchColorValue(token: WaveToken): string {
	if (token.type !== undefined && token.type !== 'color') {
		throw new Error(
			`Sketch color output requires type "color" at ${tokenPathLabel(token)}, got "${token.type}"`,
		);
	}

	const colorValue = extractColorFromValue(token.value);
	if (colorValue === undefined) {
		throw new Error(
			`Sketch color output requires a color value at ${tokenPathLabel(token)}`,
		);
	}
	return colorValue;
}

function toObjectArray(
	value: unknown,
	styleKind: string,
	token: WaveToken,
): Array<Record<string, unknown>> {
	if (Array.isArray(value)) {
		if (
			value.every(
				(item) =>
					typeof item === 'object' && item !== null && !Array.isArray(item),
			)
		) {
			return value as Array<Record<string, unknown>>;
		}
	} else if (typeof value === 'object' && value !== null) {
		return [value as Record<string, unknown>];
	}

	throw new Error(
		`Sketch ${styleKind} output requires an object or object array at ${tokenPathLabel(token)}`,
	);
}

function resolveDimensionValue(
	token: WaveToken,
	propertyKey?: string,
): unknown {
	const value = token.value;
	if (propertyKey === 'opacity') {
		if (!isFiniteNumber(value)) {
			throw new Error(
				`Sketch property opacity requires a finite number at ${tokenPathLabel(token)}`,
			);
		}
		return value;
	}

	if (propertyKey === 'cornerRadius') {
		const parsed = parseDimensionNumber(value);
		if (parsed === undefined) {
			throw new Error(
				`Sketch property cornerRadius requires a finite number or px dimension at ${tokenPathLabel(token)}`,
			);
		}
		return parsed;
	}

	return typeof value === 'string' ? parseFloat(value) : value;
}

function processShadowLayer(layer: Record<string, unknown>): SketchShadowLayer {
	return {
		x: cleanValue(layer.offsetX as number | string),
		y: cleanValue(layer.offsetY as number | string),
		blur: cleanValue(layer.blur as number | string),
		spread: cleanValue(layer.spread as number | string),
		color: hexToSketchColor(String(layer.color)),
	};
}

function pickSketchProperty(
	property: SketchPropertyMap | undefined,
): keyof SketchPropertyMap | undefined {
	if (property?.opacity === true) return 'opacity';
	if (property?.cornerRadius === true) return 'cornerRadius';
	return undefined;
}

function dimensionPropertyKey(token: WaveToken): string | undefined {
	return pickSketchProperty(token._sketch?.property);
}

function extractColorFromValue(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value !== null) {
		const obj = value as Record<string, unknown>;
		if ('_color' in obj && typeof obj._color === 'string') return obj._color;
		if ('color' in obj && typeof obj.color === 'string') return obj.color;
	}
	return undefined;
}

function resolveSketchColor(
	token: WaveToken,
	allTokens: WaveToken[],
): { color: string; opacity?: number; alpha?: number; swatchName?: string } {
	const path = token.path;
	const value = token.value as
		| { color?: string; opacity?: number; _color?: string }
		| string
		| undefined;

	let colorValue: string | undefined;
	let opacityValue: number | undefined;
	let alphaValue: number | undefined;
	let swatchName: string | undefined;

	if (token.inheritColor === true) {
		const siblingSlot = token.inheritColorSiblingSlot;
		opacityValue = token.inheritColorOpacity;
		alphaValue = token.inheritColorAlpha;

		if (siblingSlot) {
			const siblingToken = findSiblingToken(allTokens, path, siblingSlot);
			if (siblingToken) {
				colorValue = extractColorFromValue(siblingToken.value);
				swatchName = siblingToken._swatchName;
			}
		}

		if (!colorValue) colorValue = '#ff00ff';
	} else {
		if (typeof value === 'string') {
			colorValue = value;
		} else if (
			typeof value === 'object' &&
			value !== null &&
			'color' in value
		) {
			colorValue = value.color!;
		}

		if (
			!colorValue &&
			typeof value === 'object' &&
			value !== null &&
			'_color' in value
		) {
			colorValue = String(value._color);
		}

		if (!colorValue) colorValue = '#ff00ff';

		if (typeof value === 'object' && value !== null && 'opacity' in value) {
			opacityValue = value.opacity as number;
		} else if (token.currentColorOpacity !== undefined) {
			opacityValue = token.currentColorOpacity;
		}

		swatchName = token._swatchName;
	}

	return {
		color: colorValue,
		...(typeof opacityValue === 'number' && { opacity: opacityValue }),
		...(typeof alphaValue === 'number' && { alpha: alphaValue }),
		...(swatchName !== undefined && { swatchName }),
	};
}

function getFilteredName(token: WaveToken, filterLayer: number): string {
	const path = token.path;
	if (filterLayer <= 0 || path.length <= filterLayer) {
		return token.name;
	}
	return path.slice(filterLayer).join('-');
}

function buildOutputPath(token: WaveToken, filterLayer: number): string[] {
	const leafKey = getFilteredName(token, filterLayer);
	const sketchPath = token._sketch?.path;
	if (!sketchPath) return [leafKey];
	return [...sketchPath.split('/').filter(Boolean), leafKey];
}

function setNestedValue(
	root: Record<string, unknown>,
	parts: string[],
	value: unknown,
	token: WaveToken,
): void {
	let current = root;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i]!;
		const next = current[part];
		if (next === undefined) {
			current[part] = {};
			current = current[part] as Record<string, unknown>;
			continue;
		}
		if (typeof next !== 'object' || next === null || Array.isArray(next)) {
			throw new Error(
				`Duplicate Sketch output path "${parts.slice(0, i + 1).join('/')}" at ${tokenPathLabel(token)}`,
			);
		}
		current = next as Record<string, unknown>;
	}

	const leaf = parts[parts.length - 1]!;
	if (current[leaf] !== undefined) {
		throw new Error(
			`Duplicate Sketch output path "${parts.join('/')}" at ${tokenPathLabel(token)}`,
		);
	}
	current[leaf] = value;
}

function formatSketchValue(token: WaveToken, allTokens: WaveToken[]): unknown {
	const propertyKey = dimensionPropertyKey(token);
	if (propertyKey) {
		return { [propertyKey]: resolveDimensionValue(token, propertyKey) };
	}

	if (token.type === 'color' || token.inheritColor === true) {
		const { color, opacity, alpha } = resolveSketchColor(token, allTokens);
		if (typeof opacity === 'number' || typeof alpha === 'number') {
			return {
				color: hexToSketchColor(color),
				...(typeof opacity === 'number' && { opacity }),
				...(typeof alpha === 'number' && { alpha }),
			};
		}
		if (token.inheritColor === true) {
			return hexToSketchColor(color);
		}
		return hexToSketchColor(resolveSketchColorValue(token));
	}

	if (token.type === 'shadow') {
		const shadowArray = toObjectArray(token.value, 'shadow', token);
		return [...shadowArray].reverse().map(processShadowLayer);
	}

	if (token.type === 'gradient') {
		const gradientArray = toObjectArray(token.value, 'gradient', token);
		return gradientArray.map((stop) => ({
			color: hexToSketchColor(String(stop.color)),
			position: stop.position,
		}));
	}

	return { value: resolveDimensionValue(token) };
}

export const sketchFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number) ?? 0;
	const result: Record<string, unknown> = {};
	const sortedTokens = [...tokens].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);

	for (const token of sortedTokens) {
		if (token.value === undefined) continue;
		const outputPath = buildOutputPath(token, filterLayer);
		const value = formatSketchValue(token, sortedTokens);
		setNestedValue(result, outputPath, value, token);
	}

	return JSON.stringify(result, null, 2);
};
