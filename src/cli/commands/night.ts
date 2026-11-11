import { Command } from 'commander';
import { emitNightOverlay } from '../../core/night/emit.ts';
import { LUMINANCE_EV_LEVELS, NIGHT_SCENES } from '../../core/night/params.ts';
import { ExitCode } from '../../types/index.ts';
import { addOutputOption } from '../options.ts';

interface NightCommandOptions {
	file?: string;
	scene?: string;
	luminance?: string;
	luminanceEv?: string;
	output?: string;
	dryRun?: boolean;
	force?: boolean;
}

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

export function createNightCommand(name = 'night'): Command {
	const command = new Command(name)
		.description('Generate a Night Mode overlay draft from Day')
		.option(
			'-f, --file <path>',
			'Day main/profile YAML or workspace directory. Default: ./main.yaml',
		)
		.option('--dry-run', 'Show the complete creation plan without writing')
		.option('--force', 'Allow overwriting the planned overlay')
		.option('--scene <name>', `Lighting scene (${NIGHT_SCENES.join('|')})`)
		.option(
			'--luminance <n>',
			'Primary Night lightness dial 0..1 (accentMain tone = n×100)',
		)
		.option(
			'--luminance-ev <level>',
			`Named luminance (${LUMINANCE_EV_LEVELS.join('|')})`,
		)
		.option('-m, --manual', 'Print Markdown usage for this command')
		.helpOption('-h, --help', 'Show help')
		.addHelpCommand(false);
	addOutputOption(command, 'Output YAML file');
	return command.action(
		async (_options: NightCommandOptions, command: Command) => {
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
		},
	);
}

export const nightCommand = createNightCommand();
