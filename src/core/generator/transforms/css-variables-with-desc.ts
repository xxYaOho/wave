import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';
import { shadowToCss, gradientToCss } from './css-var.ts';

export interface CssVariablesWithDescOptions {
  filterLayer?: number;
}

function getFilteredName(token: TransformedToken, filterLayer: number): string {
  const path = token.path;
  if (filterLayer <= 0 || path.length <= filterLayer) {
    return token.name;
  }
  return path.slice(filterLayer).join('-');
}

function isShadowToken(token: TransformedToken): boolean {
  return token.type === 'shadow' || token.$type === 'shadow';
}

function isGradientToken(token: TransformedToken): boolean {
  return token.type === 'gradient' || token.$type === 'gradient';
}

function formatTokenValue(token: TransformedToken): string {
  const tokenValue = token.$value ?? token.value;

  if (isShadowToken(token) && Array.isArray(tokenValue)) {
    return shadowToCss(tokenValue);
  }

  if (isGradientToken(token) && Array.isArray(tokenValue)) {
    return gradientToCss(tokenValue);
  }

  return String(tokenValue);
}

function formatCssVariables(
  tokens: TransformedToken[],
  filterLayer: number = 0
): string {
  const lines: string[] = [':root {'];

  const sortedTokens = [...tokens].sort((a, b) => a.name.localeCompare(b.name));

  for (const token of sortedTokens) {
    const key = getFilteredName(token, filterLayer);
    const cssValue = formatTokenValue(token);

    const description = token.$description || token.description || token.comment;
    if (description && typeof description === 'string' && description !== '~') {
      lines.push(`  /* ${description} */`);
    }

    lines.push(`  --${key}: ${cssValue};`);
  }

  lines.push('}');
  return lines.join('\n');
}

export const cssVariablesWithDescFormat: Format = {
  name: 'wave/css-variables',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;
    return formatCssVariables(dictionary.allTokens, filterLayer);
  },
};

export default cssVariablesWithDescFormat;
