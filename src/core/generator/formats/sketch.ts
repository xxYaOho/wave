import type { WaveFormatFn, WaveToken } from '../../../types/index.ts';

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

function applyOpacityToHex(hex: string, opacity: number): string {
	if (opacity < 0 || opacity > 1) return hexToSketchColor(hex);
	if (hex.length === 9) {
		const base = hex.slice(0, 7);
		const alphaHex = Math.round(opacity * 255)
			.toString(16)
			.padStart(2, '0');
		return `${base}${alphaHex}`;
	}
	if (hex.length === 7) {
		const alphaHex = Math.round(opacity * 255)
			.toString(16)
			.padStart(2, '0');
		return `${hex}${alphaHex}`;
	}
	return hex;
}

function cleanValue(val: number | string): number | string {
	if (typeof val === 'string' && val.endsWith('px')) {
		const num = parseFloat(val);
		return isNaN(num) ? val : num;
	}
	return val;
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

type ComponentShadowLayer = Record<string, unknown>;

function processComponentShadowLayer(
	layer: Record<string, unknown>,
): ComponentShadowLayer {
	const result: ComponentShadowLayer = {
		x: cleanValue(layer.offsetX as number | string),
		y: cleanValue(layer.offsetY as number | string),
		blur: cleanValue(layer.blur as number | string),
		spread: cleanValue(layer.spread as number | string),
		enabled: true,
		isInnerShadow: false,
		blendingMode: 'Normal',
	};

	const colorRaw = layer.color;
	if (typeof colorRaw === 'string') {
		result.color = hexToSketchColor(colorRaw);
	} else if (
		typeof colorRaw === 'object' &&
		colorRaw !== null &&
		!Array.isArray(colorRaw)
	) {
		const obj = colorRaw as Record<string, unknown>;
		const innerColor =
			typeof obj.color === 'string' ? obj.color : String(colorRaw);
		const hex = hexToSketchColor(innerColor);
		result.color = hex;
		if (typeof obj._swatchName === 'string') {
			result.swatch = obj._swatchName;
		}
	} else {
		result.color = hexToSketchColor(String(colorRaw));
	}

	return result;
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

function mapGradientStops(
	gradientArray: Array<Record<string, unknown>>,
): Array<{ color: string; position: unknown }> {
	return gradientArray.map((stop) => ({
		color: hexToSketchColor(String(stop.color)),
		position: stop.position,
	}));
}

function addSketchSwatch<T extends Record<string, unknown>>(
	base: T,
	swatchName?: string,
): T & { swatch?: string } {
	if (!swatchName) return base as T & { swatch?: string };
	return {
		...base,
		swatch: swatchName,
	};
}

export const sketchFormat: WaveFormatFn = (
	tokens: WaveToken[],
	_options?: Record<string, unknown>,
): string => {
	const colorGroup: Record<string, string> = {};
	const styleGroup: Record<string, Record<string, unknown>> = {};
	const componentGroup: Record<string, Record<string, unknown>> = {};
	const dimensionGroup: Record<string, Record<string, unknown>> = {};

	const sortedTokens = [...tokens].sort(
		(a, b) => (a._order ?? 0) - (b._order ?? 0),
	);

	for (const token of sortedTokens) {
		const tokenValue = token.value;
		if (tokenValue === undefined) continue;

		const path = token.path;
		if (path.length < 3) continue;

		const compositePath = token._composite;
		if (compositePath && compositePath.includes('component.')) {
			const componentKey = compositePath
				.slice(compositePath.indexOf('component.') + 'component.'.length)
				.replace(/\./g, '-');
			if (!componentGroup[componentKey]) {
				componentGroup[componentKey] = {};
			}
			const componentObj = componentGroup[componentKey];
			const propKey = path[path.length - 1]!;
			const tokenType = token.type;

			if (propKey === 'background' || propKey === 'background-color') {
				if (tokenType === 'gradient') {
					let gradientArray: Array<Record<string, unknown>> = [];
					if (Array.isArray(tokenValue)) {
						gradientArray = tokenValue as Array<Record<string, unknown>>;
					} else if (typeof tokenValue === 'object' && tokenValue !== null) {
						gradientArray = [tokenValue as Record<string, unknown>];
					}
					componentObj.fills = [
						{
							fillType: 'Gradient',
							color: '#ffffffff',
							enabled: true,
							blendingMode: 'Normal',
							gradient: {
								gradientType: 'Linear',
								from: { x: 0.5, y: 0 },
								to: { x: 0.5, y: 1 },
								aspectRatio: 0,
								stops: mapGradientStops(gradientArray),
							},
						},
					];
				} else {
					const { color, opacity, swatchName } = resolveSketchColor(
						token,
						sortedTokens,
					);
					const finalColor =
						opacity !== undefined
							? applyOpacityToHex(color, opacity)
							: hexToSketchColor(color);
					componentObj.fills = [
						addSketchSwatch(
							{
								fillType: 'Color',
								color: finalColor,
								enabled: true,
								blendingMode: 'Normal',
							},
							swatchName,
						),
					];
				}
			} else if (propKey === 'foreground' || propKey === 'color') {
				const { color, opacity } = resolveSketchColor(token, sortedTokens);
				const finalColor =
					opacity !== undefined
						? applyOpacityToHex(color, opacity)
						: hexToSketchColor(color);
				componentObj.textColor = finalColor;
			} else if (propKey === 'border') {
				const { color, opacity, swatchName } = resolveSketchColor(
					token,
					sortedTokens,
				);
				const finalColor =
					opacity !== undefined
						? applyOpacityToHex(color, opacity)
						: hexToSketchColor(color);
				componentObj.borders = [
					addSketchSwatch(
						{
							fillType: 'Color',
							color: finalColor,
							position: 'Inside',
							thickness: 1,
							enabled: true,
							blendingMode: 'Normal',
							hasIndividualSides: false,
							sides: { left: 1, top: 1, right: 1, bottom: 1 },
						},
						swatchName,
					),
				];
			} else if (propKey === 'radius' || propKey === 'border-radius') {
				const radiusValue =
					typeof tokenValue === 'string'
						? parseFloat(tokenValue)
						: typeof tokenValue === 'number'
							? tokenValue
							: NaN;
				const radiusNum = isNaN(radiusValue) ? 0 : radiusValue;
				componentObj.corners = {
					style: 0,
					radii: [radiusNum, radiusNum, radiusNum, radiusNum],
					hasRadii: radiusNum > 0,
				};
			} else if (propKey === 'shadow') {
				let shadowArray: Array<Record<string, unknown>> = [];
				if (Array.isArray(tokenValue)) {
					shadowArray = tokenValue as Array<Record<string, unknown>>;
				} else if (typeof tokenValue === 'object' && tokenValue !== null) {
					shadowArray = [tokenValue as Record<string, unknown>];
				}
				componentObj.shadows = [...shadowArray]
					.reverse()
					.map(processComponentShadowLayer);
			} else {
				componentObj[propKey] = tokenValue;
			}

			continue;
		}

		// Locate the namespace root for path-based grouping. Token paths may include
		// a leading `theme` segment (path[0]==='theme'); when present, the grouping
		// keys live one level deeper.
		const themePrefix = path[0] === 'theme' ? 1 : 0;
		const rootKey = path[themePrefix];
		const subPath = path.slice(themePrefix + 1);
		if (subPath.length === 0) continue;
		const styleKey = subPath.join('-');

		if (rootKey === 'color') {
			colorGroup[styleKey] = hexToSketchColor(String(tokenValue));
		} else if (rootKey === 'style') {
			const styleType = subPath[0];

			if (styleType === 'interaction' && subPath.length >= 2) {
				const { color, opacity, alpha } = resolveSketchColor(
					token,
					sortedTokens,
				);
				const result: Record<string, unknown> = {
					color: hexToSketchColor(color),
				};
				if (typeof opacity === 'number') result.opacity = opacity;
				if (typeof alpha === 'number') result.alpha = alpha;
				styleGroup[styleKey] = result;
			} else if (styleType?.startsWith('shadow')) {
				let shadowArray: Array<Record<string, unknown>> = [];
				if (Array.isArray(tokenValue)) {
					shadowArray = tokenValue as Array<Record<string, unknown>>;
				} else if (typeof tokenValue === 'object' && tokenValue !== null) {
					shadowArray = [tokenValue as Record<string, unknown>];
				}
				styleGroup[styleKey] = {
					shadow: [...shadowArray].reverse().map(processShadowLayer),
				};
			} else if (styleType?.startsWith('gradient')) {
				let gradientArray: Array<Record<string, unknown>> = [];
				if (Array.isArray(tokenValue)) {
					gradientArray = tokenValue as Array<Record<string, unknown>>;
				} else if (typeof tokenValue === 'object' && tokenValue !== null) {
					gradientArray = [tokenValue as Record<string, unknown>];
				}
				styleGroup[styleKey] = {
					gradient: gradientArray.map((stop) => ({
						color: hexToSketchColor(String(stop.color)),
						position: stop.position,
					})),
				};
			}
		} else if (rootKey === 'dimension') {
			const sketchMap = token._sketchMap;
			const dimValue =
				typeof tokenValue === 'string' ? parseFloat(tokenValue) : tokenValue;

			if (sketchMap) {
				dimensionGroup[styleKey] = { [sketchMap]: dimValue };
			} else {
				dimensionGroup[styleKey] = { value: dimValue };
			}
		}
	}

	const result: Record<string, unknown> = {};
	if (Object.keys(colorGroup).length > 0) result.color = colorGroup;
	if (Object.keys(styleGroup).length > 0) result.style = styleGroup;
	if (Object.keys(componentGroup).length > 0) result.component = componentGroup;
	if (Object.keys(dimensionGroup).length > 0) result.dimension = dimensionGroup;

	return JSON.stringify(result, null, 2);
};
