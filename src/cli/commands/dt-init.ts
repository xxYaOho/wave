import { Command } from 'commander';
import { addOutputOption } from '../options.ts';
import { lazyAction } from './lazy-action.ts';

export type { TokenInitOptions } from './dt-init-action.ts';

export function addTokenInitOptions(command: Command): Command {
	addOutputOption(command, 'Target token workspace directory');
	return command
		.option('--dry-run', 'Show the complete creation plan without writing')
		.option('--force', 'Allow replacing the planned main.yaml file');
}

export function createDesignTokenInitCommand(name = 'init'): Command {
	return addTokenInitOptions(
		new Command(name).description('Initialize a new design-token workspace'),
	).action(
		lazyAction(
			'token new',
			async () => (await import('./dt-init-action.ts')).runDesignTokenInit,
		),
	);
}
