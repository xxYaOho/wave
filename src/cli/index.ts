import { Command, CommanderError } from 'commander';
import { VERSION } from '../config/index.ts';
import { ExitCode } from '../types/index.ts';
import { createCommand } from './commands/create.ts';
import { doctorCommand } from './commands/doctor.ts';
import { initCommand } from './commands/init.ts';
import { showCommand } from './commands/show.ts';

const QUICK_START = `
  WAVE — Design Token CLI

  Quick Start:
    wave init           Initialize a new theme workspace
    wave create         Generate design token output
    wave doctor         Run health diagnostics
    wave show           Browse built-in resources

  For more information:
    wave help <command>
`;

const program = new Command();

program
	.name('wave')
	.description('WAVE - Design Token CLI')
	.version(VERSION, '--version', 'Show version number')
	.helpOption('--help', 'Show help')
	.addHelpCommand()
	.exitOverride((err) => {
		if (err instanceof CommanderError) {
			if (err.code === 'commander.unknownCommand') {
				process.exitCode = ExitCode.INVALID_COMMAND;
				return;
			} else if (
				err.code === 'commander.help' ||
				err.code === 'commander.version'
			) {
				process.exitCode = ExitCode.SUCCESS;
				return;
			}
		}
		process.exitCode = ExitCode.GENERAL_ERROR;
	});

program
	.command('version')
	.description('Show version number')
	.action(() => {
		console.log(VERSION);
	});

program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(doctorCommand);
program.addCommand(showCommand);

program.action(() => {
	console.log(QUICK_START);
});

program.parse();
