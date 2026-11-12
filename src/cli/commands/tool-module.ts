import { Command } from 'commander';
import type { ToolModule } from '../../core/tools/index.ts';
import { createInstallCommand } from './install-command.ts';
import { lazyAction } from './lazy-action.ts';

export type { ToolDoctorOptions } from './tool-module-action.ts';

export function createToolModuleCommand(
	name: 'compress' | 'motion',
	alias?: string,
): Command {
	const command = new Command(name).description(`${name} tools`);
	if (alias) command.alias(alias);
	command
		.addCommand(createToolDoctorCommand(name))
		.addCommand(createInstallCommand('install', name));
	return command;
}

export function createToolDoctorCommand(module: ToolModule): Command {
	const command = new Command('doctor')
		.description(`Check ${module} toolchain`)
		.option('--verbose', 'Show detailed tool status')
		.option('--status', 'Show compact health status');
	if (module !== 'compress')
		command.option('--json', 'Output structured JSON only');
	return command.action(
		lazyAction(`${module} doctor`, async () =>
			(await import('./tool-module-action.ts')).createToolDoctorCommandAction(
				module,
			),
		),
	);
}
