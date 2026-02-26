import * as yaml from 'js-yaml';
import type { DimensionResult, ParseError, DimensionCategory } from '../../types';

function validateDimensionStructure(parsed: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Filter out $schema key if present
  const rootKeys = Object.keys(parsed).filter((key) => key !== '$schema');

  if (rootKeys.length === 0) {
    errors.push('YAML file must contain a root key (e.g., wave)');
    return errors;
  }

  const rootName = rootKeys[0];
  if (!rootName) {
    errors.push('Root key is empty');
    return errors;
  }

  const rootData = parsed[rootName];

  if (!rootData || typeof rootData !== 'object') {
    errors.push(`Root "${rootName}" data format is invalid`);
    return errors;
  }

  const rootObj = rootData as Record<string, unknown>;

  if (!('global' in rootObj) || typeof rootObj.global !== 'object') {
    errors.push('Missing required "global" configuration');
    return errors;
  }

  const global = rootObj.global as Record<string, unknown>;

  if (!('dimension' in global) || typeof global.dimension !== 'object') {
    errors.push('Missing required "global.dimension" configuration');
    return errors;
  }

  return errors;
}

export async function validateDimensionSchema(
  content: string,
  _resourcePath?: string
): Promise<ParseError | null> {
  try {
    const parsed = yaml.load(content) as Record<string, unknown>;

    if (parsed && typeof parsed === 'object' && '$schema' in parsed) {
      const schemaUri = parsed.$schema;

      if (
        typeof schemaUri === 'string' &&
        (schemaUri.includes('dimension') || schemaUri === 'https://wave.tools/schemas/dimension.json')
      ) {
        const errors = validateDimensionStructure(parsed as Record<string, unknown>);

        if (errors.length > 0) {
          return {
            line: 0,
            message: `Schema validation failed: ${errors.join('; ')}`
          };
        }
      }
    }

    return null;
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      return {
        line: err.mark?.line ? err.mark.line + 1 : 1,
        message: `YAML syntax error: ${err.message}`
      };
    }
    return null;
  }
}

export function parseDimension(content: string): DimensionResult | ParseError {
  try {
    const parsed = yaml.load(content);
    
    if (!parsed || typeof parsed !== 'object') {
      return {
        line: 0,
        message: 'Invalid YAML: Root element must be an object'
      };
    }

    const parsedRecord = parsed as Record<string, unknown>;
    // Filter out $schema key if present
    const rootKeys = Object.keys(parsedRecord).filter((key) => key !== '$schema');
    const waveData = parsedRecord[rootKeys[0] || 'wave'];
    if (!waveData || typeof waveData !== 'object') {
      return {
        line: 1,
        message: 'Invalid dimension structure: Missing "wave" root object'
      };
    }

    const waveRecord = waveData as Record<string, unknown>;
    const globalData = waveRecord.global;
    if (!globalData || typeof globalData !== 'object') {
      return {
        line: 2,
        message: 'Invalid dimension structure: Missing "global" object'
      };
    }

    const globalRecord = globalData as Record<string, unknown>;
    const dimensionData = globalRecord.dimension;
    if (!dimensionData || typeof dimensionData !== 'object') {
      return {
        line: 3,
        message: 'Invalid dimension structure: Missing "dimension" object'
      };
    }

    const result: DimensionResult = {
      name: 'wave',
      global: {
        dimension: {}
      }
    };

    const dimensionObj = dimensionData as Record<string, unknown>;
    for (const [dimensionKey, dimensionValue] of Object.entries(dimensionObj)) {
      if (typeof dimensionValue === 'object' && dimensionValue !== null) {
        result.global.dimension[dimensionKey] = dimensionValue as DimensionCategory;
      } else {
        return {
          line: 0,
          message: `Invalid dimension item at "${dimensionKey}": Must be an object`
        };
      }
    }

    return result;

  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      return {
        line: error.mark?.line || 0,
        message: `YAML syntax error: ${error.message}`
      };
    }

    return {
      line: 0,
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}