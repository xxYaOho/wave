import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { addManualOption } from '../options.ts';
import { createMigrateExtensionsCommand } from './dt-migrate-extensions.ts';

export function createTokenMigrateCommand(name = 'migrate'): Command {
	const command = new Command(name).description(
		'Migrate token source documents',
	);
	addManualOption(command);
	command
		.addCommand(createMigrateExtensionsCommand('extensions'))
		.action((options: { manual?: boolean }) => {
			if (options.manual) return;
			console.error('Choose a migration: wave token migrate extensions.');
			process.exitCode = ExitCode.INVALID_COMMAND;
		});
	return command;
}

export const tokenMigrateCommand = createTokenMigrateCommand();
