import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

export interface FlatFormatOptions {
  filterLayer?: number;
}

// 清理 shadow 中的 px 单位（rem 等相对单位保留）
export function cleanShadowZeroPx(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((layer: unknown) => {
    if (typeof layer !== 'object' || layer === null) {
      return layer;
    }

    const l = layer as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(l)) {
      if (key === 'color') {
        cleaned[key] = val;
      } else if (typeof val === 'string' && val.endsWith('px')) {
        // 清理 px 单位转为数字
        const num = parseFloat(val);
        cleaned[key] = isNaN(num) ? val : num;
      } else if (typeof val === 'number' && val === 0) {
        cleaned[key] = 0;
      } else {
        cleaned[key] = val;
      }
    }

    return cleaned;
  });
}

function getFilteredName(token: TransformedToken, filterLayer: number): string {
  const path = token.path;
  if (filterLayer <= 0 || path.length <= filterLayer) {
    return token.name;
  }
  return path.slice(filterLayer).join('-');
}

// 清理内部字段（以下划线开头的字段）
function cleanInternalFields(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(cleanInternalFields);
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (!key.startsWith('_')) {
      cleaned[key] = cleanInternalFields(val);
    }
  }
  return cleaned;
}

function isShadowToken(token: TransformedToken): boolean {
  return token.type === 'shadow' || token.$type === 'shadow';
}


// Check if token uses inheritColor
function isInheritColorToken(token: TransformedToken): boolean {
  return (token as Record<string, unknown>).inheritColor === true;
}

// Get inheritColor opacity if present
function getInheritColorOpacity(token: TransformedToken): number | undefined {
  return (token as Record<string, unknown>).inheritColorOpacity as number | undefined;
}

// Format value for fast-json protocol
function formatInheritColorValue(token: TransformedToken): unknown {
  const opacity = getInheritColorOpacity(token);
  if (typeof opacity === 'number') {
    return { color: '$COLOR_FOREGROUND', opacity };
  }
  return '$COLOR_FOREGROUND';
}

function formatFlatJson(
  tokens: TransformedToken[],
  filterLayer: number = 0
): string {
  const result: Record<string, unknown> = {};
  // 收集 composite groups
  const compositeGroups: Record<string, Record<string, unknown>> = {};

  for (const token of tokens) {
    const tokenRecord = token as Record<string, unknown>;
    const compositePath = tokenRecord._composite as string | undefined;

    let tokenValue: unknown;

    // Handle inheritColor tokens
    if (isInheritColorToken(token)) {
      tokenValue = formatInheritColorValue(token);
    } else {
      tokenValue = token.value ?? token.$value;

      // 对 shadow 类型清理 0px
      if (isShadowToken(token)) {
        tokenValue = cleanShadowZeroPx(tokenValue);
      }

      // 清理内部字段
      tokenValue = cleanInternalFields(tokenValue);
    }

    if (compositePath) {
      // 属于 composite group：用属性名作为 key，不使用 flat name
      const path = token.path;
      const propKey = path[path.length - 1]; // 最后一段是属性名（fill, border, radius）
      if (!compositeGroups[compositePath]) {
        compositeGroups[compositePath] = {};
      }
      compositeGroups[compositePath][propKey] = tokenValue;
    } else {
      const key = getFilteredName(token, filterLayer);
      result[key] = tokenValue;
    }
  }

  // 将 composite groups 合并到 result
  for (const [compositePath, compositeObj] of Object.entries(compositeGroups)) {
    const key = compositePath.split('.').slice(filterLayer).join('-');
    result[key] = compositeObj;
  }

  return JSON.stringify(result, null, 2);
}

export const flatJsonFormat: Format = {
  name: 'wave/flat-json',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;
    return formatFlatJson(dictionary.allTokens, filterLayer);
  },
};

export const flatJsoncFormat: Format = {
  name: 'wave/flat-jsonc',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;
    const tokens = dictionary.allTokens;
    const lines: string[] = ['{'];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;

      const key = getFilteredName(token, filterLayer);
      let tokenValue: unknown;

      // Handle inheritColor tokens
      if (isInheritColorToken(token)) {
        tokenValue = formatInheritColorValue(token);
      } else {
        tokenValue = token.value ?? token.$value;

        // 对 shadow 类型清理 0px
        if (isShadowToken(token)) {
          tokenValue = cleanShadowZeroPx(tokenValue);
        }

        // 清理内部字段
        tokenValue = cleanInternalFields(tokenValue);
      }

      const description = token.$description || token.description || token.comment;
      const isMultilineDescription = description && typeof description === 'string' && description.includes('\n');
      const comma = i < tokens.length - 1 ? ',' : '';
      
      if (description && typeof description === 'string' && description !== '~') {
        if (isMultilineDescription) {
          const descLines = description.split('\n');
          for (const descLine of descLines) {
            lines.push(`  // ${descLine}`);
          }
          lines.push(`  "${key}": ${JSON.stringify(tokenValue)}${comma}`);
        } else {
          lines.push(`  "${key}": ${JSON.stringify(tokenValue)}${comma} // ${description}`);
        }
      } else {
        lines.push(`  "${key}": ${JSON.stringify(tokenValue)}${comma}`);
      }
    }
    
    lines.push('}');
    return lines.join('\n');
  },
};

export default flatJsonFormat;
