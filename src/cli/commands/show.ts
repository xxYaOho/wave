import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import {
  loadBuiltinPalette,
  loadBuiltinDimension,
  getBuiltinPalettePath,
  getBuiltinDimensionPath,
} from '../../core/resolver/builtin.ts';

interface ShowCommandOptions {
  format?: string;
}

function flattenResource(
  data: Record<string, unknown>,
  pathParts: string[] = [],
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ('$value' in obj) {
        result[pathParts.concat(key).join('.')] = obj.$value;
      } else {
        flattenResource(obj, pathParts.concat(key), result);
      }
    }
  }
  return result;
}

export const showCommand = new Command('show')
  .description('Show a built-in resource')
  .argument('<name>', 'Resource name (e.g. tailwindcss4, wave)')
  .option('--format <type>', 'Output format: flat-json, json, yaml', 'flat-json')
  .action(async (name: string, options: ShowCommandOptions) => {
    const format = options.format ?? 'flat-json';
    if (!['flat-json', 'json', 'yaml'].includes(format)) {
      logger.error(`Unknown format: ${format}. Supported: flat-json, json, yaml`);
      process.exitCode = ExitCode.INVALID_PARAMETER;
      return;
    }

    const palette = await loadBuiltinPalette(name);
    const dimension = palette ? null : await loadBuiltinDimension(name);

    if (!palette && !dimension) {
      logger.error(`Built-in resource not found: ${name}`);
      process.exitCode = ExitCode.FILE_NOT_FOUND;
      return;
    }

    const resourceData = palette ?? dimension;
    const filePath = palette
      ? getBuiltinPalettePath(name)
      : getBuiltinDimensionPath(name);

    try {
      if (format === 'yaml') {
        const file = Bun.file(filePath);
        const content = await file.text();
        console.log(content);
      } else if (format === 'json') {
        console.log(JSON.stringify(resourceData, null, 2));
      } else {
        // flat-json
        const namespace = Object.keys(resourceData!)[0];
        const flattened = flattenResource(
          (resourceData as Record<string, Record<string, unknown>>)[namespace] ?? {},
          [namespace]
        );
        console.log(JSON.stringify(flattened, null, 2));
      }

      process.exitCode = ExitCode.SUCCESS;
    } catch (err) {
      logger.error(
        `Failed to show resource: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
  });
