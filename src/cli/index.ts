import { Command, CommanderError } from 'commander';
import { VERSION } from '../config/index.ts';
import { ExitCode } from '../types/index.ts';
import { renderManual, TOP_LEVEL_HELP } from './help.ts';
import { registerCommands } from './registry.ts';

const program = new Command();

program
	.name('wave')
	.description('Wave CLI')
	.version(VERSION, '--version', 'Show version number')
	.helpOption('-h, --help', 'Show help')
	.addHelpCommand(false)
	.configureHelp({ formatHelp: () => TOP_LEVEL_HELP })
	.exitOverride((error) => {
		if (error instanceof CommanderError) {
			if (error.code === 'commander.version') {
				process.exitCode = ExitCode.SUCCESS;
				return;
			}
			if (error.code === 'commander.helpDisplayed') {
				process.exitCode = ExitCode.SUCCESS;
				return;
			}
			if (
				error.code === 'commander.unknownCommand' ||
				error.code === 'commander.unknownOption' ||
				error.code === 'commander.excessArguments'
			) {
				process.exitCode = ExitCode.INVALID_COMMAND;
				return;
			}
		}
		throw error;
	});

program
	.command('version')
	.description('Show version number')
	.action(() => {
		console.log(VERSION);
	});

registerCommands(program);

function manualPath(argv: string[]): string[] | undefined {
	const index = argv.findIndex((arg) => arg === '-m' || arg === '--manual');
	if (index < 0) return undefined;
	return argv.slice(0, index);
}

const argv = process.argv.slice(2);
const requestedManualPath = manualPath(argv);
if (requestedManualPath) {
	renderManual(requestedManualPath);
	process.exitCode = ExitCode.SUCCESS;
} else {
	program.parse(process.argv);
}
