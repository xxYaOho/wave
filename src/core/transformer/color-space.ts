import chroma from 'chroma-js';
import {
  type DtcgColorSpaceValue,
  type ColorSpaceFormat,
  type ColorSpaceType,
  isDtcgColorSpaceValue,
} from '../../types/index.ts';

export interface ColorConversionResult {
  success: boolean;
  value?: string;
  error?: string;
}

export function convertColorSpace(
  colorValue: DtcgColorSpaceValue,
  targetFormat: ColorSpaceFormat = 'hex',
  tokenPath?: string
): ColorConversionResult {
  const { colorSpace, components, alpha } = colorValue;

  if (components.length !== 3) {
    return {
      success: false,
      error: formatError(`components must have 3 elements, got ${components.length}`, tokenPath),
    };
  }

  if (alpha !== undefined && (alpha < 0 || alpha > 1)) {
    return {
      success: false,
      error: formatError(`alpha must be between 0 and 1, got ${alpha}`, tokenPath),
    };
  }

  let color: chroma.Color;

  try {
    color = createColorFromSpace(colorSpace, components);
  } catch (e) {
    return {
      success: false,
      error: formatError(`invalid ${colorSpace} values: ${components.join(', ')}`, tokenPath),
    };
  }

  const outputAlpha = alpha !== undefined ? alpha : 1;

  try {
    const result = formatColorOutput(color, targetFormat, outputAlpha);
    return { success: true, value: result };
  } catch (e) {
    return {
      success: false,
      error: formatError(`failed to format as ${targetFormat}`, tokenPath),
    };
  }
}

function createColorFromSpace(colorSpace: ColorSpaceType, components: number[]): chroma.Color {
  const [a = 0, b = 0, c = 0] = components;

  switch (colorSpace) {
    case 'oklch':
      return chroma.oklch(a, b, c);
    case 'srgb':
      return chroma.rgb(a * 255, b * 255, c * 255);
    case 'hsl':
      return chroma.hsl(a, b / 100, c / 100);
    default:
      throw new Error(`Unsupported color space: ${colorSpace}`);
  }
}

export function formatColorOutput(color: chroma.Color, format: ColorSpaceFormat, alpha: number): string {
  const hasAlpha = alpha < 1;

  switch (format) {
    case 'hex':
      if (hasAlpha) {
        const hexColor = color.hex();
        const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
        return `${hexColor}${alphaHex}`;
      }
      return color.hex();

    case 'oklch': {
      let [l, c, h] = color.oklch();
      // 处理纯黑/纯白时 hue 为 NaN 的情况
      if (Number.isNaN(h)) h = 0;
      const lPercent = (l * 100).toFixed(0);
      // 对于 chroma，使用 parseFloat 去除末尾的 0
      const cVal = parseFloat(c.toFixed(2));
      const hVal = h.toFixed(0);
      if (hasAlpha) {
        return `oklch(${lPercent}% ${cVal} ${hVal} / ${alpha})`;
      }
      return `oklch(${lPercent}% ${cVal} ${hVal})`;
    }

    case 'srgb': {
      const [r, g, b] = color.rgb();
      if (hasAlpha) {
        return `rgb(${r} ${g} ${b} / ${alpha})`;
      }
      return `rgb(${r} ${g} ${b})`;
    }

    case 'hsl': {
      let [h, s, l] = color.hsl();
      // 处理纯黑/纯白时 hue 为 NaN 的情况
      if (Number.isNaN(h)) h = 0;
      const hVal = h.toFixed(0);
      const sPercent = (s * 100).toFixed(0);
      const lPercent = (l * 100).toFixed(0);
      if (hasAlpha) {
        return `hsl(${hVal} ${sPercent}% ${lPercent}% / ${alpha})`;
      }
      return `hsl(${hVal} ${sPercent}% ${lPercent}%)`;
    }

    default:
      return color.hex();
  }
}

function formatError(message: string, tokenPath?: string): string {
  if (tokenPath) {
    return `${message} at ${tokenPath}`;
  }
  return message;
}

export { isDtcgColorSpaceValue };

// 将 hex 颜色转换为 RGB 分量（用于 CSS 输出）
export function hexToRgbComponents(hex: string): { red: number; green: number; blue: number; alpha: number } | null {
  // 处理 #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  const normalized = hex.replace('#', '');
  let r: number, g: number, b: number, a = 1;

  if (normalized.length === 3) {
    r = parseInt(normalized[0]! + normalized[0]!, 16);
    g = parseInt(normalized[1]! + normalized[1]!, 16);
    b = parseInt(normalized[2]! + normalized[2]!, 16);
  } else if (normalized.length === 4) {
    r = parseInt(normalized[0]! + normalized[0]!, 16);
    g = parseInt(normalized[1]! + normalized[1]!, 16);
    b = parseInt(normalized[2]! + normalized[2]!, 16);
    a = parseInt(normalized[3]! + normalized[3]!, 16) / 255;
  } else if (normalized.length === 6) {
    r = parseInt(normalized.slice(0, 2), 16);
    g = parseInt(normalized.slice(2, 4), 16);
    b = parseInt(normalized.slice(4, 6), 16);
  } else if (normalized.length === 8) {
    r = parseInt(normalized.slice(0, 2), 16);
    g = parseInt(normalized.slice(2, 4), 16);
    b = parseInt(normalized.slice(4, 6), 16);
    a = parseInt(normalized.slice(6, 8), 16) / 255;
  } else {
    return null;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) {
    return null;
  }

  return { red: r, green: g, blue: b, alpha: a };
}
