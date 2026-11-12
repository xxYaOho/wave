import { Command } from 'commander';
import { lazyAction } from './lazy-action.ts';

export function createIdsCommand(name = 'ids'): Command {
	return new Command(name)
		.description(
			'Fill, generate and sync token $id identities across the workspace',
		)
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.option(
			'--write',
			'Write $id changes back to main.yaml and profiles/*.yaml (default: dry-run report)',
		)
		.option(
			'--allow-dirty',
			'Allow --write even when the git working tree is not clean',
		)
		.action(
			lazyAction('token ids', async () =>
				(await import('./dt-ids-action.ts')).createIdsCommandAction(),
			),
		);
}
