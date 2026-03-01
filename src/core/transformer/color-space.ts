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
      return chroma.oklch(a * 100, b, c);
    case 'srgb':
      return chroma.rgb(a * 255, b * 255, c * 255);
    case 'hsl':
      return chroma.hsl(a, b / 100, c / 100);
    default:
      throw new Error(`Unsupported color space: ${colorSpace}`);
  }
}

function formatColorOutput(color: chroma.Color, format: ColorSpaceFormat, alpha: number): string {
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
      const [l, c, h] = color.oklch();
      const lPercent = (l * 100).toFixed(0);
      const cVal = c.toFixed(2);
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
      const [h, s, l] = color.hsl();
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
