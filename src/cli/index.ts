import { Command } from 'commander';
import { themeCommand } from './commands/theme.ts';
import { doctorCommand } from './commands/doctor.ts';
import { helpCommand } from './commands/help.ts';
import { VERSION } from '../config/index.ts';

const program = new Command();

program
  .name('wave')
  .description('🌊 WAVE - Design Token CLI')
  .version(VERSION, '--version', 'Show version number')
  .helpOption('--help', 'Show help');

program.addCommand(themeCommand);
program.addCommand(doctorCommand);
program.addCommand(helpCommand);

program.parse();
