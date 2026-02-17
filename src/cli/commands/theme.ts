import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { VERSION } from '../../config/index.ts';

export const themeCommand = new Command('theme')
  .description('Generate theme tokens')
  .argument('[name]', 'Theme name to generate')
  .option('-f, --file <path>', 'Themefile path')
  .option('--list', 'List built-in themes')
  .option('--no-night', 'Disable night mode generation')
  .option('--variants [names]', 'Specify variants (comma separated)')
  .option('--init', 'Create theme template')
  .action(async (name: string | undefined, options: ThemeCommandOptions) => {
    if (options.list) {
      console.log('Built-in themes:');
      console.log('  beluga');
      process.exit(ExitCode.SUCCESS);
    }

    if (options.init) {
      console.log('Creating theme template...');
      console.log('TODO: Implement --init');
      process.exit(ExitCode.SUCCESS);
    }

    if (!name) {
      console.error('Error: Theme name is required');
      console.log('Usage: wave theme <name>');
      console.log('Try "wave help theme" for more information.');
      process.exit(ExitCode.MISSING_PARAMETER);
    }

    console.log(`Generating theme: ${name}`);
    console.log(`Version: ${VERSION}`);
    console.log('TODO: Implement full theme generation');
    process.exit(ExitCode.SUCCESS);
  });

interface ThemeCommandOptions {
  file?: string;
  list?: boolean;
  night?: boolean;
  variants?: string | boolean;
  init?: boolean;
}
