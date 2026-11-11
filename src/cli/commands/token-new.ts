import { Command } from 'commander';
import { addManualOption } from '../options.ts';
import {
	addTokenInitOptions,
	createDesignTokenInitCommand,
	runDesignTokenInit,
	type TokenInitOptions,
} from './dt-init.ts';
import { createNewProfileCommand } from './dt-new-profile.ts';
import { createNightCommand } from './night.ts';

export function createTokenNewCommand(name = 'new'): Command {
	const command = new Command(name).description('Create a token workspace');
	addManualOption(command);
	addTokenInitOptions(command);
	command
		.addCommand(createNewProfileCommand('profile'))
		.addCommand(createNightCommand('night'));
	command.action(async (_options: TokenInitOptions, current: Command) => {
		const options = current.optsWithGlobals<TokenInitOptions>();
		if (options.manual) return;
		await runDesignTokenInit(options);
	});
	return command;
}

export const tokenNewCommand = createTokenNewCommand();

// Keep the old factory available to downstream internal imports while the
// public command is now `token new`.
export { createDesignTokenInitCommand };
