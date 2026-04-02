import type { ParsedThemefile, ParseError, ResourceDeclaration } from '../../types/index.ts';

export function parseThemefile(content: string): ParsedThemefile | ParseError {
  const result: Partial<ParsedThemefile> = {
    PARAMETER: {}
  };

  const lines = content.split('\n');
  let lineNum = 0;
  let hasLegacyPalette = false;
  let hasLegacyDimension = false;
  let hasResource = false;

  for (const line of lines) {
    lineNum++;
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const keyValueMatch = trimmedLine.match(/^(\w+)\s+(.+)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      if (!value) {
        return {
          line: lineNum,
          message: `Missing value for key: ${key}`
        };
      }

      if (key === 'PALETTE') {
        result.PALETTE = value;
        hasLegacyPalette = true;
        continue;
      }

      if (key === 'DIMENSION') {
        result.DIMENSION = value;
        hasLegacyDimension = true;
        continue;
      }

      if (key === 'THEME') {
        result.THEME = value;
        continue;
      }

      if (key === 'RESOURCE') {
        const resourceMatch = value.match(/^(\S+)\s+(.+)$/);
        if (!resourceMatch || !resourceMatch[1] || !resourceMatch[2]) {
          return {
            line: lineNum,
            message: `Invalid RESOURCE format: ${trimmedLine}. Expected: RESOURCE <kind> <ref>`
          };
        }
        const [, kind, ref] = resourceMatch;
        if (!result.resources) {
          result.resources = [];
        }
        result.resources.push({ kind, ref } as ResourceDeclaration);
        hasResource = true;
        continue;
      }

      if (key === 'PARAMETER') {
        const paramMatch = value.match(/^([\w-]+)\s+(.+)$/);
        if (paramMatch && paramMatch[1] && paramMatch[2]) {
          const paramKey = paramMatch[1];
          const paramValue = paramMatch[2];
          if (!result.PARAMETER) {
            result.PARAMETER = {};
          }
            const validParams = ['night', 'variants', 'output', 'platform', 'brand', 'filter-layer', 'filterLayer', 'colorSpace'] as const;
          type ValidParam = typeof validParams[number];
          if (validParams.includes(paramKey as ValidParam)) {
            const internalKey = paramKey === 'filter-layer' || paramKey === 'filterLayer' ? 'filterLayer' : paramKey;
            (result.PARAMETER as Record<string, string>)[internalKey] = paramValue;
          }
        } else {
          return {
            line: lineNum,
            message: `Invalid PARAMETER format: ${trimmedLine}`
          };
        }
        continue;
      }

      return {
        line: lineNum,
        message: `Unknown directive: ${key}`
      };
    } else {
      return {
        line: lineNum,
        message: `Invalid line format: ${trimmedLine}`
      };
    }
  }

  if (hasResource && (hasLegacyPalette || hasLegacyDimension)) {
    return {
      line: 0,
      message: 'Cannot mix RESOURCE with legacy PALETTE/DIMENSION directives'
    };
  }

  if (result.resources && result.resources.length > 0) {
    const hasTheme = result.THEME && result.THEME.trim() !== '';
    if (!hasTheme) {
      return {
        line: 0,
        message: 'Missing required directive: THEME'
      };
    }
  } else {
    const requiredLegacyKeys: (keyof ParsedThemefile)[] = ['PALETTE', 'DIMENSION', 'THEME'];
    for (const key of requiredLegacyKeys) {
      if (!result[key]) {
        return {
          line: 0,
          message: `Missing required directive: ${key}`
        };
      }
    }
  }

  if (!result.PARAMETER) {
    result.PARAMETER = {};
  }

  return result as ParsedThemefile;
}
