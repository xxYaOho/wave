import type { DetectionResult } from '../../types/index.ts';

/**
 * 检测主题目录中的变体文件
 *
 * @param _themeDir - legacy placeholder until profile generation replaces variants
 * @param _options - legacy placeholder until profile generation replaces variants
 * @returns DetectionResult - 检测结果
 *
 * 行为说明:
 * - Variant CLI options have been removed.
 * - This detector temporarily keeps legacy auto-discovery compiling until the
 *   profile resolver replaces it.
 */
export function detectVariants(
	_themeDir: string,
	_options?: unknown,
): DetectionResult {
	return {
		available: false,
		files: [],
		message: 'Variants: skipped (variant CLI removed)',
	};
}
