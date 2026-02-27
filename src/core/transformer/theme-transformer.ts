import {
  type ResolvedDtcgToken,
  type ResolvedTokenGroup,
  type SdTokenTree,
  type SdTokenValue,
  type DtcgValue,
  isResolvedToken,
} from "../../types/index.ts";

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

function processValue(value: DtcgValue): DtcgValue {
  if (isColorAlphaObject(value)) {
    return convertColorWithAlpha(value as { color: string; alpha: number | string });
  }
  return value;
}

export function transformToSDFormat(
  resolved: ResolvedTokenGroup,
  parentType?: string
): SdTokenTree {
  const result: SdTokenTree = {};
  const inheritedType = resolved.$type ?? parentType;

  for (const key of Object.keys(resolved)) {
    if (key.startsWith("$")) {
      continue;
    }

    const value = resolved[key];

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== "object") {
      continue;
    }

    if (isResolvedToken(value)) {
      result[key] = transformToken(value, inheritedType);
    } else {
      result[key] = transformToSDFormat(
        value as ResolvedTokenGroup,
        inheritedType
      );
    }
  }

  return result;
}

function transformToken(
  token: ResolvedDtcgToken,
  parentType: string | undefined
): SdTokenValue {
  const processedValue = processValue(token.$value);

  const sdValue: SdTokenValue = {
    value: processedValue,
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
