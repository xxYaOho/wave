import type { Command } from 'commander';
import { compressCommand } from './commands/compress.ts';
import { doctorCommand } from './commands/doctor.ts';
import { designTokenCommand, dtCommand } from './commands/dt.ts';
import { installCommand } from './commands/install.ts';
import { manualCommand } from './commands/manual.ts';
import { mgCommand, motionCommand } from './commands/motion.ts';
import { nightCommand } from './commands/night.ts';
import { showCommand } from './commands/show.ts';
import { workspaceCommand } from './commands/workspace.ts';

export type CommandCategory =
	| 'core'
	| 'design-token'
	| 'compress'
	| 'manual'
	| 'motion'
	| 'workspace'
	| 'night';

export interface CommandDefinition {
	name: string;
	category: CommandCategory;
	command: Command;
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
		name: 'manual',
		category: 'manual',
		command: manualCommand,
	},
	{
		name: 'mg',
		category: 'motion',
		command: mgCommand,
	},
	{
		name: 'night',
		category: 'night',
		command: nightCommand,
	},
	{
		name: 'doctor',
		category: 'core',
		command: doctorCommand,
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
	},
];

export function registerCommands(program: Command): void {
	for (const definition of commandRegistry) {
		program.addCommand(definition.command);
	}
}
