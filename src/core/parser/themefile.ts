import type { ParsedThemefile, ParseError } from '../../types/index.ts';

export function parseThemefile(content: string): ParsedThemefile | ParseError {
  const result: Partial<ParsedThemefile> = {
    PARAMETER: {}
  };

  const lines = content.split('\n');
  let lineNum = 0;

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

      if (key === 'PALETTE' || key === 'DIMENSION' || key === 'THEME') {
        result[key] = value;
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

  const requiredKeys: (keyof ParsedThemefile)[] = ['PALETTE', 'DIMENSION', 'THEME'];
  for (const key of requiredKeys) {
    if (!result[key]) {
      return {
        line: 0,
        message: `Missing required directive: ${key}`
      };
    }
  }

  if (!result.PARAMETER) {
    result.PARAMETER = {};
  }

  return result as ParsedThemefile;
}