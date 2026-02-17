import * as yaml from 'js-yaml';
import type { PaletteResult, ParseError, ColorPalette } from '../../types';

export function parsePalette(content: string): PaletteResult | ParseError {
  try {
    const parsed = yaml.load(content) as Record<string, unknown>;
    
    if (!parsed || typeof parsed !== 'object') {
      return {
        line: 1,
        message: '无效的 YAML 格式：内容为空或不是对象'
      };
    }

    const paletteKeys = Object.keys(parsed);
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