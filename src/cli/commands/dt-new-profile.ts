import { Command } from 'commander';
import { addOutputOption } from '../options.ts';
import { lazyAction } from './lazy-action.ts';

export function createNewProfileCommand(name = 'new-profile'): Command {
	const command = new Command(name)
		.description('Create a full value snapshot profile from a registered base')
		.argument('<name>', 'Profile name (lowercase, spaces become underscores)')
		.option(
			'-f, --file <path>',
			'Base main.yaml or workspace directory. Default: ./main.yaml',
		)
		.option('--dry-run', 'Show the complete creation plan without writing')
		.option('--force', 'Allow overwriting the selected profile target');
	addOutputOption(
		command,
		'Output YAML file (stem must match the normalized name)',
	);
	return command.action(
		lazyAction('token new profile', async () =>
			(
				await import('./dt-new-profile-action.ts')
			).createNewProfileCommandAction(),
		),
	);
}
