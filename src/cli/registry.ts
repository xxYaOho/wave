import type { Command } from 'commander';
import { createCommand } from './commands/create.ts';
import { doctorCommand } from './commands/doctor.ts';
import { dtCommand } from './commands/dt.ts';
import { initCommand } from './commands/init.ts';
import { mgCommand, motionCommand } from './commands/motion.ts';
import { showCommand } from './commands/show.ts';

export type CommandCategory = 'core' | 'design-token' | 'motion';

export interface CommandDefinition {
	name: string;
	category: CommandCategory;
	command: Command;
	legacy?: boolean;
}

export const commandRegistry: CommandDefinition[] = [
	{
		name: 'dt',
		category: 'design-token',
		command: dtCommand,
	},
	{
		name: 'motion',
		category: 'motion',
		command: motionCommand,
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
