import { Command, CommanderError } from 'commander';
import { VERSION } from '../config/index.ts';
import { ExitCode } from '../types/index.ts';
import { renderManual, TOP_LEVEL_HELP } from './help.ts';
import { registerCommands } from './registry.ts';

const program = new Command();

program
	.name('wave')
	.description('Wave CLI')
	.version(VERSION, '-v, --version', 'Show version number')
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

function isValidManualPath(path: string[]): boolean {
	const [root, group, leaf] = path;
	if (!root) return true;
	if (['manual', 'version', 'doctor', 'install', 'workspace'].includes(root)) {
		return group === undefined;
	}
	if (root === 'compress' || root === 'motion') {
		return group === undefined || group === 'doctor' || group === 'install';
	}
	if (root !== 'token') return false;
	if (!group) return true;
	if (group === 'new') {
		return leaf === undefined || leaf === 'profile' || leaf === 'night';
	}
	if (group === 'migrate') {
		return leaf === undefined || leaf === 'extensions';
	}
	return (
		['build', 'doctor', 'wcag', 'ids', 'show', 'update', 'status'].includes(
			group,
		) && leaf === undefined
	);
}

const argv = process.argv.slice(2);
const requestedManualPath = manualPath(argv);
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
