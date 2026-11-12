import { Command } from 'commander';
import { addOutputOption } from '../options.ts';
import { lazyAction } from './lazy-action.ts';

export type { DesignTokenBuildOptions } from './build-action.ts';

export function addBuildOptions(command: Command): Command {
	command
		.option(
			'-f, --file <path>',
			'Day source YAML or workspace directory. Default: ./main.yaml',
		)
		.option('--profiles <mode>', 'Build profile set. Supported: all')
		.option('--night', 'Include valid Night Mode overlays when available');
	addOutputOption(command, 'Output directory');
	return command;
}

export function createDesignTokenBuildCommand(name = 'build'): Command {
	const command = new Command(name).description('Generate design token output');
	addBuildOptions(command);
	command.action(
		lazyAction('token build', async () =>
			(await import('./build-action.ts')).createDesignTokenBuildCommandAction(),
		),
	);
	return command;
}
