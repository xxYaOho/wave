import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

export interface SketchColorsFormatOptions {
  filterLayer?: number;
}

// Sketch API shadow 结构
interface SketchShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

// Wave shadow 结构
interface WaveShadowLayer {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

function isColorToken(token: TransformedToken): boolean {
  return token.type === 'color' || token.$type === 'color';
}

function isShadowToken(token: TransformedToken): boolean {
  return token.type === 'shadow' || token.$type === 'shadow';
}

function isGradientToken(token: TransformedToken): boolean {
  return token.type === 'gradient' || token.$type === 'gradient';
}

function isBorderToken(token: TransformedToken): boolean {
  return token.type === 'border' || token.$type === 'border';
}

function isOpacityToken(token: TransformedToken): boolean {
  return token.type === 'opacity' || token.$type === 'opacity';
}

function isInteractionToken(token: TransformedToken): boolean {
  const path = token.path;
  return path.length >= 2 && path[0] === 'style' && path[1] === 'interaction';
}

// 将 6位hex 转为 8位hex（添加 alpha）
function hexToSketchColor(hex: string): string {
  // 如果已经是 8位，直接返回
  if (hex.length === 9) return hex;
  // 如果是 6位，添加 ff alpha
  if (hex.length === 7) return `${hex}ff`;
  return hex;
}

// 首字母大写
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// 清理数值（将 "0px" 转为 0，保留 rem 等相对单位）
function cleanValue(val: number | string): number | string {
  if (typeof val === 'string' && val.endsWith('px')) {
    const num = parseFloat(val);
    return isNaN(num) ? val : num;
  }
  return val;
}

// 将 Wave shadow 转换为 Sketch API 格式
function transformShadowToSketchFormat(
  waveShadow: WaveShadowLayer[]
): SketchShadowLayer[] {
  return waveShadow.map((layer) => ({
    x: cleanValue(layer.offsetX),
    y: cleanValue(layer.offsetY),
    blur: cleanValue(layer.blur),
    spread: cleanValue(layer.spread),
    color: hexToSketchColor(layer.color),
  }));
}

// Wave border 结构
interface WaveBorderValue {
  color: string;
  width: number | { value: number; unit?: string };
  style?: string;
  position?: 'inside' | 'center' | 'outside';
}

// Sketch API border 结构
interface SketchBorder {
  fillType: 'Color';
  color: string;
  thickness: number;
  position: 'inside' | 'center' | 'outside';
}

// 将 Wave border 转换为 Sketch API 格式
function transformBorderToSketchFormat(waveBorder: WaveBorderValue): SketchBorder {
  const width = typeof waveBorder.width === 'number'
    ? waveBorder.width
    : waveBorder.width.value;

  return {
    fillType: 'Color',
    color: hexToSketchColor(waveBorder.color),
    thickness: width,
    position: capitalize(waveBorder.position || 'center'),
  };
}

// Wave opacity 结构 (0-1 数字或对象)
interface WaveOpacityValue {
  opacity: number;
}

// 提取 opacity 值
function extractOpacity(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'opacity' in value) {
    return (value as WaveOpacityValue).opacity;
  }
  return 1;
}

// 生成扁平键名
function generateFlatKey(path: string[]): string {
  return path.join('-');
}

// 构建嵌套颜色树（保持向后兼容）
function buildNestedTree(
  tokens: TransformedToken[],
  filterLayer: number
): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const token of tokens) {
    if (!isColorToken(token)) {
      continue;
    }

    const tokenValue = token.$value ?? token.value;
    if (tokenValue === undefined) {
      continue;
    }

    const path = token.path;
    const effectivePath = filterLayer > 0 ? path.slice(filterLayer) : path;

    if (effectivePath.length === 0) {
      continue;
    }

    let current: Record<string, unknown> = root;
    for (let i = 0; i < effectivePath.length - 1; i++) {
      const key = effectivePath[i]!;
      if (typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    const lastKey = effectivePath[effectivePath.length - 1]!;
    current[lastKey] = tokenValue;
  }

  return root;
}

// 构建完整的 sketch 格式输出（扁平 + 嵌套混合）
function buildFullSketchOutput(
  tokens: TransformedToken[],
  filterLayer: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const token of tokens) {
    const tokenValue = token.$value ?? token.value;
    if (tokenValue === undefined) {
      continue;
    }

    const path = token.path;
    const effectivePath = filterLayer > 0 ? path.slice(filterLayer) : path;

    if (effectivePath.length === 0) {
      continue;
    }

    const type = effectivePath[0];

    // 颜色：扁平键名，转为 8位hex
    if (type === 'color' && isColorToken(token)) {
      const key = generateFlatKey(effectivePath);
      result[key] = hexToSketchColor(String(tokenValue));
    }
    // border 类型
    else if (isBorderToken(token)) {
      const key = generateFlatKey(effectivePath);
      result[key] = transformBorderToSketchFormat(tokenValue as WaveBorderValue);
    }
    // opacity 类型
    else if (isOpacityToken(token)) {
      const key = generateFlatKey(effectivePath);
      result[key] = extractOpacity(tokenValue);
    }
    // style 命名空间下的令牌
    else if (type === 'style' && effectivePath.length >= 2) {
      const styleType = effectivePath[1];
      const key = generateFlatKey(effectivePath);

      // interaction：保留 opacity 对象结构
      if (styleType === 'interaction') {
        const value = tokenValue as { opacity: number };
        result[key] = { opacity: value.opacity };
      }
      // shadow：通过前缀匹配（如 shadow-1, shadow-2）
      else if (styleType.startsWith('shadow')) {
        // Shadow 值可能是数组（smoothShadow 扩展后）或对象（单层）
        let shadowValue: WaveShadowLayer[];
        if (Array.isArray(tokenValue)) {
          shadowValue = tokenValue as WaveShadowLayer[];
        } else if (typeof tokenValue === 'object' && tokenValue !== null) {
          // 单层 shadow 转换为数组
          shadowValue = [tokenValue as WaveShadowLayer];
        } else {
          shadowValue = [];
        }
        result[key] = transformShadowToSketchFormat(shadowValue);
      }
      // gradient：通过前缀匹配（如 gradient-mask-smooth）
      else if (styleType.startsWith('gradient')) {
        // Gradient 值可能是数组或需要包装为数组
        if (Array.isArray(tokenValue)) {
          result[key] = tokenValue;
        } else if (typeof tokenValue === 'object' && tokenValue !== null) {
          result[key] = [tokenValue];
        }
      }
    }
  }

  return result;
}

// 保留旧的 sketch-colors 格式（仅颜色，嵌套结构）
export const sketchColorsFormat: Format = {
  name: 'wave/sketch-colors',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;

    const sortedTokens = [...dictionary.allTokens].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0)
    );

    const tree = buildNestedTree(sortedTokens, filterLayer);

    return JSON.stringify(tree, null, 2);
  },
};

// 保留的 sketch-colors 格式（仅颜色，嵌套结构）
export const sketchColorsFullFormat: Format = {
  name: 'wave/sketch-colors-full',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;

    const sortedTokens = [...dictionary.allTokens].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0)
    );

    const output = buildFullSketchOutput(sortedTokens, filterLayer);

    return JSON.stringify(output, null, 2);
  },
};

export default sketchColorsFormat;
