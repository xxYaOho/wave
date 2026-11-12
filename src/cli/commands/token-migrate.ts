import { Command } from 'commander';
import { addManualOption } from '../options.ts';
import { createMigrateExtensionsCommand } from './dt-migrate-extensions.ts';
import { lazyAction } from './lazy-action.ts';

export function createTokenMigrateCommand(name = 'migrate'): Command {
	const command = new Command(name).description(
		'Migrate token source documents',
	);
	addManualOption(command);
	command
		.addCommand(createMigrateExtensionsCommand('extensions'))
		.action(
			lazyAction('token migrate', async () =>
				(
					await import('./token-migrate-action.ts')
				).createTokenMigrateCommandAction(),
			),
		);
	return command;
}

export const tokenMigrateCommand = createTokenMigrateCommand();
