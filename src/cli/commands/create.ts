import { Command } from 'commander';
import { VERSION } from '../../config/index.ts';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../core/pipeline/theme-service.ts';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { BuildContext, renderReceipt } from '../../utils/receipt.ts';
import { WaveSpinner } from '../../utils/spinner.ts';

interface CreateCommandOptions {
	file?: string;
	night?: boolean;
	profile?: string;
	profiles?: string;
	out?: string;
	output?: string;
	platform?: string;
}

interface BuildCommandConfig {
	defaultFile?: string;
	fileHelp?: string;
	missingFileHelp?: string[];
}

function parseCliOptions(options: CreateCommandOptions): GenerateOptions {
	const result: GenerateOptions = {
		night: options.night === true,
	};

	if (options.profile) {
		result.profile = options.profile.trim();
	}

	if (options.profiles !== undefined) {
		const normalized = options.profiles.trim().toLowerCase();
		if (normalized === 'all') {
			result.profiles = 'all';
		} else {
			throw new Error('--profiles currently supports only "all"');
		}
	}

	if (result.profile && result.profiles) {
		throw new Error('Use either --profile <name> or --profiles all, not both');
	}

	return result;
}

export function createBuildCommand(
	name = 'create',
	config: BuildCommandConfig = {},
): Command {
	return new Command(name)
		.description('Generate design token output')
		.argument('[name]', 'Theme name to generate')
		.option('-f, --file <path>', config.fileHelp ?? 'Themefile path')
		.option(
			'--profile <name>',
			'Build one named profile from profiles/<name>.yaml',
		)
		.option('--profiles <mode>', 'Build profile set. Supported: all')
		.option('--night', 'Include valid Night Mode overlays when available')
		.option('-o, --out <path>', 'Output directory')
		.option('--output <dir>', 'Output directory')
		.option(
			'--platform <list>',
			'Output platforms (comma separated): json, jsonc, css',
		)
		.action(async (name: string | undefined, options: CreateCommandOptions) => {
			let themeName = name;
			if (themeName && /\.ya?ml$/i.test(themeName)) {
				options.file = options.file ?? themeName;
				themeName = 'theme';
			}

			if (!themeName && !options.file) {
				const defaultInput = config.defaultFile ?? 'themefile';
				const file = Bun.file(defaultInput);
				if (await file.exists()) {
					options.file = defaultInput;
					themeName = 'theme';
				} else {
					const helpLines = config.missingFileHelp ?? [
						'Error: No themefile found in current directory',
						'Usage: wave create [path] or wave create -f <path>',
						'Run "wave init" to create a theme template',
					];
					for (const line of helpLines) {
						console.error(line);
					}
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
			const output = options.out ?? options.output;
			ctx.outputDir = output ?? '';

			const input: ThemeGenerationInput = {
				themeName,
				themePath: options.file,
				cliOutput: output,
				cliPlatform: options.platform,
				generateOptions: parseCliOptions(options),
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
				if (ctx.errors.length > 0) {
					console.log();
					for (const err of ctx.errors) {
						const detail = err.line ? `at line ${err.line}` : err.detail;
						console.error(`${err.message}${detail ? ` (${detail})` : ''}`);
					}
				}
			}
		});
}

export const createCommand = createBuildCommand('create');
