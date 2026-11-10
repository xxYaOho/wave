import type { Command } from 'commander';
import { compressCommand } from './commands/compress.ts';
import { doctorCommand } from './commands/doctor.ts';
import { tokenCommand } from './commands/dt.ts';
import { installCommand } from './commands/install.ts';
import { manualCommand } from './commands/manual.ts';
import { motionCommand } from './commands/motion.ts';
import { workspaceCommand } from './commands/workspace.ts';

export type CommandCategory = 'common' | 'workspace' | 'toolchain' | 'other';

export interface CommandDefinition {
	name: string;
	category: CommandCategory;
	command: Command;
}

export const commandRegistry: CommandDefinition[] = [
	{
		name: 'token',
		category: 'common',
		command: tokenCommand,
	},
	{
		name: 'compress',
		category: 'common',
		command: compressCommand,
	},
	{
		name: 'motion',
		category: 'common',
		command: motionCommand,
	},
	{
		name: 'workspace',
		category: 'workspace',
		command: workspaceCommand,
	},
	{
		name: 'manual',
		category: 'workspace',
		command: manualCommand,
	},
	{
		name: 'doctor',
		category: 'toolchain',
		command: doctorCommand,
	},
	{
		name: 'install',
		category: 'toolchain',
		command: installCommand,
	},
];

export function registerCommands(program: Command): void {
	for (const definition of commandRegistry) {
		program.addCommand(definition.command);
	}
}
