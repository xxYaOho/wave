import type { Command } from 'commander';
import { VERSION } from '../../config/index.ts';
import {
	generateTheme,
	type ThemeGenerationInput,
} from '../../core/pipeline/theme-service.ts';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { BuildContext, renderReceipt } from '../../utils/receipt.ts';
import { WaveSpinner } from '../../utils/spinner.ts';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../file-input.ts';

function parseCliOptions(options: DesignTokenBuildOptions): GenerateOptions {
	const result: GenerateOptions = { night: options.night === true };

	if (options.profiles !== undefined) {
		const normalized = options.profiles.trim().toLowerCase();
		if (normalized !== 'all') {
			throw new Error('--profiles currently supports only "all"');
		}
		result.profiles = 'all';
	}
	return result;
}

export async function runDesignTokenBuild(
	options: DesignTokenBuildOptions,
): Promise<void> {
	const fileInput = resolveExclusiveFileInput(undefined, options.file, {
		label: 'design token workspace input',
		hint: 'Use -f <main.yaml> or run wave token new.',
	});
	if (!fileInput.ok) {
		console.error(fileInput.message);
		process.exitCode = ExitCode.INVALID_PARAMETER;
		return;
	}

	const spinner = new WaveSpinner();
	const ctx = new BuildContext();
	ctx.themeName = 'design-token';
	ctx.version = VERSION;
	const output = options.output;
	ctx.outputDir = output ?? '';

	try {
		const input: ThemeGenerationInput = {
			workspacePath: await expandMainYamlEntry(fileInput.path),
			cliOutput: output,
			generateOptions: parseCliOptions(options),
		};
		spinner.start('Generating theme...');
		const result = await generateTheme(input, ctx);
		if (result.ok) ctx.themeName = result.themeName;
		process.exitCode = result.ok ? ExitCode.SUCCESS : result.exitCode;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.markFailed('generate', message, { phase: 'unknown' });
		process.exitCode = ExitCode.GENERAL_ERROR;
	} finally {
		spinner.stop();
		console.log(renderReceipt(ctx));
		if (ctx.errors.length > 0) {
			console.log();
			for (const error of ctx.errors) {
				const detail = error.line ? `at line ${error.line}` : error.detail;
				console.error(`${error.message}${detail ? ` (${detail})` : ''}`);
			}
		}
	}
}

export interface DesignTokenBuildOptions {
	file?: string;
	manual?: boolean;
	night?: boolean;
	profiles?: string;
	output?: string;
}

export function createDesignTokenBuildCommandAction() {
	return async (options: DesignTokenBuildOptions, command: Command) => {
		const parentOptions = command.parent?.opts() as
			| DesignTokenBuildOptions
			| undefined;
		await runDesignTokenBuild({ ...parentOptions, ...options });
	};
}
