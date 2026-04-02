import type { Format, Dictionary, TransformedToken } from 'style-dictionary/types';
import { shadowToCss, gradientToCss } from './css-var.ts';

export interface CssVariablesWithDescOptions {
  filterLayer?: number;
  groupComments?: Record<string, string>;
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

function getGroupCommentPaths(tokenPath: string[]): string[] {
  const paths: string[] = [];
  // path = ['theme', 'color', 'inverse', 'surface']
  // group paths: 'theme.color.inverse', 'theme.color', 'theme'
  for (let i = 1; i < tokenPath.length; i++) {
    paths.push(tokenPath.slice(0, i).join('.'));
  }
  return paths;
}

function formatCssVariables(
  tokens: TransformedToken[],
  filterLayer: number = 0,
  groupComments: Record<string, string> = {}
): string {
  const lines: string[] = [':root {'];

  // 保持原始顺序（依赖 transformer 注入的 _order）
  const sortedTokens = [...tokens].sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
  const emittedGroups = new Set<string>();

  for (const token of sortedTokens) {
    const key = getFilteredName(token, filterLayer);
    const cssValue = formatTokenValue(token);

    // 输出 group 级别的 description（第一次遇到该 group 的 token 时）
    const groupPaths = getGroupCommentPaths(token.path);
    for (const gp of groupPaths) {
      if (!emittedGroups.has(gp) && groupComments[gp]) {
        const comment = groupComments[gp];
        const isMultiline = comment.includes('\n');
        if (isMultiline) {
          for (const line of comment.split('\n')) {
            lines.push(`  /* ${line} */`);
          }
        } else {
          lines.push(`  /* ${comment} */`);
        }
        emittedGroups.add(gp);
      }
    }

    const description = token.$description || token.description || token.comment;
    if (description && typeof description === 'string' && description !== '~') {
      const isMultilineDescription = description.includes('\n');
      if (isMultilineDescription) {
        const descLines = description.split('\n');
        for (const descLine of descLines) {
          lines.push(`  /* ${descLine} */`);
        }
        lines.push(`  --${key}: ${cssValue};`);
      } else {
        lines.push(`  --${key}: ${cssValue}; /* ${description} */`);
      }
    } else {
      lines.push(`  --${key}: ${cssValue};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

export const cssVariablesWithDescFormat: Format = {
  name: 'wave/css-variables',
  format: ({ dictionary, options }: { dictionary: Dictionary; options: Record<string, unknown> }) => {
    const filterLayer = (options?.filterLayer as number) ?? 0;
    const groupComments = (options?.groupComments as Record<string, string>) ?? {};
    return formatCssVariables(dictionary.allTokens, filterLayer, groupComments);
  },
};

export default cssVariablesWithDescFormat;
