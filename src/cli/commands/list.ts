import * as path from 'node:path';
import * as fs from 'node:fs';
import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import {
  getBuiltinPalettePath,
  getBuiltinDimensionPath,
} from '../../core/resolver/builtin.ts';

function getBuiltinNames(resolver: (name: string) => string): string[] {
  const dir = path.dirname(resolver('dummy'));
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .sort();
}

export const listCommand = new Command('list')
  .description('List built-in resources')
  .action(() => {
    const palettes = getBuiltinNames(getBuiltinPalettePath);
    const dimensions = getBuiltinNames(getBuiltinDimensionPath);

    if (palettes.length > 0) {
      logger.info('Palettes:');
      for (const name of palettes) {
        console.log(`  ${name}`);
      }
      console.log();
    }

    if (dimensions.length > 0) {
      logger.info('Dimensions:');
      for (const name of dimensions) {
        console.log(`  ${name}`);
      }
      console.log();
    }

    process.exitCode = ExitCode.SUCCESS;
  });
