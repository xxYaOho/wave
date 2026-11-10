import { Command, Option } from 'commander';
import { emitNightOverlay } from '../../core/night/emit.ts';
import { LUMINANCE_EV_LEVELS, NIGHT_SCENES } from '../../core/night/params.ts';
import { ExitCode } from '../../types/index.ts';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../file-input.ts';

const NIGHT_HELP = `Wave Night
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Generate a Night overlay draft from a Day theme via pure color-rules.

  Usage:
    wave token new night [options]

  Options:
    -f, --file <path>    Path to a Day main/profile source document
    --scene <name>       Lighting scene: ${NIGHT_SCENES.join(' | ')}
                         Default: night (or $config.night.scene)
    --luminance <n>      Primary Night 明度 dial 0..1 (wins over --luminance-ev)
                         → accentMain HCT tone = n×100 (0.9 ≈ near white)
                         Default: 0.7 (or $config.night.luminance)
    --luminance-ev <lv>  Named luminance: ${LUMINANCE_EV_LEVELS.join(' | ')}
                         → 0.5 / 0.6 / 0.7 / 0.75 / 0.85
    -h, --help           Show help

  Output:
    Writes <stem>@night.yaml beside the theme file (e.g. main@night.yaml).
    Sketch identity: same themeId/baseId as Day; meta.mode=night.

  Priority:
    --luminance > --luminance-ev > $config.night > defaults (scene=night, luminance=0.7)
    Legacy --chroma / --chroma-ev / $config.night.chroma still accepted as aliases.

  Note:
    luminance is Primary Night lightness (明度), NOT HCT chroma/彩度.
`;

interface NightCommandOptions {
	file?: string;
	scene?: string;
	luminance?: string;
	luminanceEv?: string;
	chroma?: string;
	chromaEv?: string;
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
	return new Command(name)
		.description('Generate a Night Mode overlay draft from Day')
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.option('--scene <name>', `Lighting scene (${NIGHT_SCENES.join('|')})`)
		.option(
			'--luminance <n>',
			'Primary Night 明度 dial 0..1 (accentMain tone = n×100)',
		)
		.option(
			'--luminance-ev <level>',
			`Named luminance (${LUMINANCE_EV_LEVELS.join('|')})`,
		)
		.addOption(
			new Option('--chroma <n>', 'Deprecated alias for --luminance').hideHelp(),
		)
		.addOption(
			new Option(
				'--chroma-ev <level>',
				'Deprecated alias for --luminance-ev',
			).hideHelp(),
		)
		.helpOption('-h, --help', 'Show help')
		.addHelpText('after', `\n${NIGHT_HELP}`)
		.action(async (options: NightCommandOptions) => {
			const fileInput = resolveExclusiveFileInput(undefined, options.file, {
				label: 'Night input',
				hint: 'Use one main.yaml path.',
			});
			if (!fileInput.ok) {
				console.error(fileInput.message);
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}

			let luminance: number | undefined;
			let chroma: number | undefined;
			try {
				luminance = parseLuminanceOption(options.luminance, '--luminance');
				chroma = parseLuminanceOption(options.chroma, '--chroma');
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}

			const result = await emitNightOverlay({
				themePath: await expandMainYamlEntry(fileInput.path),
				cli: {
					scene: options.scene,
					luminance,
					luminanceEv: options.luminanceEv,
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
				`  scene=${result.params.scene} luminance=${result.params.luminance} (${result.params.luminanceSource}) → accentMain T${Math.round(result.params.luminance * 100)}`,
			);
			console.log(
				`  themeId=${result.themeId} baseId=${result.baseId} mode=${result.mode} roles=${result.mappedCount}`,
			);
			process.exitCode = ExitCode.SUCCESS;
		});
}

export const nightCommand = createNightCommand();
