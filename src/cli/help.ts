import type { Command } from 'commander';
import { commandHelp, findCommandDefinition, ROOT_HELP } from './registry.ts';

/** Compatibility exports for callers that used the pre-metadata help names. */
export const TOP_LEVEL_HELP = ROOT_HELP;
export const TOKEN_HELP = commandHelp(['token']) ?? '';
export const TOKEN_NEW_HELP = commandHelp(['token', 'new']) ?? '';
export const TOKEN_MIGRATE_HELP = commandHelp(['token', 'migrate']) ?? '';

export function configureStaticHelp(command: Command, help: string): Command {
	return command
		.helpOption('-h, --help', 'Show help')
		.addHelpCommand(false)
		.configureHelp({ formatHelp: () => help });
}

export function helpForCommand(command: Command): string | undefined {
	const path: string[] = [];
	let current: Command | undefined = command;
	while (current) {
		path.unshift(current.name());
		current = current.parent ?? undefined;
	}
	return commandHelp(path);
}

export function hasRegisteredHelp(path: readonly string[]): boolean {
	return findCommandDefinition(path) !== undefined;
}

export function renderManual(path: string[]): void {
	const commandPath = path.length > 0 ? path.join(' ') : 'wave';
	console.log(`# ${commandPath}\n\n`);
	console.log(
		`Usage: \`wave ${commandPath === 'wave' ? '' : `${commandPath} `}[options]\``,
	);
	console.log('\nThis command reference is available in the Wave manual.');
}
