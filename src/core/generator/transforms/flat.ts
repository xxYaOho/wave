import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

export interface FlatFormatOptions {
  filterLayer?: number;
}

function getFilteredName(token: TransformedToken, filterLayer: number): string {
  const path = token.path;
  if (filterLayer <= 0 || path.length <= filterLayer) {
    return token.name;
  }
  return path.slice(filterLayer).join('-');
}

function formatFlatJson(
  tokens: TransformedToken[],
  filterLayer: number = 0
): string {
  const result: Record<string, unknown> = {};
  
  const sortedTokens = [...tokens].sort((a, b) => a.name.localeCompare(b.name));
  
  for (const token of sortedTokens) {
    const key = getFilteredName(token, filterLayer);
    const tokenValue = token.$value ?? token.value;
    result[key] = tokenValue;
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
    
    const sortedTokens = [...tokens].sort((a, b) => a.name.localeCompare(b.name));
    
    for (let i = 0; i < sortedTokens.length; i++) {
      const token = sortedTokens[i];
      if (!token) continue;
      
      const key = getFilteredName(token, filterLayer);
      const tokenValue = token.$value ?? token.value;
      
      const description = token.$description || token.description || token.comment;
      if (description && typeof description === 'string' && description !== '~') {
        lines.push(`  // ${description}`);
      }
      
      const comma = i < sortedTokens.length - 1 ? ',' : '';
      lines.push(`  "${key}": ${JSON.stringify(tokenValue)}${comma}`);
    }
    
    lines.push('}');
    return lines.join('\n');
  },
};

export default flatJsonFormat;
