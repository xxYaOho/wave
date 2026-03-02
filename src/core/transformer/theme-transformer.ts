import {
  type ResolvedDtcgToken,
  type ResolvedTokenGroup,
  type SdTokenTree,
  type SdTokenValue,
  type DtcgValue,
  type ColorSpaceFormat,
  isResolvedToken,
} from "../../types/index.ts";
import { isDtcgColorSpaceValue, convertColorSpace } from "./color-space.ts";

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

function convertColorWithAlpha(value: { color: string; alpha: number | string }): string {
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
  if (isDtcgColorSpaceValue(value)) {
    const result = convertColorSpace(value, targetFormat, tokenPath);
    if (!result.success) {
      throw new Error(result.error || 'Color space conversion failed');
    }
    return result.value as DtcgValue;
  }
  if (isColorAlphaObject(value)) {
    return convertColorWithAlpha(value as { color: string; alpha: number | string });
  }
  return value;
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
