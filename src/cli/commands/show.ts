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

function isValueUnitPair(value: unknown): value is { value: number | string; unit: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'value' in value &&
    'unit' in value &&
    typeof (value as Record<string, unknown>).unit === 'string'
  );
}

function formatValueForDisplay(value: unknown): unknown {
  if (isValueUnitPair(value)) {
    return `${value.value}${value.unit}`;
  }
  return value;
}

function transformDimensionDisplay(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(transformDimensionDisplay);
  }
  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if ('$value' in obj) {
      return {
        ...Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [
            k,
            k === '$value' ? formatValueForDisplay(v) : transformDimensionDisplay(v),
          ])
        ),
      };
    }
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, transformDimensionDisplay(v)])
    );
  }
  return data;
}

function stringifyCompact(value: unknown, indent = 0): string {
  const spaces = ' '.repeat(indent);
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => stringifyCompact(v, 0));
    return `[${items.join(', ')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const items = entries.map(([k, v]) => {
    const str = stringifyCompact(v, indent + 2);
    if (str.includes('\n')) {
      return `${JSON.stringify(k)}:\n${str}`;
    }
    return `${JSON.stringify(k)}: ${str}`;
  });
  return `{\n${items.map((item) => {
    const lines = item.split('\n');
    return lines.map((line, i) => (i === 0 ? `  ${line}` : `${spaces}  ${line}`)).join('\n');
  }).join(',\n')}\n${spaces}}`;
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
        result[pathParts.concat(key).join('.')] = formatValueForDisplay(obj.$value);
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
        console.log(stringifyCompact(transformDimensionDisplay(resourceData)));
      } else {
        // flat-json
        const namespace = Object.keys(resourceData!)[0];
        const flattened = flattenResource(
          (resourceData as Record<string, Record<string, unknown>>)[namespace] ?? {},
          [namespace]
        );
        console.log(stringifyCompact(flattened));
      }

      process.exitCode = ExitCode.SUCCESS;
    } catch (err) {
      logger.error(
        `Failed to show resource: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
  });
