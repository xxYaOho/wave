import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

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

function formatCssVariables(
  tokens: TransformedToken[],
  filterLayer: number = 0
): string {
  const lines: string[] = [':root {'];

  const sortedTokens = [...tokens].sort((a, b) => a.name.localeCompare(b.name));

  for (const token of sortedTokens) {
    const key = getFilteredName(token, filterLayer);
    const tokenValue = token.$value ?? token.value;

    const description = token.$description || token.description || token.comment;
    if (description && typeof description === 'string' && description !== '~') {
      lines.push(`  /* ${description} */`);
    }

    lines.push(`  --${key}: ${tokenValue};`);
  }

  lines.push('}');
  return lines.join('\n');
}

export const cssVariablesWithDescFormat: Format = {
  name: 'wave/css-variables',
  format: ({ dictionary }: { dictionary: Dictionary }) => {
    return formatCssVariables(dictionary.allTokens, 0);
  },
};

export default cssVariablesWithDescFormat;
