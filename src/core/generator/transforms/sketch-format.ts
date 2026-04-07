import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

// Sketch API 结构定义
interface SketchShadowLayer {
  x: number | string;
  y: number | string;
  blur: number | string;
  spread: number | string;
  color: string;
}

// 将 6位hex 转为 8位hex（添加 alpha）
function hexToSketchColor(hex: string): string {
  if (hex.length === 9) return hex;
  if (hex.length === 7) return `${hex}ff`;
  return hex;
}

// 清理数值（px 转数字，rem 保留）
function cleanValue(val: number | string): number | string {
  if (typeof val === 'string' && val.endsWith('px')) {
    const num = parseFloat(val);
    return isNaN(num) ? val : num;
  }
  return val;
}

// 处理 shadow 层
function processShadowLayer(layer: Record<string, unknown>): SketchShadowLayer {
  return {
    x: cleanValue(layer.offsetX as number | string),
    y: cleanValue(layer.offsetY as number | string),
    blur: cleanValue(layer.blur as number | string),
    spread: cleanValue(layer.spread as number | string),
    color: hexToSketchColor(String(layer.color)),
  };
}

// 主转换函数
export const sketchFormat: Format = {
  name: 'wave/sketch',
  format: ({ dictionary }: { dictionary: Dictionary }) => {
    const colorGroup: Record<string, string> = {};
    const styleGroup: Record<string, Record<string, unknown>> = {};

    // 按 _order 排序保持原始顺序
    const sortedTokens = [...dictionary.allTokens].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0)
    );

    for (const token of sortedTokens) {
      const tokenValue = token.$value ?? token.value;
      if (tokenValue === undefined) continue;

      const path = token.path;
      // path 结构: ['theme', 'color'|'style', ...]
      if (path.length < 3) continue;

      const rootKey = path[1]; // 'color' 或 'style'
      const subPath = path.slice(2);
      const styleKey = subPath.join('-'); // 'primary-main', 'interaction-hover', 'shadow-1'

      // color 组：扁平键值对
      if (rootKey === 'color') {
        colorGroup[styleKey] = hexToSketchColor(String(tokenValue));
      }
      // style 组：嵌套结构
      else if (rootKey === 'style') {
        const styleType = path[2];

        // interaction: { color, opacity }
        if (styleType === 'interaction' && path.length >= 4) {
          const t = token as unknown as Record<string, unknown>;
          const value = tokenValue as { color?: string; opacity?: number; _color?: string } | string;

          // 提取颜色值 - 尝试多种来源
          let colorValue: string | undefined;

          if (typeof value === 'string') {
            colorValue = value;
          } else if (typeof value === 'object' && value !== null && 'color' in value) {
            colorValue = value.color!;
          }

          // 如果还没找到，尝试从 _color 获取（transformer 注入的原始颜色）
          if (!colorValue && typeof value === 'object' && value !== null && '_color' in value) {
            colorValue = String(value._color);
          }

          // 最后的备选
          if (!colorValue) {
            colorValue = '#ff00ff'; // 占位符粉色
          }

          const result: Record<string, unknown> = {
            color: hexToSketchColor(colorValue)
          };

          // 添加 opacity
          if (typeof value === 'object' && value !== null && 'opacity' in value) {
            result.opacity = value.opacity;
          } else if (t.currentColorOpacity !== undefined) {
            result.opacity = t.currentColorOpacity;
          }

          styleGroup[styleKey] = result;
        }
        // shadow: { shadow: [...] }
        else if (styleType?.startsWith('shadow')) {
          let shadowArray: Array<Record<string, unknown>> = [];

          if (Array.isArray(tokenValue)) {
            shadowArray = tokenValue as Array<Record<string, unknown>>;
          } else if (typeof tokenValue === 'object' && tokenValue !== null) {
            shadowArray = [tokenValue as Record<string, unknown>];
          }

          // Sketch UI 中 shadow 列表从上到下对应数组从后到前
          // 即：数组[0] 显示在 UI 最底部，数组[last] 显示在 UI 最顶部
          // 反转数组使小阴影(y=0, blur=1)在 UI 顶部，大阴影在底部
          styleGroup[styleKey] = {
            shadow: shadowArray.reverse().map(processShadowLayer)
          };
        }
        // gradient: { gradient: [...] }
        else if (styleType?.startsWith('gradient')) {
          let gradientArray: Array<Record<string, unknown>> = [];

          if (Array.isArray(tokenValue)) {
            gradientArray = tokenValue as Array<Record<string, unknown>>;
          } else if (typeof tokenValue === 'object' && tokenValue !== null) {
            gradientArray = [tokenValue as Record<string, unknown>];
          }

          styleGroup[styleKey] = {
            gradient: gradientArray.map((stop) => ({
              color: hexToSketchColor(String(stop.color)),
              position: stop.position
            }))
          };
        }
      }
    }

    // 构建最终输出
    const result: Record<string, unknown> = {};

    // 只输出非空的组
    if (Object.keys(colorGroup).length > 0) {
      result.color = colorGroup;
    }
    if (Object.keys(styleGroup).length > 0) {
      result.style = styleGroup;
    }

    return JSON.stringify(result, null, 2);
  },
};

export default sketchFormat;
