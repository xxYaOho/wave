import * as yaml from 'js-yaml';
import type { DimensionResult, ParseError, DimensionCategory } from '../../types';
import { dimensionSchema } from '../schema/dimension.ts';
import { validateGenericResource } from '../schema/resource.ts';

export async function validateDimensionSchema(
  content: string,
  resourcePath?: string
): Promise<ParseError | null> {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      return {
        line: err.mark?.line ? err.mark.line + 1 : 1,
        message: `YAML syntax error: ${err.message}`,
      };
    }
    return {
      line: 1,
      message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      line: 1,
      message: 'Dimension root must be an object',
    };
  }

  const generic = validateGenericResource(parsed as Record<string, unknown>, resourcePath);
  if (!generic.success) {
    return generic.error;
  }

  const result = dimensionSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return {
      line: 1,
      message: `Dimension validation failed: ${issues.join('; ')}`,
    };
  }

  return null;
}

export function parseDimension(content: string): DimensionResult | ParseError {
  try {
    const parsed = yaml.load(content) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        line: 1,
        message: 'Invalid YAML: Root element must be an object',
      };
    }

    const generic = validateGenericResource(parsed as Record<string, unknown>);
    if (!generic.success) {
      return generic.error;
    }

    const result = dimensionSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      return {
        line: 1,
        message: `Dimension 校验失败: ${issues.join('; ')}`,
      };
    }

    const rootName = generic.namespace;
    const rootData = (parsed as Record<string, unknown>)[rootName] as Record<string, unknown>;
    const dimensionData = rootData.dimension as Record<string, unknown>;

    const resultObj: DimensionResult = {
      name: rootName,
      dimension: {},
    };

    for (const [dimensionKey, dimensionValue] of Object.entries(dimensionData)) {
      if (typeof dimensionValue === 'object' && dimensionValue !== null) {
        resultObj.dimension[dimensionKey] = dimensionValue as DimensionCategory;
      } else {
        return {
          line: 1,
          message: `Invalid dimension item at "${dimensionKey}": Must be an object`,
        };
      }
    }

    return resultObj;
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      return {
        line: error.mark?.line || 0,
        message: `YAML syntax error: ${error.message}`,
      };
    }

    return {
      line: 0,
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
