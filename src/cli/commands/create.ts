import { Command } from 'commander';
import { VERSION } from '../../config/index.ts';
import {
	detectThemeFiles,
	type ThemeFileEntry,
} from '../../core/doctor/theme-context.ts';
import { loadThemefile } from '../../core/pipeline/theme-pipeline.ts';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../core/pipeline/theme-service.ts';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { BuildContext, renderReceipt } from '../../utils/receipt.ts';
import { WaveSpinner } from '../../utils/spinner.ts';
import { selectThemesToGenerate } from '../theme-multiselect.ts';

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

		const spinner = new WaveSpinner();
		const ctx = new BuildContext();
		ctx.themeName = themeName;
		ctx.version = VERSION;
		ctx.outputDir = options.output ?? '';

		let selectedThemes: ThemeFileEntry[] | undefined;
		if (
			process.stdout.isTTY === true &&
			options.variants === undefined &&
			options.noVariants !== true
		) {
			try {
				const loadResult = await loadThemefile(options.file);
				if ('parsed' in loadResult) {
					const themeFiles = await detectThemeFiles(loadResult.themeDir);
					if (themeFiles.length > 1) {
						selectedThemes = await selectThemesToGenerate(themeFiles);
					}
				}
			} catch {
				// ignore: error will be handled by generateTheme
			}
		}

		const input: ThemeGenerationInput = {
			themeName,
			themePath: options.file,
			cliOutput: options.output,
			cliPlatform: options.platform,
			generateOptions: parseCliOptions(options),
			selectedThemes,
		};

		try {
			spinner.start('Generating theme...');
			const result = await generateTheme(input, ctx);
			spinner.stop();
			process.exitCode = result.ok ? ExitCode.SUCCESS : result.exitCode;
		} catch (err) {
			spinner.stop();
			const msg = err instanceof Error ? err.message : String(err);
			ctx.markFailed('generate', msg, { phase: 'unknown' });
			process.exitCode = ExitCode.GENERAL_ERROR;
		} finally {
			spinner.stop();
			console.log(renderReceipt(ctx));
		}
	});
