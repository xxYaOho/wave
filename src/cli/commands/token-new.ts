import { Command } from 'commander';
import { addManualOption } from '../options.ts';
import {
	addTokenInitOptions,
	createDesignTokenInitCommand,
} from './dt-init.ts';
import { createNewProfileCommand } from './dt-new-profile.ts';
import { lazyAction } from './lazy-action.ts';
import { createNightCommand } from './night.ts';

export function createTokenNewCommand(name = 'new'): Command {
	const command = new Command(name).description('Create a token workspace');
	addManualOption(command);
	addTokenInitOptions(command);
	command
		.addCommand(createNewProfileCommand('profile'))
		.addCommand(createNightCommand('night'));
	command.action(
		lazyAction('token new', async () =>
			(await import('./token-new-action.ts')).createTokenNewCommandAction(),
		),
	);
	return command;
}

export const tokenNewCommand = createTokenNewCommand();

export { createDesignTokenInitCommand };
