import { Command } from 'commander';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../file-input.ts';
import { VERSION } from '../../config/index.ts';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../core/pipeline/theme-service.ts';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { BuildContext, renderReceipt } from '../../utils/receipt.ts';
import { WaveSpinner } from '../../utils/spinner.ts';

interface DesignTokenBuildOptions {
	file?: string;
	night?: boolean;
	profile?: string;
	profiles?: string;
	out?: string;
	output?: string;
	platform?: string;
}

function parseCliOptions(options: DesignTokenBuildOptions): GenerateOptions {
	const result: GenerateOptions = { night: options.night === true };

	if (options.profile) result.profile = options.profile.trim();
	if (options.profiles !== undefined) {
		const normalized = options.profiles.trim().toLowerCase();
		if (normalized !== 'all') {
			throw new Error('--profiles currently supports only "all"');
		}
		result.profiles = 'all';
	}
	if (result.profile && result.profiles) {
		throw new Error('Use either --profile <name> or --profiles all, not both');
	}

	return result;
}

export function createDesignTokenBuildCommand(name = 'build'): Command {
	return new Command(name)
		.description('Generate design token output')
		.argument('[file]', 'main.yaml path or workspace dir. Default: ./main.yaml')
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
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
			'Output platforms (comma separated): json, jsonc, css, sketch, md-yml',
		)
		.action(
			async (
				positionalFile: string | undefined,
				options: DesignTokenBuildOptions,
			) => {
				const fileInput = resolveExclusiveFileInput(
					positionalFile,
					options.file,
					{
						label: 'design token workspace input',
						hint: 'Use one main.yaml path or run wave dt init.',
					},
				);
				if (!fileInput.ok) {
					console.error(fileInput.message);
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}

				const spinner = new WaveSpinner();
				const ctx = new BuildContext();
				ctx.themeName = 'design-token';
				ctx.version = VERSION;
				const output = options.out ?? options.output;
				ctx.outputDir = output ?? '';

				try {
					const input: ThemeGenerationInput = {
						workspacePath: await expandMainYamlEntry(fileInput.path),
						cliOutput: output,
						cliPlatform: options.platform,
						generateOptions: parseCliOptions(options),
					};
					spinner.start('Generating theme...');
					const result = await generateTheme(input, ctx);
					if (result.ok) ctx.themeName = result.themeName;
					process.exitCode = result.ok ? ExitCode.SUCCESS : result.exitCode;
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					ctx.markFailed('generate', message, { phase: 'unknown' });
					process.exitCode = ExitCode.GENERAL_ERROR;
				} finally {
					spinner.stop();
					console.log(renderReceipt(ctx));
					if (ctx.errors.length > 0) {
						console.log();
						for (const error of ctx.errors) {
							const detail = error.line
								? `at line ${error.line}`
								: error.detail;
							console.error(`${error.message}${detail ? ` (${detail})` : ''}`);
						}
					}
				}
			},
		);
}
