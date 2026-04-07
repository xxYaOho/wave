import type { Transform, TransformedToken } from 'style-dictionary/types';
import { transformTypes } from 'style-dictionary/enums';
import { hexToRgbComponents } from '../../transformer/color-space.ts';

export const valueCssVarTransform: Transform = {
  name: 'wave/value/cssVar',
  type: transformTypes.value,
  transitive: true,
  filter: (token: TransformedToken) => {
    return token.type === 'color' || token.$type === 'color';
  },
  transform: (token: TransformedToken) => {
    const varName = token.path.join('-').toLowerCase();
    return `var(--${varName})`;
  },
};

// 提取数值（支持 number、string 或 {value: number} 对象）
function extractNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  if (typeof val === 'object' && val !== null && 'value' in val) {
    return (val as { value: number }).value;
  }
  return 0;
}

// 将颜色值转换为 rgba() 格式
function colorToRgba(colorVal: unknown): string {
  const colorStr = String(colorVal);
  if (!colorStr.startsWith('#')) {
    return colorStr;
  }

  const components = hexToRgbComponents(colorStr);
  if (!components) return colorStr;

  const { red, green, blue, alpha } = components;
  // 限制 alpha 为 2 位小数
  const alphaRounded = Math.round(alpha * 100) / 100;
  return `rgba(${red}, ${green}, ${blue}, ${alphaRounded})`;
}

// Shadow 转 CSS 字符串
function formatShadowLength(val: unknown): string {
  if (typeof val === 'string') {
    // 清理 px 单位为纯数字（CSS 中数字默认就是 px 逻辑），但保留 rem 等相对单位
    if (val.endsWith('px')) {
      const num = parseFloat(val);
      return isNaN(num) ? val : String(num);
    }
    return val;
  }
  if (typeof val === 'number') return String(Math.round(val));
  return String(val);
}

export function shadowToCss(value: unknown): string {
  if (!Array.isArray(value)) {
    return String(value);
  }

  const layers = value.map((layer: unknown) => {
    if (typeof layer !== 'object' || layer === null) {
      return String(layer);
    }

    const l = layer as Record<string, unknown>;
    const offsetX = formatShadowLength(l.offsetX);
    const offsetY = formatShadowLength(l.offsetY);
    const blur = formatShadowLength(l.blur);
    const spread = formatShadowLength(l.spread);
    const color = colorToRgba(l.color);
    const inset = l.inset === true ? 'inset ' : '';

    return `${inset}${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
  });

  return layers.join(', ');
}

// Gradient 转 CSS 字符串
export function gradientToCss(value: unknown): string {
  if (!Array.isArray(value)) {
    return String(value);
  }

  const stops = value.map((stop: unknown) => {
    if (typeof stop !== 'object' || stop === null) {
      return String(stop);
    }

    const s = stop as Record<string, unknown>;
    const color = colorToRgba(s.color);
    const position = typeof s.position === 'number' ? Math.round(s.position * 100) : 0;

    return `${color} ${position}%`;
  });

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// 检查是否为 shadow 类型
export function isShadowToken(token: TransformedToken): boolean {
  return token.type === 'shadow' || token.$type === 'shadow';
}

// 检查是否为 gradient 类型
export function isGradientToken(token: TransformedToken): boolean {
  return token.type === 'gradient' || token.$type === 'gradient';
}

export default valueCssVarTransform;
