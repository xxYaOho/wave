import { Command } from 'commander';
import { lazyAction } from './lazy-action.ts';

export type { ResourceMatch, ShowCommandOptions } from './show-action.ts';

export function createShowCommand(name = 'show'): Command {
	return new Command(name)
		.description('Browse built-in resources')
		.argument('[category]', 'Resource category: palette, dimension')
		.argument('[name]', 'Resource name (e.g. tailwindcss, wave)')
		.option(
			'--format <type>',
			'Output format: flat-json, json, yaml',
			'flat-json',
		)
		.action(
			lazyAction('token show', async () =>
				(await import('./show-action.ts')).createShowCommandAction(),
			),
		);
}

export const showCommand = createShowCommand('show');
