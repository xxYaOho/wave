import * as yaml from 'js-yaml';
import type { DimensionResult, ParseError, DimensionCategory } from '../../types';

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
    const waveData = parsedRecord.wave;
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