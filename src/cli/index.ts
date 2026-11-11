import { Command, CommanderError } from 'commander';
import { VERSION } from '../config/index.ts';
import { ExitCode } from '../types/index.ts';
import {
	isValidManualPath,
	renderManual,
	resolveManualPath,
} from './manual-markdown.ts';
import { ROOT_HELP, registerCommands } from './registry.ts';

const program = new Command();

program
	.name('wave')
	.description('Wave CLI')
	.enablePositionalOptions()
	.version(VERSION, '-v, --version', 'Show version number')
	.helpOption('-h, --help', 'Show help')
	.addHelpCommand(false)
	.configureHelp({
		formatHelp: () => ROOT_HELP,
	})
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

registerCommands(program);

const argv = process.argv.slice(2);
const requestedManualPath = resolveManualPath(argv);
if (requestedManualPath) {
	if (!isValidManualPath(requestedManualPath)) {
		console.error(
			`Unknown command path for --manual: ${requestedManualPath.join(' ')}`,
		);
		process.exitCode = ExitCode.INVALID_COMMAND;
	} else {
		renderManual(requestedManualPath);
		process.exitCode = ExitCode.SUCCESS;
	}
} else {
	program.parse(process.argv);
}
