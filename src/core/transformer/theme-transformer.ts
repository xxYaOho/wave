import chroma from 'chroma-js';
import {
  type ResolvedDtcgToken,
  type ResolvedTokenGroup,
  type SdTokenTree,
  type SdTokenValue,
  type DtcgValue,
  type ColorSpaceFormat,
  isResolvedToken,
} from "../../types/index.ts";
import { isDtcgColorSpaceValue, convertColorSpace, hexToRgbComponents, formatColorOutput } from "./color-space.ts";
import { sampleCubicBezier } from "./cubic-bezier.ts";
import { roundTo } from "./number-format.ts";

function isColorAlphaObject(value: unknown): value is { color: string; alpha: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    "color" in obj &&
    "alpha" in obj &&
    typeof obj.color === "string" &&
    (typeof obj.alpha === "number" || typeof obj.alpha === "string")
  );
}

function alphaToHex(alpha: number): string {
  const hex = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex;
}

function convertColorWithAlpha(
  value: { color: string; alpha: number | string },
  targetFormat: ColorSpaceFormat = 'hex',
  tokenPath?: string
): string {
  const color = value.color;
  let alpha: number;

  if (typeof value.alpha === "string") {
    alpha = parseFloat(value.alpha);
    if (isNaN(alpha)) {
      return color;
    }
  } else {
    alpha = value.alpha;
  }

  if (alpha < 0 || alpha > 1) {
    return color;
  }

  // 如果目标格式不是 hex，先转换颜色，再应用 alpha
  if (targetFormat !== 'hex' && color.startsWith("#")) {
    const components = hexToRgbComponents(color);
    if (components) {
      const colorSpaceValue = {
        colorSpace: 'srgb' as const,
        components: [components.red / 255, components.green / 255, components.blue / 255],
        alpha,
      };
      const result = convertColorSpace(colorSpaceValue, targetFormat, tokenPath);
      if (result.success) {
        return result.value as string;
      }
    }
  }

  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const alphaHex = alphaToHex(alpha);
    return `${color}${alphaHex}`;
  }

  return color;
}

function processValue(
  value: DtcgValue,
  targetFormat: ColorSpaceFormat = 'hex',
  tokenPath?: string
): DtcgValue {
  // 处理数组类型（shadow 和 gradient）
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      processArrayItem(item, targetFormat, `${tokenPath}[${index}]`)
    ) as unknown as DtcgValue;
  }

  if (isDtcgColorSpaceValue(value)) {
    const result = convertColorSpace(value, targetFormat, tokenPath);
    if (!result.success) {
      throw new Error(result.error || 'Color space conversion failed');
    }
    return result.value as DtcgValue;
  }
  if (isColorAlphaObject(value)) {
    return convertColorWithAlpha(value as { color: string; alpha: number | string }, targetFormat, tokenPath);
  }
  // 处理 hex 颜色字符串的颜色空间转换
  if (typeof value === 'string' && value.startsWith('#') && targetFormat !== 'hex') {
    const components = hexToRgbComponents(value);
    if (components) {
      const colorSpaceValue = {
        colorSpace: 'srgb' as const,
        components: [components.red / 255, components.green / 255, components.blue / 255],
        alpha: components.alpha,
      };
      const result = convertColorSpace(colorSpaceValue, targetFormat, tokenPath);
      if (result.success) {
        return result.value as DtcgValue;
      }
    }
  }
  // 处理 { value: number, unit?: string } 格式的 dimension 值
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value) {
    const obj = value as { value: number; unit?: string };
    return (obj.unit ? `${obj.value}${obj.unit}` : String(obj.value)) as unknown as DtcgValue;
  }
  return value;
}

// 处理数组中的每个元素（用于 shadow 和 gradient）
function processArrayItem(
  item: unknown,
  targetFormat: ColorSpaceFormat,
  itemPath?: string
): unknown {
  if (typeof item !== 'object' || item === null) {
    return item;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(item)) {
    if (key === 'color' && (typeof val === 'string' || isDtcgColorSpaceValue(val) || isColorAlphaObject(val))) {
      // 处理颜色值（包括带 alpha 的对象）
      result[key] = processValue(val as DtcgValue, targetFormat, itemPath);
    } else if (typeof val === 'object' && val !== null && 'value' in val) {
      // 处理 {value: number, unit?: string} 格式的值
      const obj = val as { value: number; unit?: string };
      result[key] = obj.unit ? `${obj.value}${obj.unit}` : obj.value;
    } else {
      result[key] = val;
    }
  }
  return result;
}

function extractColorAlpha(color: string): number {
  try {
    return chroma(color).alpha();
  } catch {
    return 1;
  }
}

function applyColorAlpha(color: string, alpha: number, targetFormat: ColorSpaceFormat): string {
  try {
    return formatColorOutput(chroma(color), targetFormat, alpha);
  } catch {
    return color;
  }
}

function deriveSmoothGradient(
  processedValue: unknown,
  extension: unknown,
  targetFormat: ColorSpaceFormat,
  tokenPath?: string
): unknown {
  if (!Array.isArray(processedValue) || processedValue.length !== 2) {
    throw new Error(
      `smoothGradient requires exactly 2 stops (found ${Array.isArray(processedValue) ? processedValue.length : 'non-array'}${tokenPath ? ` at ${tokenPath}` : ''})`
    );
  }

  const ext = extension as { cubicBezier?: unknown; step?: unknown };
  if (!Array.isArray(ext.cubicBezier) || ext.cubicBezier.length !== 4 || !ext.cubicBezier.every(n => typeof n === 'number')) {
    throw new Error(`smoothGradient.cubicBezier must be an array of 4 numbers${tokenPath ? ` at ${tokenPath}` : ''}`);
  }
  const cubicBezier = ext.cubicBezier as [number, number, number, number];

  if (!Number.isInteger(ext.step) || (ext.step as number) < 2) {
    throw new Error(`smoothGradient.step must be an integer >= 2${tokenPath ? ` at ${tokenPath}` : ''}`);
  }
  const step = ext.step as number;

  const start = processedValue[0] as Record<string, unknown>;
  const end = processedValue[1] as Record<string, unknown>;

  if (typeof start.color !== 'string' || typeof end.color !== 'string') {
    throw new Error(`smoothGradient stops must have string colors${tokenPath ? ` at ${tokenPath}` : ''}`);
  }

  const startColor = start.color;
  const endColor = end.color;
  const startAlpha = extractColorAlpha(startColor);
  const endAlpha = extractColorAlpha(endColor);
  const startPos = typeof start.position === 'number' ? start.position : 0;
  const endPos = typeof end.position === 'number' ? end.position : 1;

  const ratios = sampleCubicBezier(cubicBezier, step);
  const midIndex = Math.floor(step / 2);

  const derived = [];
  for (let i = 0; i < step; i++) {
    const t = i / (step - 1);
    const position = roundTo(startPos + (endPos - startPos) * t, 2);
    const ratio = ratios[i]!;
    const alpha = roundTo(startAlpha + (endAlpha - startAlpha) * ratio, 2);
    // v1: do not generate intermediate blended colors; use endpoint colors only
    const baseColor = i < midIndex ? startColor : endColor;

    derived.push({
      color: applyColorAlpha(baseColor, alpha, targetFormat),
      position,
    });
  }

  return derived;
}

function interpolateShadowValue(base: unknown, coeff: number): string | number {
  if (typeof base === 'string') {
    const match = base.trim().match(/^(-?\d+(\.\d+)?)\s*([a-z%]*)$/i);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[3] || '';
      if (unit === 'rem') {
        return `${roundTo(value * coeff, 3)}rem`;
      }
      return `${Math.round(value * coeff)}${unit}`;
    }
    return base;
  }
  if (typeof base === 'number') {
    return Math.round(base * coeff);
  }
  return 0;
}

function deriveSmoothShadow(
  processedValue: unknown,
  extension: unknown,
  targetFormat: ColorSpaceFormat,
  tokenPath?: string
): unknown {
  if (typeof processedValue !== 'object' || processedValue === null || Array.isArray(processedValue)) {
    throw new Error(
      `smoothShadow requires a single shadow layer object${tokenPath ? ` at ${tokenPath}` : ''}`
    );
  }

  const ext = extension as { cubicBezier?: unknown; step?: unknown };
  if (!Array.isArray(ext.cubicBezier) || ext.cubicBezier.length !== 4 || !ext.cubicBezier.every(n => typeof n === 'number')) {
    throw new Error(`smoothShadow.cubicBezier must be an array of 4 numbers${tokenPath ? ` at ${tokenPath}` : ''}`);
  }
  const cubicBezier = ext.cubicBezier as [number, number, number, number];

  if (!Number.isInteger(ext.step) || (ext.step as number) < 1) {
    throw new Error(`smoothShadow.step must be an integer >= 1${tokenPath ? ` at ${tokenPath}` : ''}`);
  }
  const step = ext.step as number;

  const layer = processedValue as Record<string, unknown>;
  const baseColor = typeof layer.color === 'string' ? layer.color : '#000000';
  const baseAlpha = extractColorAlpha(baseColor);
  const inset = layer.inset === true;

  // Sample step+1 points and drop the last one (zero layer)
  const ratios = sampleCubicBezier(cubicBezier, step + 1);
  const visibleRatios = ratios.slice(0, step);

  const derived = [];
  // Iterate backwards to produce layers ordered from small to large
  for (let i = visibleRatios.length - 1; i >= 0; i--) {
    const ratio = visibleRatios[i]!;
    const coeff = 1 - ratio;

    derived.push({
      color: applyColorAlpha(baseColor, roundTo(baseAlpha * coeff, 2), targetFormat),
      offsetX: interpolateShadowValue(layer.offsetX, coeff),
      offsetY: interpolateShadowValue(layer.offsetY, coeff),
      blur: interpolateShadowValue(layer.blur, coeff),
      spread: interpolateShadowValue(layer.spread, coeff),
      ...(inset && { inset: true }),
    });
  }

  return derived;
}

export interface TransformResult {
  tree: SdTokenTree;
  order: string[];
  groupComments: Record<string, string>;
}

let orderCounter = 0;

export function transformToSDFormat(
  resolved: ResolvedTokenGroup,
  parentType?: string,
  targetColorSpace: ColorSpaceFormat = 'hex',
  currentPath: string = ''
): TransformResult {
  const result: SdTokenTree = {};
  const order: string[] = [];
  const groupComments: Record<string, string> = {};
  const inheritedType = resolved.$type ?? parentType;

  if (resolved.$description !== undefined && currentPath) {
    groupComments[currentPath] = resolved.$description;
  }

  for (const key of Object.keys(resolved)) {
    if (key.startsWith("$")) {
      continue;
    }

    const value = resolved[key];
    const tokenPath = currentPath ? `${currentPath}.${key}` : key;

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== "object") {
      continue;
    }

    if (isResolvedToken(value)) {
      result[key] = transformToken(value, inheritedType, orderCounter++, targetColorSpace, tokenPath);
      order.push(key);
    } else {
      const group = value as ResolvedTokenGroup;

      // composite group: 输出为嵌套对象，子 token 作为属性
      if (group.$extensions?.composite === true) {
        const compositeObj: SdTokenTree = {};
        for (const [propKey, propValue] of Object.entries(group)) {
          if (propKey.startsWith('$')) continue;
          if (propValue === undefined || propValue === null || typeof propValue !== 'object') continue;
          if (!isResolvedToken(propValue)) continue;
          const sdValue = transformToken(propValue, inheritedType, orderCounter++, targetColorSpace, `${tokenPath}.${propKey}`);
          sdValue._composite = tokenPath; // 标记所属 composite group path
          compositeObj[propKey] = sdValue;
        }
        result[key] = compositeObj;
        order.push(`${key}.{composite}`);
      } else {
        const nested = transformToSDFormat(
          group,
          inheritedType,
          targetColorSpace,
          tokenPath
        );
        result[key] = nested.tree;
        order.push(...nested.order.map(k => `${key}.${k}`));
        Object.assign(groupComments, nested.groupComments);
      }
    }
  }

  return { tree: result, order, groupComments };
}


/**
 * Extract normalized opacity value from inheritColor.opacity
 * Handles: number, alias, $ref object
 */
function extractInheritColorOpacity(
  opacityData: unknown,
  _tokenPath?: string
): number | undefined {
  if (opacityData === undefined) {
    return undefined;
  }

  // Direct number
  if (typeof opacityData === 'number') {
    return opacityData >= 0 && opacityData <= 1 ? opacityData : undefined;
  }

  // Resolved alias or $ref - should have $value after resolution
  if (typeof opacityData === 'object' && opacityData !== null) {
    const obj = opacityData as Record<string, unknown>;
    if ('$value' in obj) {
      const resolvedValue = obj.$value;
      if (typeof resolvedValue === 'number') {
        return resolvedValue >= 0 && resolvedValue <= 1 ? resolvedValue : undefined;
      }
      if (typeof resolvedValue === 'string') {
        const parsed = parseFloat(resolvedValue);
        return !isNaN(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
      }
    }
  }

  return undefined;
}

/**
 * Extract siblingSlot from inheritColor object
 */
function extractSiblingSlot(inheritColor: unknown): string | undefined {
  if (typeof inheritColor === 'object' && inheritColor !== null) {
    const obj = inheritColor as Record<string, unknown>;
    if (typeof obj.siblingSlot === 'string') {
      return obj.siblingSlot;
    }
  }
  return undefined;
}

function transformToken(
  token: ResolvedDtcgToken,
  parentType: string | undefined,
  order: number,
  targetColorSpace: ColorSpaceFormat = 'hex',
  tokenPath?: string
): SdTokenValue {
  let processedValue = processValue(token.$value, targetColorSpace, tokenPath);
  const typeValue = token.$type ?? parentType;

  // smoothShadow derivation
  const smoothShadow = token.$extensions?.smoothShadow;
  if (smoothShadow !== undefined && typeValue === 'shadow') {
    const processedLayer = typeof processedValue === 'object' && processedValue !== null && !Array.isArray(processedValue)
      ? processArrayItem(processedValue, targetColorSpace, tokenPath)
      : processedValue;
    processedValue = deriveSmoothShadow(processedLayer, smoothShadow, targetColorSpace, tokenPath) as DtcgValue;
  }

  // smoothGradient derivation
  const smoothGradient = token.$extensions?.smoothGradient;
  if (smoothGradient !== undefined && typeValue === 'gradient') {
    processedValue = deriveSmoothGradient(processedValue, smoothGradient, targetColorSpace, tokenPath) as DtcgValue;
  }
  // inheritColor extension (v1)
  let inheritColor: boolean | undefined;
  let inheritColorOpacity: number | undefined;
  let inheritColorSiblingSlot: string | undefined;
  const inheritColorExt = token.$extensions?.inheritColor;
  if (inheritColorExt !== undefined && typeValue === 'color') {
    // Boolean form: inheritColor: true
    if (typeof inheritColorExt === 'boolean') {
      inheritColor = inheritColorExt;
    }
    // Object form: inheritColor: { opacity?, siblingSlot? }
    else if (typeof inheritColorExt === 'object' && inheritColorExt !== null) {
      inheritColor = true;
      const extObj = inheritColorExt as Record<string, unknown>;

      // Extract opacity from property.opacity or property.alpha (handles number, alias, $ref)
      const propertyObj = extObj.property as Record<string, unknown> | undefined;
      if (propertyObj && typeof propertyObj === 'object') {
        if ('opacity' in propertyObj) {
          inheritColorOpacity = extractInheritColorOpacity(propertyObj.opacity, tokenPath);
        } else if ('alpha' in propertyObj) {
          inheritColorOpacity = extractInheritColorOpacity(propertyObj.alpha, tokenPath);
        }
      }

      // Extract siblingSlot for Sketch
      inheritColorSiblingSlot = extractSiblingSlot(inheritColorExt);
    }

    // Store original color for potential fallback use
    const originalColor = typeof processedValue === 'string' ? processedValue : undefined;

    // If opacity is specified, format as object with _color preserved
    if (inheritColorOpacity !== undefined) {
      processedValue = {
        opacity: inheritColorOpacity,
        ...(originalColor !== undefined && { _color: originalColor })
      };
    }
  }


  // currentColor extension (deprecated, use inheritColor instead)
  let currentColorOpacity: number | undefined;
  let currentColorShadowAlpha: number | undefined;
  const currentColorExt = token.$extensions?.currentColor;
  if (currentColorExt !== undefined && typeof currentColorExt === 'object' && currentColorExt !== null) {
    const extObj = currentColorExt as Record<string, unknown>;

    // opacity — for non-shadow tokens
    const opacityData = extObj.opacity;
    if (opacityData !== undefined && typeValue !== 'shadow') {
      const opacityRaw = typeof opacityData === 'object' && opacityData !== null && '$value' in (opacityData as object)
        ? (opacityData as Record<string, unknown>).$value
        : opacityData;
      if (typeof opacityRaw === 'number' && opacityRaw >= 0 && opacityRaw <= 1) {
        // 保存原始颜色值供后续使用（如 sketch 格式）
        const originalColor = typeof processedValue === 'string' ? processedValue : undefined;
        processedValue = { opacity: opacityRaw, ...(originalColor !== undefined && { _color: originalColor }) };
        currentColorOpacity = opacityRaw;
      }
    }

    // shadow — for shadow tokens
    const shadowData = extObj.shadow;
    if (shadowData !== undefined && typeValue === 'shadow') {
      const shadowRaw = typeof shadowData === 'object' && shadowData !== null && '$value' in (shadowData as object)
        ? (shadowData as Record<string, unknown>).$value
        : shadowData;
      if (typeof shadowRaw === 'object' && shadowRaw !== null && !Array.isArray(shadowRaw)) {
        const processedLayer = processArrayItem(shadowRaw, targetColorSpace, tokenPath) as Record<string, unknown>;
        const layerColor = processedLayer.color;
        if (typeof layerColor === 'string') {
          const alpha = extractColorAlpha(layerColor);
          processedLayer.color = { opacity: roundTo(alpha, 2) };
          currentColorShadowAlpha = alpha;
        }
        processedValue = [processedLayer];
      }
    }
  }

  const sdValue: SdTokenValue = {
    value: processedValue,
    _order: order,
    // inheritColor v1 metadata
    ...(inheritColor !== undefined && { inheritColor }),
    ...(inheritColorOpacity !== undefined && { inheritColorOpacity }),
    ...(inheritColorSiblingSlot !== undefined && { inheritColorSiblingSlot }),
    // Legacy currentColor metadata (deprecated)
    ...(currentColorOpacity !== undefined && { currentColorOpacity }),
    ...(currentColorShadowAlpha !== undefined && { currentColorShadowAlpha }),
    // Original referenced token path for sketch variable mapping
    ...(token._swatchName !== undefined && { _swatchName: token._swatchName }),
  };

  if (typeValue !== undefined) {
    sdValue.type = typeValue;
  }

  if (token.$description !== undefined) {
    sdValue.comment = token.$description;
  }

  if (token.$deprecated !== undefined) {
    sdValue.deprecated = token.$deprecated;
  }

  return sdValue;
}
