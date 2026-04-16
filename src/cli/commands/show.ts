import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import {
	getBuiltinDimensionPath,
	getBuiltinPalettePath,
	loadBuiltinDimension,
	loadBuiltinPalette,
} from '../../core/resolver/builtin.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

interface ShowCommandOptions {
	format?: string;
}

const VALID_CATEGORIES = ['palette', 'dimension'];

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

function isValueUnitPair(
	value: unknown,
): value is { value: number | string; unit: string } {
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
						k === '$value'
							? formatValueForDisplay(v)
							: transformDimensionDisplay(v),
					]),
				),
			};
		}
		return Object.fromEntries(
			Object.entries(obj).map(([k, v]) => [k, transformDimensionDisplay(v)]),
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
	return `{\n${items
		.map((item) => {
			const lines = item.split('\n');
			return lines
				.map((line, i) => (i === 0 ? `  ${line}` : `${spaces}  ${line}`))
				.join('\n');
		})
		.join(',\n')}\n${spaces}}`;
}

function flattenResource(
	data: Record<string, unknown>,
	pathParts: string[] = [],
	result: Record<string, unknown> = {},
): Record<string, unknown> {
	for (const [key, value] of Object.entries(data)) {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const obj = value as Record<string, unknown>;
			if ('$value' in obj) {
				result[pathParts.concat(key).join('.')] = formatValueForDisplay(
					obj.$value,
				);
			} else {
				flattenResource(obj, pathParts.concat(key), result);
			}
		}
	}
	return result;
}

type ResourceMatch = {
	category: string;
	data: unknown;
	filePath: string;
};

async function findResource(
	name: string,
): Promise<ResourceMatch | null | { ambiguous: string[] }> {
	const palette = await loadBuiltinPalette(name);
	const dimension = await loadBuiltinDimension(name);

	const matches: ResourceMatch[] = [];
	if (palette)
		matches.push({
			category: 'palette',
			data: palette,
			filePath: getBuiltinPalettePath(name),
		});
	if (dimension)
		matches.push({
			category: 'dimension',
			data: dimension,
			filePath: getBuiltinDimensionPath(name),
		});

	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	return { ambiguous: matches.map((m) => m.category) };
}

async function showResource(
	name: string,
	format: string,
): Promise<{ ok: true } | { ok: false; message: string; exitCode: number }> {
	if (!['flat-json', 'json', 'yaml'].includes(format)) {
		return {
			ok: false,
			message: `Unknown format: ${format}. Supported: flat-json, json, yaml`,
			exitCode: ExitCode.INVALID_PARAMETER,
		};
	}

	const result = await findResource(name);

	if (!result) {
		return {
			ok: false,
			message: `Built-in resource not found: ${name}`,
			exitCode: ExitCode.FILE_NOT_FOUND,
		};
	}

	if ('ambiguous' in result) {
		return {
			ok: false,
			message: `Resource "${name}" exists in multiple categories: ${result.ambiguous.join(', ')}. Please specify a category.`,
			exitCode: ExitCode.INVALID_PARAMETER,
		};
	}

	const { data: resourceData, filePath } = result;

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
				(resourceData as Record<string, Record<string, unknown>>)[
					namespace
				] ?? {},
				[namespace],
			);
			console.log(stringifyCompact(flattened));
		}

		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			message: `Failed to show resource: ${err instanceof Error ? err.message : String(err)}`,
			exitCode: ExitCode.GENERAL_ERROR,
		};
	}
}

export const showCommand = new Command('show')
	.description('Browse built-in resources')
	.argument('[category]', 'Resource category: palette, dimension')
	.argument('[name]', 'Resource name (e.g. tailwindcss4, wave)')
	.option(
		'--format <type>',
		'Output format: flat-json, json, yaml',
		'flat-json',
	)
	.action(async (category?: string, name?: string, options?: ShowCommandOptions) => {
		const format = options?.format ?? 'flat-json';

		// No arguments: list all categories and resources
		if (!category) {
			const palettes = getBuiltinNames(getBuiltinPalettePath);
			const dimensions = getBuiltinNames(getBuiltinDimensionPath);

			if (palettes.length > 0) {
				logger.info('Palettes:');
				for (const n of palettes) {
					console.log(`  ${n}`);
				}
				console.log();
			}

			if (dimensions.length > 0) {
				logger.info('Dimensions:');
				for (const n of dimensions) {
					console.log(`  ${n}`);
				}
				console.log();
			}

			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		// One argument: could be category or resource name
		if (category && !name) {
			if (VALID_CATEGORIES.includes(category.toLowerCase())) {
				const cat = category.toLowerCase();
				const names = getBuiltinNames(
					cat === 'palette' ? getBuiltinPalettePath : getBuiltinDimensionPath,
				);
				logger.info(`${cat === 'palette' ? 'Palettes' : 'Dimensions'}:`);
				for (const n of names) {
					console.log(`  ${n}`);
				}
				console.log();
				process.exitCode = ExitCode.SUCCESS;
				return;
			}

			// Fallback: treat category as resource name for compatibility
			const result = await showResource(category, format);
			if (!result.ok) {
				logger.error(result.message);
				process.exitCode = result.exitCode;
				return;
			}
			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		// Two arguments: category + name
		if (category && name) {
			if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
				logger.error(`Unknown category: ${category}. Supported: palette, dimension`);
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}

			const result = await showResource(name, format);
			if (!result.ok) {
				logger.error(result.message);
				process.exitCode = result.exitCode;
				return;
			}
			process.exitCode = ExitCode.SUCCESS;
		}
	});
