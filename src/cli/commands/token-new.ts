import { Command } from 'commander';
import { TOKEN_NEW_HELP } from '../help.ts';
import { addManualOption } from '../options.ts';
import { createDesignTokenInitCommand, runDesignTokenInit } from './dt-init.ts';

export function createTokenNewCommand(name = 'new'): Command {
	const command = new Command(name).description('Create a token workspace');
	addManualOption(command);
	command.configureHelp({ formatHelp: () => TOKEN_NEW_HELP });
	command.action(async (options: { manual?: boolean }) => {
		if (options.manual) return;
		await runDesignTokenInit();
	});
	return command;
}

export const tokenNewCommand = createTokenNewCommand();

// Keep the old factory available to downstream internal imports while the
// public command is now `token new`.
export { createDesignTokenInitCommand };
