import type { Command } from 'commander';
import { compressCommand } from './commands/compress.ts';
import { createCommand } from './commands/create.ts';
import { doctorCommand } from './commands/doctor.ts';
import { dtCommand } from './commands/dt.ts';
import { initCommand } from './commands/init.ts';
import { installCommand } from './commands/install.ts';
import { showCommand } from './commands/show.ts';
import { createToolModuleCommand } from './commands/tool-module.ts';

export type CommandCategory = 'core' | 'design-token' | 'compress' | 'motion';

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
		name: 'compress',
		category: 'compress',
		command: compressCommand,
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
		name: 'motion',
		category: 'motion',
		command: createToolModuleCommand('motion', 'mg'),
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
