import type { Command } from 'commander';
import { compressCommand } from './commands/compress.ts';
import { createCommand } from './commands/create.ts';
import { doctorCommand } from './commands/doctor.ts';
import { designTokenCommand, dtCommand } from './commands/dt.ts';
import { initCommand } from './commands/init.ts';
import { installCommand } from './commands/install.ts';
import { mgCommand, motionCommand } from './commands/motion.ts';
import { showCommand } from './commands/show.ts';
import { workspaceCommand } from './commands/workspace.ts';

export type CommandCategory =
	| 'core'
	| 'design-token'
	| 'compress'
	| 'motion'
	| 'workspace';

export interface CommandDefinition {
	name: string;
	category: CommandCategory;
	command: Command;
	legacy?: boolean;
}

export const commandRegistry: CommandDefinition[] = [
	{
		name: 'design-token',
		category: 'design-token',
		command: designTokenCommand,
	},
	{
		name: 'dt',
		category: 'design-token',
		command: dtCommand,
	},
	{
		name: 'compress',
		category: 'compress',
		command: compressCommand,
	},
	{
		name: 'motion',
		category: 'motion',
		command: motionCommand,
	},
	{
		name: 'workspace',
		category: 'workspace',
		command: workspaceCommand,
	},
	{
		name: 'mg',
		category: 'motion',
		command: mgCommand,
	},
	{
		name: 'init',
		category: 'design-token',
		command: initCommand,
		legacy: true,
	},
	{
		name: 'create',
		category: 'design-token',
		command: createCommand,
		legacy: true,
	},
	{
		name: 'doctor',
		category: 'core',
		command: doctorCommand,
		legacy: true,
	},
	{
		name: 'install',
		category: 'core',
		command: installCommand,
	},
	{
		name: 'show',
		category: 'design-token',
		command: showCommand,
		legacy: true,
	},
];

export function registerCommands(program: Command): void {
	for (const definition of commandRegistry) {
		program.addCommand(definition.command);
	}
}
