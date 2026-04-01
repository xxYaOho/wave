import {
  type ResolvedDtcgToken,
  type ResolvedTokenGroup,
  type SdTokenTree,
  type SdTokenValue,
  type DtcgValue,
  type ColorSpaceFormat,
  isResolvedToken,
} from "../../types/index.ts";
import { isDtcgColorSpaceValue, convertColorSpace, hexToRgbComponents } from "./color-space.ts";

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

export interface TransformResult {
  tree: SdTokenTree;
  order: string[];
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
  const inheritedType = resolved.$type ?? parentType;

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
      const nested = transformToSDFormat(
        value as ResolvedTokenGroup,
        inheritedType,
        targetColorSpace,
        tokenPath
      );
      result[key] = nested.tree;
      order.push(...nested.order.map(k => `${key}.${k}`));
    }
  }

  return { tree: result, order };
}

function transformToken(
  token: ResolvedDtcgToken,
  parentType: string | undefined,
  order: number,
  targetColorSpace: ColorSpaceFormat = 'hex',
  tokenPath?: string
): SdTokenValue {
  const processedValue = processValue(token.$value, targetColorSpace, tokenPath);

  const sdValue: SdTokenValue = {
    value: processedValue,
    _order: order,
  };

  const typeValue = token.$type ?? parentType;
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
