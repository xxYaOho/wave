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

// Get inheritColor alpha
function getInheritColorAlpha(token: TransformedToken): number | undefined {
  return (token as Record<string, unknown>).inheritColorAlpha as number | undefined;
}

// Find sibling color token by slot name (legacy, returns color string)
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

// Find sibling token object by slot name (for component colorInfo propagation)
function findSiblingToken(
  tokens: TransformedToken[],
  currentPath: string[],
  siblingSlot: string
): TransformedToken | undefined {
  const parentPath = currentPath.slice(0, -1);
  const siblingPath = [...parentPath, siblingSlot];

  for (const token of tokens) {
    const tokenPath = token.path;
    if (tokenPath.length === siblingPath.length) {
      const match = tokenPath.every((p, i) => p === siblingPath[i]);
      if (match) {
        return token;
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

// 处理 shadow 层（style 分组使用，保持纯 color 字段）
function processShadowLayer(layer: Record<string, unknown>): SketchShadowLayer {
  return {
    x: cleanValue(layer.offsetX as number | string),
    y: cleanValue(layer.offsetY as number | string),
    blur: cleanValue(layer.blur as number | string),
    spread: cleanValue(layer.spread as number | string),
    color: hexToSketchColor(String(layer.color)),
  };
}

// component shadow 层处理，支持 colorInfo
type ComponentShadowLayer = Record<string, unknown>;

function processComponentShadowLayer(layer: Record<string, unknown>): ComponentShadowLayer {
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
  } else if (typeof colorRaw === 'object' && colorRaw !== null && !Array.isArray(colorRaw)) {
    const obj = colorRaw as Record<string, unknown>;
    const innerColor = typeof obj.color === 'string' ? obj.color : String(colorRaw);
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

// 从值对象中提取颜色字符串
function extractColorFromValue(value: unknown): string | undefined {
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
  return undefined;
}

// 解析 Sketch 颜色值（处理 inheritColor、opacity、_color 回退）
function resolveSketchColor(
  token: TransformedToken,
  allTokens: TransformedToken[]
): { color: string; opacity?: number; alpha?: number; swatchName?: string } {
  const path = token.path;
  const tokenValue = token.$value ?? token.value;
  const t = token as unknown as Record<string, unknown>;
  const value = tokenValue as { color?: string; opacity?: number; _color?: string } | string | undefined;

  let colorValue: string | undefined;
  let opacityValue: number | undefined;
  let alphaValue: number | undefined;
  let swatchName: string | undefined;

  if (isInheritColorToken(token)) {
    const siblingSlot = getInheritColorSiblingSlot(token);
    opacityValue = getInheritColorOpacity(token);
    alphaValue = getInheritColorAlpha(token);

    if (siblingSlot) {
      const siblingToken = findSiblingToken(allTokens, path, siblingSlot);
      if (siblingToken) {
        colorValue = extractColorFromValue(siblingToken.$value ?? siblingToken.value);
        swatchName = (siblingToken as Record<string, unknown>)._swatchName as string | undefined;
      }
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

    swatchName = t._swatchName as string | undefined;
  }

  return {
    color: colorValue,
    ...(typeof opacityValue === 'number' && { opacity: opacityValue }),
    ...(typeof alphaValue === 'number' && { alpha: alphaValue }),
    ...(swatchName !== undefined && { swatchName }),
  };
}

// 通用的 gradient stops 转换
function mapGradientStops(gradientArray: Array<Record<string, unknown>>): Array<{ color: string; position: unknown }> {
  return gradientArray.map((stop) => ({
    color: hexToSketchColor(String(stop.color)),
    position: stop.position,
  }));
}

// 为 Sketch 颜色层追加 swatch 关联（仅当有 swatchName 时）
function addSketchSwatch<T extends Record<string, unknown>>(
  base: T,
  swatchName?: string
): T & { swatch?: string } {
  if (!swatchName) return base as T & { swatch?: string };
  return {
    ...base,
    swatch: swatchName,
  };
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
            const { color, opacity, swatchName } = resolveSketchColor(token, sortedTokens);
            const finalColor = opacity !== undefined ? applyOpacityToHex(color, opacity) : hexToSketchColor(color);
            componentObj.fills = [
              addSketchSwatch({
                fillType: 'Color',
                color: finalColor,
                enabled: true,
                blendingMode: 'Normal',
              }, swatchName),
            ];
          }
        } else if (propKey === 'foreground' || propKey === 'color') {
          const { color, opacity, swatchName } = resolveSketchColor(token, sortedTokens);
          const finalColor = opacity !== undefined ? applyOpacityToHex(color, opacity) : hexToSketchColor(color);
          componentObj.textColor = finalColor;
        } else if (propKey === 'border') {
          const { color, opacity, swatchName } = resolveSketchColor(token, sortedTokens);
          const finalColor = opacity !== undefined ? applyOpacityToHex(color, opacity) : hexToSketchColor(color);
          componentObj.borders = [
            addSketchSwatch({
              fillType: 'Color',
              color: finalColor,
              position: 'Inside',
              thickness: 1,
              enabled: true,
              blendingMode: 'Normal',
              hasIndividualSides: false,
              sides: { left: 1, top: 1, right: 1, bottom: 1 },
            }, swatchName),
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
          componentObj.shadows = shadowArray.reverse().map(processComponentShadowLayer);
        } else {
          // 其他未知属性原样保留
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
          const { color, opacity, alpha } = resolveSketchColor(token, sortedTokens);
          const result: Record<string, unknown> = {
            color: hexToSketchColor(color)
          };

          // 添加 opacity 和 alpha（Sketch 支持双字段同时存在）
          if (typeof opacity === 'number') {
            result.opacity = opacity;
          }
          if (typeof alpha === 'number') {
            result.alpha = alpha;
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
