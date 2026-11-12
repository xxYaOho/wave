import type { Command } from 'commander';
import { emitNightOverlay } from '../../core/night/emit.ts';
import { ExitCode } from '../../types/index.ts';

function parseLuminanceOption(
	raw: string | undefined,
	flag: string,
): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isFinite(n)) {
		throw new Error(
			`Invalid ${flag} ${JSON.stringify(raw)}. Expected a number in 0..1`,
		);
	}
	return n;
}

export interface NightCommandOptions {
	file?: string;
	scene?: string;
	luminance?: string;
	luminanceEv?: string;
	output?: string;
	dryRun?: boolean;
	force?: boolean;
}

export function createNightCommandAction() {
	return async (_options: NightCommandOptions, command: Command) => {
		const options = command.optsWithGlobals<NightCommandOptions>();
		let luminance: number | undefined;
		try {
			luminance = parseLuminanceOption(options.luminance, '--luminance');
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = ExitCode.INVALID_PARAMETER;
			return;
		}

		const result = await emitNightOverlay({
			themePath: options.file,
			output: options.output,
			dryRun: options.dryRun,
			force: options.force,
			cli: {
				scene: options.scene,
				luminance,
				luminanceEv: options.luminanceEv,
			},
		});

		if (!result.ok) {
			console.error(result.message);
			process.exitCode = result.exitCode;
			return;
		}

		console.log(
			`Night overlay ${result.dryRun ? `dry run: would ${result.overwrote ? 'overwrite' : 'create'}` : result.overwrote ? 'updated' : 'written'}: ${result.outputPath}`,
		);
		console.log(
			`  scene=${result.params.scene} luminance=${result.params.luminance} (${result.params.luminanceSource}) → accentMain T${Math.round(result.params.luminance * 100)}`,
		);
		console.log(
			`  themeId=${result.themeId} baseId=${result.baseId} mode=${result.mode} roles=${result.mappedCount}`,
		);
		if (result.outputPath !== result.defaultOutputPath) {
			console.log(
				`Move the overlay to ${result.defaultOutputPath} before consuming it.`,
			);
		}
		console.log(
			`Run wave token build -f ${JSON.stringify(result.sourcePath)} --night to consume it${result.outputPath !== result.defaultOutputPath ? ' after moving it' : ''}.`,
		);
		process.exitCode = ExitCode.SUCCESS;
	};
}
