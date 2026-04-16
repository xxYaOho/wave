import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DetectionResult, GenerateOptions } from '../../types/index.ts';

/**
 * 检测主题目录中的变体文件
 *
 * @param themeDir - 主题目录路径
 * @param options - 生成选项，包含 variants 参数
 * @returns DetectionResult - 检测结果
 *
 * 行为说明:
 * - options.variants === undefined: 自动检测 (扫描 variants/ 目录)
 * - options.variants === []: 自动检测 (空数组等同于 auto)
 * - options.variants === ['dark', 'matrix']: 仅使用指定的变体
 */
export function detectVariants(
	themeDir: string,
	options: GenerateOptions,
): DetectionResult {
	const variantsDir = path.join(themeDir, 'variants');

	if (options.variants !== undefined) {
		if (options.variants.length === 0) {
			return {
				available: false,
				files: [],
				message: 'ℹ Variants: disabled by --no-variants',
			};
		}

		const files = options.variants.map((name) =>
			path.join(variantsDir, `${name}.yaml`),
		);

		return {
			available: true,
			files,
			message: `Variants: specified (${options.variants.join(', ')})`,
		};
	}

	if (!fs.existsSync(variantsDir)) {
		return {
			available: false,
			files: [],
			message: 'Variants: skipped (variants/ directory not found)',
		};
	}

	const yamlFiles = fs
		.readdirSync(variantsDir)
		.filter((f) => f.endsWith('.yaml'));

	if (yamlFiles.length === 0) {
		return {
			available: false,
			files: [],
			message: 'Variants: skipped (no .yaml files in variants/)',
		};
	}

	const files = yamlFiles.map((f) => path.join(variantsDir, f));
	const variantNames = yamlFiles.map((f) => path.basename(f, '.yaml'));

	return {
		available: true,
		files,
		message: `Variants: enabled (${variantNames.length} found: ${variantNames.join(', ')})`,
	};
}
