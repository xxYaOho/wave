import { Command } from 'commander';
import { lazyAction } from './lazy-action.ts';

export function createMigrateExtensionsCommand(
	name = 'migrate-extensions',
): Command {
	return new Command(name)
		.description(
			'One-shot migration of legacy $extensions sketch family to platform.sketch',
		)
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.option(
			'--write',
			'Apply the migration to main.yaml and profiles/*.yaml (default: dry-run report)',
		)
		.action(
			lazyAction('token migrate extensions', async () =>
				(
					await import('./dt-migrate-extensions-action.ts')
				).createMigrateExtensionsCommandAction(),
			),
		);
}
