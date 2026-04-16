import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import { VERSION } from '../../config/index.ts';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../core/pipeline/theme-service.ts';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

interface ThemeCommandOptions {
	file?: string;
	night?: boolean;
	noVariants?: boolean;
	variants?: string | boolean;
	init?: boolean;
	output?: string;
	platform?: string;
}

// Template files embedded for standalone binary distribution
const TEMPLATE_THEMEFILE = `THEME example
RESOURCE palette tailwindcss4
RESOURCE dimension wave

PARAMETER output ./build
PARAMETER platform json,css
PARAMETER colorSpace oklch
`;

const TEMPLATE_MAIN_YAML = `theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"
`;

const TEMPLATE_MANUAL_MD = `# Wave Theme 使用手册

## themefile 配置

### 基本结构

\`\`\`
THEME <主题名称>
RESOURCE palette <调色板名称>
RESOURCE dimension <尺寸系统名称>

PARAMETER output <输出目录>
PARAMETER platform <输出格式>
PARAMETER colorSpace <颜色空间>
\`\`\`

### 参数说明

#### THEME
- **说明**: 定义主题名称
- **示例**: \`THEME my-brand\`

#### RESOURCE palette
- **说明**: 指定调色板资源
- **可选值**: \`tailwindcss4\`, \`leonardo\`, 或自定义路径

#### RESOURCE dimension
- **说明**: 指定尺寸系统资源
- **可选值**: \`wave\` 或自定义路径

#### PARAMETER output
- **说明**: 指定生成文件的输出目录
- **示例**: \`PARAMETER output ./dist\`
- **默认值**: \`~/Downloads/<THEME>\`

#### PARAMETER platform
- **说明**: 指定输出平台格式，多个格式用逗号分隔
- **可选值**: \`json\`, \`jsonc\`, \`css\`
- **示例**: \`PARAMETER platform json,css\`
- **默认值**: \`json\`

#### PARAMETER colorSpace
- **说明**: 指定颜色输出空间
- **可选值**: \`hex\`, \`oklch\`, \`srgb\`, \`hsl\`
- **示例**: \`PARAMETER colorSpace oklch\`
- **默认值**: \`hex\`

---

## main.yaml 编写

### 基本结构

\`\`\`yaml
theme:
  color:
    $type: color
    primary:
      $value: "{tailwindcss4.color.indigo.600}"

  dimension:
    $type: dimension
    spacing:
      sm:
        $value: "{wave.spacing.1}"
\`\`\`

### 引用语法

使用花括号 \`{namespace.path.to.token}\` 引用 RESOURCE 定义的资源。

---

## 高级功能

### Night 模式

创建 \`main@night.yaml\` 文件定义夜间模式颜色。

### Variants（变体主题）

在同一目录下创建额外的 YAML 文件作为变体主题。

---

## 示例

\`\`\`bash
# 生成主题
wave theme my-brand

# 指定 themefile 路径
wave theme -f ./path/to/themefile
\`\`\`
`;

function parseCliOptions(options: ThemeCommandOptions): GenerateOptions {
	const result: GenerateOptions = {
		night: options.night !== false,
	};

	if (options.noVariants === true) {
		result.variants = [];
	} else if (options.variants === false) {
		result.variants = [];
	} else if (options.variants === undefined || options.variants === true) {
		result.variants = undefined;
	} else if (typeof options.variants === 'string') {
		result.variants = options.variants
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	return result;
}

async function initThemeTemplate(): Promise<boolean> {
	const cwd = process.cwd();
	const themefilePath = path.join(cwd, 'themefile');

	// Check if themefile already exists
	try {
		await fs.access(themefilePath);
		logger.error('A themefile already exists in the current directory');
		process.exitCode = ExitCode.GENERAL_ERROR;
		return false;
	} catch {
		// File doesn't exist, proceed
	}

	const files = [
		{ name: 'themefile', content: TEMPLATE_THEMEFILE },
		{ name: 'main.yaml', content: TEMPLATE_MAIN_YAML },
		{ name: 'manual.md', content: TEMPLATE_MANUAL_MD },
	];

	try {
		for (const { name, content } of files) {
			const destPath = path.join(cwd, name);
			await fs.writeFile(destPath, content, 'utf-8');
			logger.success(`Created: ${name}`);
		}

		logger.info('');
		logger.success('Theme template initialized successfully!');
		logger.info('');
		logger.info('Next steps:');
		logger.info('  1. Edit themefile to configure your theme');
		logger.info('  2. Edit main.yaml to define your tokens');
		logger.info('  3. See manual.md for detailed usage');
		logger.info('  4. Run "wave theme" to generate tokens');
		return true;
	} catch (err) {
		logger.error(
			`Failed to initialize template: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exitCode = ExitCode.GENERAL_ERROR;
		return false;
	}
}

// CQ-007: CLI is now a thin shell over the core theme service
// All orchestration logic has been moved to theme-service.ts
export const themeCommand = new Command('theme')
	.description('Generate theme tokens')
	.argument('[name]', 'Theme name to generate')
	.option('-f, --file <path>', 'Themefile path')
	.option('--no-night', 'Disable night mode generation')
	.option('--no-variants', 'Disable variants generation')
	.option('--variants [names]', 'Specify variants (comma separated)')
	.option('--init', 'Create theme template in current directory')
	.option('-o, --output <dir>', 'Output directory')
	.option(
		'--platform <list>',
		'Output platforms (comma separated): json, jsonc, css',
	)
	.action(async (name: string | undefined, options: ThemeCommandOptions) => {
		if (options.init) {
			const success = await initThemeTemplate();
			if (success) {
				process.exitCode = ExitCode.SUCCESS;
			}
			return;
		}

		let themeName = name;

		if (!themeName && !options.file) {
			const defaultThemefile = 'themefile';
			const file = Bun.file(defaultThemefile);
			if (await file.exists()) {
				options.file = defaultThemefile;
				themeName = 'theme';
			} else {
				console.error('Error: No themefile found in current directory');
				console.error('Usage: wave theme [path] or wave theme -f <path>');
				console.error('Run "wave theme --init" to create a theme template');
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}
		}

		if (!themeName && options.file) {
			themeName = 'theme';
		}

		if (!themeName) {
			console.error('Error: Theme name is required');
			console.error('Usage: wave theme [path] or wave theme -f <path>');
			process.exitCode = ExitCode.MISSING_PARAMETER;
			return;
		}

		logger.info(`Generating theme: ${themeName}`);
		logger.info(`Version: ${VERSION}`);

		// Use the core theme service for generation
		const input: ThemeGenerationInput = {
			themeName,
			themePath: options.file,
			cliOutput: options.output,
			cliPlatform: options.platform,
			generateOptions: parseCliOptions(options),
		};

		const result = await generateTheme(input);

		if (!result.ok) {
			process.exitCode = result.exitCode;
			if (result.line) {
				logger.error(`${result.message} at line ${result.line}`);
			} else {
				logger.error(result.message);
			}
			return;
		}

		process.exitCode = ExitCode.SUCCESS;
	});
