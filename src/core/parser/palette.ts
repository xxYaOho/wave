import * as yaml from 'js-yaml';
import type { PaletteResult, ParseError, ColorPalette } from '../../types';

// Simple schema validation without external dependencies
function validatePaletteStructure(parsed: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Filter out $schema key if present
  const paletteKeys = Object.keys(parsed).filter((key) => key !== '$schema');

  if (paletteKeys.length === 0) {
    errors.push('YAML file must contain a palette name');
    return errors;
  }

  const paletteName = paletteKeys[0];
  if (!paletteName) {
    errors.push('Palette name is empty');
    return errors;
  }

  const paletteData = parsed[paletteName];

  if (!paletteData || typeof paletteData !== 'object') {
    errors.push(`Palette "${paletteName}" data format is invalid`);
    return errors;
  }

  const paletteObj = paletteData as Record<string, unknown>;

  if (!('global' in paletteObj) || typeof paletteObj.global !== 'object') {
    errors.push('Missing required "global" configuration');
    return errors;
  }

  const global = paletteObj.global as Record<string, unknown>;

  if (!('color' in global) || typeof global.color !== 'object') {
    errors.push('Missing required "global.color" configuration');
    return errors;
  }

  const color = global.color as Record<string, unknown>;

  if (!('$type' in color) || typeof color.$type !== 'string') {
    errors.push('Missing required "$type" field or invalid type');
    return errors;
  }

  return errors;
}

export async function validatePaletteSchema(
  content: string,
  _resourcePath?: string
): Promise<ParseError | null> {
  try {
    const parsed = yaml.load(content) as Record<string, unknown>;

    if (parsed && typeof parsed === 'object' && '$schema' in parsed) {
      const schemaUri = parsed.$schema;

      if (
        typeof schemaUri === 'string' &&
        (schemaUri.includes('palette') || schemaUri === 'https://wave.tools/schemas/palette.json')
      ) {
        const errors = validatePaletteStructure(parsed as Record<string, unknown>);

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

export function parsePalette(content: string): PaletteResult | ParseError {
  try {
    const parsed = yaml.load(content) as Record<string, unknown>;
    
    if (!parsed || typeof parsed !== 'object') {
      return {
        line: 1,
        message: '无效的 YAML 格式：内容为空或不是对象'
      };
    }

    // Filter out $schema key if present
    const paletteKeys = Object.keys(parsed).filter((key) => key !== '$schema');

    if (paletteKeys.length === 0) {
      return {
        line: 1,
        message: 'YAML 文件必须包含色板名称'
      };
    }

    const paletteName = paletteKeys[0];
    if (!paletteName) {
      return {
        line: 1,
        message: 'YAML 文件必须包含色板名称'
      };
    }
    const paletteData = parsed[paletteName] as Record<string, unknown>;

    if (!paletteData || typeof paletteData !== 'object') {
      return {
        line: 1,
        message: `色板 "${paletteName}" 的数据格式无效`
      };
    }

    const global = paletteData.global as Record<string, unknown>;
    if (!global || typeof global !== 'object') {
      return {
        line: 2,
        message: '缺少必需的 "global" 配置'
      };
    }

    const color = global.color as Record<string, unknown>;
    if (!color || typeof color !== 'object') {
      return {
        line: 3,
        message: '缺少必需的 "global.color" 配置'
      };
    }

    const typeValue = color.$type;
    if (!typeValue || typeof typeValue !== 'string') {
      return {
        line: 4,
        message: '缺少必需的 "$type" 字段或类型无效'
      };
    }

    const result: PaletteResult = {
      name: paletteName,
      global: {
        color: color as ColorPalette
      }
    };

    return result;

  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      return {
        line: error.mark?.line ? error.mark.line + 1 : 1,
        message: `YAML 语法错误: ${error.message}`
      };
    }

    return {
      line: 1,
      message: `解析错误: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}