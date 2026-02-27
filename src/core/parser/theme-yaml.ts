import * as yaml from 'js-yaml';
import type { DtcgTokenGroup, ThemeYamlResult, ParseError } from '../../types';

export function parseThemeYaml(content: string): ThemeYamlResult | ParseError {
  try {
    if (content.trim() === '') {
      return {
        line: 1,
        message: 'YAML 文件为空'
      };
    }

    const parsed = yaml.load(content) as Record<string, unknown>;

    if (!parsed || typeof parsed !== 'object') {
      return {
        line: 1,
        message: '无效的 YAML 格式：内容为空或不是对象'
      };
    }

    const result: ThemeYamlResult = {
      raw: parsed as DtcgTokenGroup
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
