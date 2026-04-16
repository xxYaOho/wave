import { Command } from 'commander';
import { VERSION } from '../../config/index.ts';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../core/pipeline/theme-service.ts';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

interface CreateCommandOptions {
	file?: string;
	night?: boolean;
	noVariants?: boolean;
	variants?: string | boolean;
	output?: string;
	platform?: string;
}

function parseCliOptions(options: CreateCommandOptions): GenerateOptions {
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

export const createCommand = new Command('create')
	.description('Generate design token output')
	.argument('[name]', 'Theme name to generate')
	.option('-f, --file <path>', 'Themefile path')
	.option('--no-night', 'Disable night mode generation')
	.option('--no-variants', 'Disable variants generation')
	.option('--variants [names]', 'Specify variants (comma separated)')
	.option('-o, --output <dir>', 'Output directory')
	.option(
		'--platform <list>',
		'Output platforms (comma separated): json, jsonc, css',
	)
	.action(async (name: string | undefined, options: CreateCommandOptions) => {
		let themeName = name;

		if (!themeName && !options.file) {
			const defaultThemefile = 'themefile';
			const file = Bun.file(defaultThemefile);
			if (await file.exists()) {
				options.file = defaultThemefile;
				themeName = 'theme';
			} else {
				console.error('Error: No themefile found in current directory');
				console.error('Usage: wave create [path] or wave create -f <path>');
				console.error('Run "wave init" to create a theme template');
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}
		}

		if (!themeName && options.file) {
			themeName = 'theme';
		}

		if (!themeName) {
			console.error('Error: Theme name is required');
			console.error('Usage: wave create [path] or wave create -f <path>');
			process.exitCode = ExitCode.MISSING_PARAMETER;
			return;
		}

		logger.info(`Generating theme: ${themeName}`);
		logger.info(`Version: ${VERSION}`);

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
