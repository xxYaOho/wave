import * as path from 'node:path';
import type { DetectionResult, GenerateOptions } from '../../types/index.ts';

/**
 * 检测主题目录是否存在 night 模式文件
 * 
 * @param themeDir - 主题目录路径
 * @param options - 生成选项，包含 night 参数
 * @returns DetectionResult - 检测结果
 * 
 * 行为说明:
 * - options.night === false: 显式禁用 (--no-night)
 * - options.night === true: 自动检测 (默认)
 */
export function detectNightMode(
  themeDir: string,
  options: GenerateOptions
): DetectionResult {
  if (options.night === false) {
    return {
      available: false,
      files: [],
      message: 'Night mode: disabled by --no-night',
    };
  }

  const nightFile = path.join(themeDir, 'main@night.yaml');
  const exists = checkFileExists(nightFile);

  if (exists) {
    return {
      available: true,
      files: [nightFile],
      message: `Night mode: enabled (main@night.yaml found)`,
    };
  }

  return {
    available: false,
    files: [],
    message: 'Night mode: skipped (main@night.yaml not found)',
  };
}

function checkFileExists(filePath: string): boolean {
  try {
    const file = Bun.file(filePath);
    return file.size > 0;
  } catch {
    return false;
  }
}
