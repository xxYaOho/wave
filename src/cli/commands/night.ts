import { Command } from 'commander';
import { emitNightOverlay } from '../../core/night/emit.ts';
import { CHROMA_EV_LEVELS, NIGHT_SCENES } from '../../core/night/params.ts';
import { ExitCode } from '../../types/index.ts';

const NIGHT_HELP = `Wave Night
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Generate a Night overlay draft from a Day theme via pure color-rules.

  Usage:
    wave night [theme]
    wave night [options]

  Arguments:
    theme                Path to main.yaml (default: ./main.yaml)

  Options:
    -f, --file <path>    Path to main.yaml (same as theme argument)
    --scene <name>       Lighting scene: ${NIGHT_SCENES.join(' | ')}
                         Default: night (or $config.night.scene)
    --chroma <n>         Accent chroma dial 0..1 (wins over --chroma-ev)
                         Default: 0.7 (or $config.night.chroma)
    --chroma-ev <level>  Named chroma: ${CHROMA_EV_LEVELS.join(' | ')}
                         → 0.5 / 0.6 / 0.7 / 0.75 / 0.85
    -h, --help           Show help

  Output:
    Writes <stem>@night.yaml beside the theme file (e.g. main@night.yaml).
    Sketch identity for Night builds: themeId=<stem>@night, same baseId as Day.

  Priority:
    --chroma > --chroma-ev > $config.night > defaults (scene=night, chroma=0.7)
`;

interface NightCommandOptions {
	file?: string;
	scene?: string;
	chroma?: string;
	chromaEv?: string;
}

function parseChromaOption(raw: string | undefined): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isFinite(n)) {
		throw new Error(
			`Invalid --chroma ${JSON.stringify(raw)}. Expected a number in 0..1`,
		);
	}
	return n;
}

export function createNightCommand(name = 'night'): Command {
	return new Command(name)
		.description('Generate a Night Mode overlay draft from Day')
		.argument('[theme]', 'main.yaml path. Default: ./main.yaml')
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.option('--scene <name>', `Lighting scene (${NIGHT_SCENES.join('|')})`)
		.option('--chroma <n>', 'Accent chroma dial 0..1')
		.option(
			'--chroma-ev <level>',
			`Named chroma (${CHROMA_EV_LEVELS.join('|')})`,
		)
		.helpOption('-h, --help', 'Show help')
		.addHelpText('after', `\n${NIGHT_HELP}`)
		.action(async (theme: string | undefined, options: NightCommandOptions) => {
			if (theme && options.file) {
				console.error(
					`Invalid Night input: both ${theme} and ${options.file} were provided. Use one main.yaml path.`,
				);
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}

			let chroma: number | undefined;
			try {
				chroma = parseChromaOption(options.chroma);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}

			const result = await emitNightOverlay({
				themePath: theme ?? options.file,
				cli: {
					scene: options.scene,
					chroma,
					chromaEv: options.chromaEv,
				},
			});

			if (!result.ok) {
				console.error(result.message);
				process.exitCode = result.exitCode;
				return;
			}

			console.log(
				`Night overlay ${result.overwrote ? 'updated' : 'written'}: ${result.outputPath}`,
			);
			console.log(
				`  scene=${result.params.scene} chroma=${result.params.chroma} (${result.params.chromaSource})`,
			);
			console.log(
				`  themeId=${result.themeId} baseId=${result.baseId} roles=${result.mappedCount}`,
			);
			process.exitCode = ExitCode.SUCCESS;
		});
}

export const nightCommand = createNightCommand();
