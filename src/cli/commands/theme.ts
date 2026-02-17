import { Command } from 'commander';
import * as path from 'node:path';
import { ExitCode, type GenerateOptions } from '../../types/index.ts';
import { VERSION } from '../../config/index.ts';
import { detectNightMode, detectVariants } from '../../core/detector/index.ts';
import { logger } from '../../utils/logger.ts';

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

    logger.info(`Loading theme: ${name}`);

    const generateOptions = parseOptions(options);

    const themeDir = path.join(process.env.HOME || '', 'Downloads', name);

    const nightResult = detectNightMode(themeDir, generateOptions);
    logger.info(nightResult.message);

    const variantsResult = detectVariants(themeDir, generateOptions);
    logger.info(variantsResult.message);

    console.log(`Version: ${VERSION}`);
    console.log('TODO: Implement full token generation');
    process.exit(ExitCode.SUCCESS);
  });

interface ThemeCommandOptions {
  file?: string;
  list?: boolean;
  night?: boolean;
  variants?: string | boolean;
  init?: boolean;
}

function parseOptions(options: ThemeCommandOptions): GenerateOptions {
  const result: GenerateOptions = {
    night: options.night !== false,
  };

  if (options.variants === undefined) {
    result.variants = undefined;
  } else if (options.variants === true) {
    result.variants = undefined;
  } else if (typeof options.variants === 'string') {
    result.variants = options.variants
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return result;
}
