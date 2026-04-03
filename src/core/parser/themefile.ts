import type { ParsedThemefile, ParseError, ResourceDeclaration } from '../../types/index.ts';

export function parseThemefile(content: string): ParsedThemefile | ParseError {
  const result: Partial<ParsedThemefile> = {
    PARAMETER: {},
    resources: []
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

        // CQ-004: Validate RESOURCE kind
        const validKinds = ['palette', 'dimension', 'custom'] as const;
        if (!validKinds.includes(kind as typeof validKinds[number])) {
          return {
            line: lineNum,
            message: `Invalid RESOURCE kind: "${kind}". Valid kinds are: ${validKinds.join(', ')}`
          };
        }

        result.resources!.push({ kind, ref } as ResourceDeclaration);
        continue;
      }

      if (key === 'PARAMETER') {
        const paramMatch = value.match(/^(\w+)\s+(.+)$/);
        if (paramMatch && paramMatch[1] && paramMatch[2]) {
          const paramKey = paramMatch[1];
          const paramValue = paramMatch[2];
          const validParams = ['night', 'variants', 'output', 'platform', 'brand', 'filterLayer', 'colorSpace'] as const;
          type ValidParam = typeof validParams[number];
          if (validParams.includes(paramKey as ValidParam)) {
            (result.PARAMETER as Record<string, string>)[paramKey] = paramValue;
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

  // Validation: require THEME
  if (!result.THEME || result.THEME.trim() === '') {
    return {
      line: 0,
      message: 'Missing required directive: THEME'
    };
  }

  // Validation: require at least one RESOURCE
  if (!result.resources || result.resources.length === 0) {
    return {
      line: 0,
      message: 'Missing required RESOURCE declarations. At least one RESOURCE is required.'
    };
  }

  return result as ParsedThemefile;
}
