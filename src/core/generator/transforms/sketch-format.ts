import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

// Sketch API 结构定义
interface SketchShadowLayer {
  x: number | string;
  y: number | string;
  blur: number | string;
  spread: number | string;
  color: string;
}

// Check if token uses inheritColor
function isInheritColorToken(token: TransformedToken): boolean {
  return (token as Record<string, unknown>).inheritColor === true;
}

// Get inheritColor siblingSlot hint
function getInheritColorSiblingSlot(token: TransformedToken): string | undefined {
  return (token as Record<string, unknown>).inheritColorSiblingSlot as string | undefined;
}

// Get inheritColor opacity
function getInheritColorOpacity(token: TransformedToken): number | undefined {
  return (token as Record<string, unknown>).inheritColorOpacity as number | undefined;
}

// Find sibling color token by slot name
function findSiblingColor(
  tokens: TransformedToken[],
  currentPath: string[],
  siblingSlot: string
): string | undefined {
  const parentPath = currentPath.slice(0, -1);
  const siblingPath = [...parentPath, siblingSlot];

  for (const token of tokens) {
    const tokenPath = token.path;
    if (tokenPath.length === siblingPath.length) {
      const match = tokenPath.every((p, i) => p === siblingPath[i]);
      if (match) {
        const value = token.$value ?? token.value;
        if (typeof value === 'string') {
          return value;
        }
        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>;
          if ('_color' in obj && typeof obj._color === 'string') {
            return obj._color;
          }
          if ('color' in obj && typeof obj.color === 'string') {
            return obj.color;
          }
        }
      }
    }
  }

  return undefined;
}

// 将 6位hex 转为 8位hex（添加 alpha）
function hexToSketchColor(hex: string): string {
  if (hex.length === 9) return hex;
  if (hex.length === 7) return `${hex}ff`;
  return hex;
}

// 把 opacity 合并到 hex 颜色中
function applyOpacityToHex(hex: string, opacity: number): string {
  if (opacity < 0 || opacity > 1) return hexToSketchColor(hex);
  if (hex.length === 9) {
    const base = hex.slice(0, 7);
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return `${base}${alphaHex}`;
  }
  if (hex.length === 7) {
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return `${hex}${alphaHex}`;
  }
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

// 解析 Sketch 颜色值（处理 inheritColor、opacity、_color 回退）
function resolveSketchColor(
  token: TransformedToken,
  allTokens: TransformedToken[]
): { color: string; opacity?: number } {
  const path = token.path;
  const tokenValue = token.$value ?? token.value;
  const t = token as unknown as Record<string, unknown>;
  const value = tokenValue as { color?: string; opacity?: number; _color?: string } | string | undefined;

  let colorValue: string | undefined;
  let opacityValue: number | undefined;

  if (isInheritColorToken(token)) {
    const siblingSlot = getInheritColorSiblingSlot(token);
    opacityValue = getInheritColorOpacity(token);

    if (siblingSlot) {
      colorValue = findSiblingColor(allTokens, path, siblingSlot);
    }

    if (!colorValue) {
      colorValue = '#ff00ff';
    }
  } else {
    if (typeof value === 'string') {
      colorValue = value;
    } else if (typeof value === 'object' && value !== null && 'color' in value) {
      colorValue = value.color!;
    }

    if (!colorValue && typeof value === 'object' && value !== null && '_color' in value) {
      colorValue = String(value._color);
    }

    if (!colorValue) {
      colorValue = '#ff00ff';
    }

    if (typeof value === 'object' && value !== null && 'opacity' in value) {
      opacityValue = value.opacity as number;
    } else if (t.currentColorOpacity !== undefined) {
      opacityValue = t.currentColorOpacity as number;
    }
  }

  return {
    color: colorValue,
    ...(typeof opacityValue === 'number' && { opacity: opacityValue }),
  };
}

// 通用的 gradient stops 转换
function mapGradientStops(gradientArray: Array<Record<string, unknown>>): Array<{ color: string; position: unknown }> {
  return gradientArray.map((stop) => ({
    color: hexToSketchColor(String(stop.color)),
    position: stop.position,
  }));
}

// 主转换函数
export const sketchFormat: Format = {
  name: 'wave/sketch',
  format: ({ dictionary }: { dictionary: Dictionary }) => {
    const colorGroup: Record<string, string> = {};
    const styleGroup: Record<string, Record<string, unknown>> = {};
    const componentGroup: Record<string, Record<string, unknown>> = {};

    // 按 _order 排序保持原始顺序
    const sortedTokens = [...dictionary.allTokens].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0)
    );

    for (const token of sortedTokens) {
      const tokenValue = token.$value ?? token.value;
      if (tokenValue === undefined) continue;

      const path = token.path;
      if (path.length < 3) continue;

      // 检查是否是 component composite 子 token
      const t = token as unknown as Record<string, unknown>;
      const compositePath = t._composite as string | undefined;
      if (compositePath && compositePath.startsWith('component.')) {
        const componentKey = compositePath.slice('component.'.length).replace(/\./g, '-');
        if (!componentGroup[componentKey]) {
          componentGroup[componentKey] = {};
        }
        const componentObj = componentGroup[componentKey];
        const propKey = path[path.length - 1];
        const tokenType = token.type || token.$type;

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
            const { color, opacity } = resolveSketchColor(token, sortedTokens);
            componentObj.fills = [
              {
                fillType: 'Color',
                color: opacity !== undefined ? applyOpacityToHex(color, opacity) : hexToSketchColor(color),
                enabled: true,
                blendingMode: 'Normal',
              },
            ];
          }
        } else if (propKey === 'foreground' || propKey === 'color') {
          const { color, opacity } = resolveSketchColor(token, sortedTokens);
          componentObj.textColor = opacity !== undefined ? applyOpacityToHex(color, opacity) : hexToSketchColor(color);
        } else if (propKey === 'border') {
          const { color, opacity } = resolveSketchColor(token, sortedTokens);
          componentObj.borders = [
            {
              fillType: 'Color',
              color: opacity !== undefined ? applyOpacityToHex(color, opacity) : hexToSketchColor(color),
              position: 'Inside',
              thickness: 1,
              enabled: true,
              blendingMode: 'Normal',
              hasIndividualSides: false,
              sides: { left: 1, top: 1, right: 1, bottom: 1 },
            },
          ];
        } else if (propKey === 'radius' || propKey === 'border-radius') {
          const radiusValue = typeof tokenValue === 'string' ? parseFloat(tokenValue) : (typeof tokenValue === 'number' ? tokenValue : NaN);
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
          componentObj.shadows = shadowArray.reverse().map((layer) => ({
            ...processShadowLayer(layer),
            enabled: true,
            isInnerShadow: false,
            blendingMode: 'Normal',
          }));
        } else {
          // 其他未知属性原样保留（清理内部字段后）
          componentObj[propKey] = tokenValue;
        }

        continue;
      }

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
          const { color, opacity } = resolveSketchColor(token, sortedTokens);
          const result: Record<string, unknown> = {
            color: hexToSketchColor(color)
          };

          if (typeof opacity === 'number') {
            result.opacity = opacity;
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
    if (Object.keys(componentGroup).length > 0) {
      result.component = componentGroup;
    }

    return JSON.stringify(result, null, 2);
  },
};

export default sketchFormat;
