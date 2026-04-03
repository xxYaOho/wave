import { Command, CommanderError } from 'commander';
import { themeCommand } from './commands/theme.ts';
import { doctorCommand } from './commands/doctor.ts';
import { helpCommand } from './commands/help.ts';
import { VERSION } from '../config/index.ts';
import { ExitCode } from '../types/index.ts';

const program = new Command();

program
  .name('wave')
  .description('🌊 WAVE - Design Token CLI')
  .version(VERSION, '--version', 'Show version number')
  .helpOption('--help', 'Show help')
  .exitOverride((err) => {
    if (err instanceof CommanderError) {
      if (err.code === 'commander.unknownCommand') {
        process.exitCode = ExitCode.INVALID_COMMAND;
        return;
      } else if (err.code === 'commander.help' || err.code === 'commander.version') {
        process.exitCode = ExitCode.SUCCESS;
        return;
      }
    }
    process.exitCode = ExitCode.GENERAL_ERROR;
  });

program.addCommand(themeCommand);
program.addCommand(doctorCommand);
program.addCommand(helpCommand);

program.parse();
