import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';

function formatWithComments(
  tokens: TransformedToken[]
): string {
  const lines: string[] = [];
  lines.push('{');
  
  const sortedTokens = [...tokens].sort((a, b) => a.name.localeCompare(b.name));
  
  for (let i = 0; i < sortedTokens.length; i++) {
    const token = sortedTokens[i];
    if (!token) continue;
    
    const description = token.$description || token.description || token.comment;
    if (description && typeof description === 'string' && description !== '~') {
      lines.push(`  // ${description}`);
    }
    
    const comma = i < sortedTokens.length - 1 ? ',' : '';
    lines.push(`  "${token.name}": ${JSON.stringify(token.value)}${comma}`);
  }
  
  lines.push('}');

  return lines.join('\n');
}

export const jsoncFormat: Format = {
  name: 'wave/jsonc',
  format: ({ dictionary }: { dictionary: Dictionary }) => {
    return formatWithComments(dictionary.allTokens);
  },
};

export default jsoncFormat;
