import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	getBuiltinDimensionPath,
	getBuiltinPalettePath,
	loadBuiltinDimension,
	loadBuiltinPalette,
} from '../resolver/builtin.ts';
import { loadResource } from '../resolver/resource-loader.ts';
import {
	type DtcgColorSpaceValue,
	ExitCode,
} from '../../types/index.ts';
import { isDtcgColorSpaceValue } from '../../types/index.ts';

const VALID_CATEGORIES = ['palette', 'dimension'];

export type ResourceMatch = {
	category: string;
	data: unknown;
	filePath: string;
};

export type ShowResourceResult =
	| { ok: true; output: string }
	| { ok: false; message: string; exitCode: number };

function getBuiltinNames(resolver: (name: string) => string): string[] {
	const dir = path.dirname(resolver('dummy'));
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.yaml'))
		.map((f) => f.replace(/\.yaml$/, ''))
		.sort();
}

export function listBuiltinResources(category: string): string[] {
	return getBuiltinNames(
		category === 'palette' ? getBuiltinPalettePath : getBuiltinDimensionPath,
	);
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
	if (isValueUnitPair(value)) return `${value.value}${value.unit}`;
	if (isDtcgColorSpaceValue(value)) return formatColorSpaceValueForDisplay(value);
	return value;
}

function formatColorComponentForDisplay(
	component: DtcgColorSpaceValue['components'][number] | undefined,
	options: { percent?: boolean } = {},
): string {
	if (component === undefined) return '0';
	if (component === 'none') return 'none';
	return options.percent
		? `${formatNumber(component * 100)}%`
		: formatNumber(component);
}

function formatColorSpaceValueForDisplay(value: DtcgColorSpaceValue): string {
	const [first, second, third] = value.components;
	const firstComponent = formatColorComponentForDisplay(first, {
		percent: value.colorSpace === 'oklch',
	});
	const alpha = value.alpha === undefined ? '' : ` / ${formatNumber(value.alpha)}`;
	return `${value.colorSpace}(${firstComponent} ${formatColorComponentForDisplay(second)} ${formatColorComponentForDisplay(third)}${alpha})`;
}

function formatNumber(value: number): string {
	return Number(value.toFixed(6)).toString();
}

function transformDimensionDisplay(data: unknown): unknown {
	if (Array.isArray(data)) return data.map(transformDimensionDisplay);
	if (data !== null && typeof data === 'object') {
		const obj = data as Record<string, unknown>;
		if ('$value' in obj) {
			return {
				...Object.fromEntries(
					Object.entries(obj).map(([k, v]) => [
						k,
						k === '$value' ? formatValueForDisplay(v) : transformDimensionDisplay(v),
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
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) {
		const items = value.map((v) => stringifyCompact(v, 0));
		return `[${items.join(', ')}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length === 0) return '{}';
	const items = entries.map(([k, v]) => {
		const str = stringifyCompact(v, indent + 2);
		if (str.includes('\n')) return `${JSON.stringify(k)}:\n${str}`;
		return `${JSON.stringify(k)}: ${str}`;
	});
	return `{\n${items
		.map((item) =>
			item
				.split('\n')
				.map((line, i) => (i === 0 ? `  ${line}` : `${spaces}  ${line}`))
				.join('\n'),
		)
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
			if ('$value' in obj)
				result[pathParts.concat(key).join('.')] = formatValueForDisplay(obj.$value);
			else flattenResource(obj, pathParts.concat(key), result);
		}
	}
	return result;
}

function inferCategoryFromPath(filePath: string): string | null {
	if (filePath.includes(`${path.sep}palettes${path.sep}`)) return 'palette';
	if (filePath.includes(`${path.sep}dimensions${path.sep}`)) return 'dimension';
	return null;
}

export async function loadResourceMatch(
	category: string,
	name: string,
	cwd: string,
): Promise<ResourceMatch | null> {
	const loaded = await loadResource(category, name, cwd);
	if ('line' in loaded) return null;
	return { category, data: { [loaded.namespace]: loaded.data }, filePath: loaded.path };
}

export async function findResource(
	name: string,
	category: string | undefined,
	cwd: string,
): Promise<ResourceMatch | null | { ambiguous: string[] }> {
	if (category) return loadResourceMatch(category, name, cwd);

	const cacheMatch = await loadResourceMatch('palette', name, cwd);
	if (cacheMatch && !inferCategoryFromPath(cacheMatch.filePath)) return cacheMatch;

	const palette = await loadBuiltinPalette(name);
	const dimension = await loadBuiltinDimension(name);
	const matches: ResourceMatch[] = [];
	if (palette)
		matches.push({ category: 'palette', data: palette, filePath: getBuiltinPalettePath(name) });
	if (dimension)
		matches.push({ category: 'dimension', data: dimension, filePath: getBuiltinDimensionPath(name) });
	if (matches.length === 0) return null;
	const singleMatch = matches[0];
	if (matches.length === 1 && singleMatch) return singleMatch;
	return { ambiguous: matches.map((m) => m.category) };
}

export async function showResource(
	name: string,
	format: string,
	category: string | undefined,
	cwd: string,
): Promise<ShowResourceResult> {
	if (!['flat-json', 'json', 'yaml'].includes(format))
		return {
			ok: false,
			message: `Unknown format: ${format}. Supported: flat-json, json, yaml`,
			exitCode: ExitCode.INVALID_PARAMETER,
		};

	const result = await findResource(name, category, cwd);
	if (!result)
		return { ok: false, message: `Resource not found: ${name}`, exitCode: ExitCode.FILE_NOT_FOUND };
	if ('ambiguous' in result)
		return {
			ok: false,
			message: `Resource "${name}" exists in multiple categories: ${result.ambiguous.join(', ')}. Please specify a category.`,
			exitCode: ExitCode.INVALID_PARAMETER,
		};

	const { data: resourceData, filePath } = result;
	try {
		if (format === 'yaml') return { ok: true, output: await Bun.file(filePath).text() };
		if (format === 'json')
			return { ok: true, output: stringifyCompact(transformDimensionDisplay(resourceData)) };
		const namespace = Object.keys(resourceData as Record<string, unknown>)[0];
		if (!namespace)
			return {
				ok: false,
				message: `Built-in resource is empty: ${name}`,
				exitCode: ExitCode.GENERAL_ERROR,
			};
		const flattened = flattenResource(
			(resourceData as Record<string, Record<string, unknown>>)[namespace] ?? {},
			[namespace],
		);
		return { ok: true, output: stringifyCompact(flattened) };
	} catch (err) {
		return {
			ok: false,
			message: `Failed to show resource: ${err instanceof Error ? err.message : String(err)}`,
			exitCode: ExitCode.GENERAL_ERROR,
		};
	}
}

export { VALID_CATEGORIES };
