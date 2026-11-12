import { Command } from 'commander';
import { addOutputOption } from '../options.ts';
import { lazyAction } from './lazy-action.ts';

export type { WorkspaceCommandOptions } from './workspace-action.ts';

export function createWorkspaceCommand(name = 'workspace'): Command {
	const command = new Command(name)
		.description('Create local design project workspaces')
		.helpOption('-h, --help', 'Show help');
	addOutputOption(command, 'Final target directory');
	command
		.option('--dry-run', 'Show the plan without writing')
		.option('--yes', 'Write without confirmation')
		.option('--force', 'Update generated files in an existing directory')
		.addHelpCommand(false)
		.action(
			lazyAction('workspace', async () =>
				(await import('./workspace-action.ts')).createWorkspaceCommandAction(
					command,
				),
			),
		);

	return command;
}

export const workspaceCommand = createWorkspaceCommand('workspace');
