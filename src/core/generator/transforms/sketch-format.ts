import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

// Sketch API 结构定义
interface SketchShadowLayer {
  x: number | string;
  y: number | string;
  blur: number | string;
  spread: number | string;
  color: string;
}

interface SketchBorder {
  fillType: 'Color';
  color: string;
  thickness: number;
  position: 'Inside' | 'Center' | 'Outside';
}

// 将 6位hex 转为 8位hex（添加 alpha）
function hexToSketchColor(hex: string): string {
  if (hex.length === 9) return hex;
  if (hex.length === 7) return `${hex}ff`;
  return hex;
}

// 首字母大写
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// 清理数值（px 转数字，rem 保留）
function cleanValue(val: number | string): number | string {
  if (typeof val === 'string' && val.endsWith('px')) {
    const num = parseFloat(val);
    return isNaN(num) ? val : num;
  }
  return val;
}

// 生成扁平键名
function generateFlatKey(path: string[]): string {
  return path.join('-');
}

// 处理 shadow 值
function processShadowValue(value: unknown): SketchShadowLayer[] {
  if (!Array.isArray(value)) {
    if (typeof value === 'object' && value !== null) {
      value = [value];
    } else {
      return [];
    }
  }

  return (value as Array<Record<string, unknown>>).map((layer) => ({
    x: cleanValue(layer.offsetX as number | string),
    y: cleanValue(layer.offsetY as number | string),
    blur: cleanValue(layer.blur as number | string),
    spread: cleanValue(layer.spread as number | string),
    color: hexToSketchColor(String(layer.color)),
  }));
}

// 处理 border 值
function processBorderValue(value: unknown): SketchBorder | unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const border = value as Record<string, unknown>;
  const width = border.width;
  const thickness = typeof width === 'number'
    ? width
    : (typeof width === 'object' && width !== null && 'value' in width)
      ? (width as { value: number }).value
      : 0;

  return {
    fillType: 'Color',
    color: hexToSketchColor(String(border.color)),
    thickness,
    position: capitalize(String(border.position || 'center')) as 'Inside' | 'Center' | 'Outside',
  };
}

// 处理 interaction 值
function processInteractionValue(value: unknown): { opacity: number } | unknown {
  if (typeof value === 'number') {
    return { opacity: value };
  }
  if (typeof value === 'object' && value !== null && 'opacity' in value) {
    return { opacity: (value as { opacity: number }).opacity };
  }
  return value;
}

// 处理 gradient 值（颜色转为 8位hex）
function processGradientValue(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return (value as Array<Record<string, unknown>>).map((stop) => ({
    ...stop,
    color: hexToSketchColor(String(stop.color)),
  }));
}

// 主转换函数
export const sketchFormat: Format = {
  name: 'wave/sketch',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;
    const result: Record<string, unknown> = {};

    // 按 _order 排序保持原始顺序
    const sortedTokens = [...dictionary.allTokens].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0)
    );

    for (const token of sortedTokens) {
      const tokenValue = token.$value ?? token.value;
      if (tokenValue === undefined) continue;

      const path = token.path;
      const effectivePath = filterLayer > 0 ? path.slice(filterLayer) : path;
      if (effectivePath.length === 0) continue;

      const key = generateFlatKey(effectivePath);
      const type = effectivePath[0];

      // color 类型：扁平键名 + 8位hex
      if (type === 'color') {
        result[key] = hexToSketchColor(String(tokenValue));
      }
      // border 类型
      else if (type === 'border' || token.type === 'border' || token.$type === 'border') {
        result[key] = processBorderValue(tokenValue);
      }
      // opacity 类型
      else if (type === 'opacity' || token.type === 'opacity' || token.$type === 'opacity') {
        result[key] = typeof tokenValue === 'number' ? tokenValue : (tokenValue as { opacity: number }).opacity;
      }
      // style 命名空间
      else if (type === 'style' && effectivePath.length >= 2) {
        const styleType = effectivePath[1];

        // interaction
        if (styleType === 'interaction') {
          result[key] = processInteractionValue(tokenValue);
        }
        // shadow (shadow-1, shadow-2 等)
        else if (styleType.startsWith('shadow')) {
          result[key] = processShadowValue(tokenValue);
        }
        // gradient
        else if (styleType.startsWith('gradient')) {
          result[key] = processGradientValue(tokenValue);
        }
      }
    }

    return JSON.stringify(result, null, 2);
  },
};

export default sketchFormat;
