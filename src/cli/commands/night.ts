import { Command } from 'commander';
import { addOutputOption } from '../options.ts';
import { lazyAction } from './lazy-action.ts';

export type { NightCommandOptions } from './night-action.ts';

export function createNightCommand(name = 'night'): Command {
	const command = new Command(name)
		.description('Generate a Night Mode overlay draft from Day')
		.option(
			'-f, --file <path>',
			'Day main/profile YAML or workspace directory. Default: ./main.yaml',
		)
		.option('--dry-run', 'Show the complete creation plan without writing')
		.option('--force', 'Allow overwriting the planned overlay')
		.option(
			'--scene <name>',
			'Lighting scene (moon|night-light|night|candle-light|sunset)',
		)
		.option(
			'--luminance <n>',
			'Primary Night lightness dial 0..1 (accentMain tone = n×100)',
		)
		.option(
			'--luminance-ev <level>',
			'Named luminance (minimal|low|medium|high|max)',
		)
		.option('-m, --manual', 'Print Markdown usage for this command')
		.helpOption('-h, --help', 'Show help')
		.addHelpCommand(false);
	addOutputOption(command, 'Output YAML file');
	return command.action(
		lazyAction('token new night', async () =>
			(await import('./night-action.ts')).createNightCommandAction(),
		),
	);
}

export const nightCommand = createNightCommand();
