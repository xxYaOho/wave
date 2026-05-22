import * as path from 'node:path';
import {
	type ColorSpaceFormat,
	type DimensionResult,
	type DtcgTokenGroup,
	ExitCode,
	type PaletteResult,
	type ParsedThemefile,
	type ParseError,
	type ReferenceDataSources,
	type ResolvedGroupParameters,
	type ThemeDocumentResult,
	type ParameterSet,
} from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import {
	parseDimension,
	parsePalette,
	validateDimensionSchema,
	validatePaletteSchema,
} from '../parser/index.ts';
import { parseThemeYaml } from '../parser/theme-yaml.ts';
import { parseThemefile } from '../parser/themefile.ts';
import {
	CircularReferenceError,
	ExtendsCycleError,
	expandExtends,
	resolveReferences,
	UnresolvedReferenceError,
} from '../resolver/index.ts';
import { loadResource } from '../resolver/resource-loader.ts';
import { validateThemeSchema } from '../schema/theme.ts';
import { transformToWaveTokens } from '../transformer/index.ts';

export interface ThemefileLoadResult {
	parsed: ParsedThemefile;
	themeDir: string;
	themefilePath: string;
	themefileContent: string;
	tokenPath?: string;
	tokenContent?: string;
}

export interface DependencyDict {
	[namespace: string]: {
		data: Record<string, unknown>;
		path: string;
		kind: string;
	};
}

export interface DependencyDictionary {
	dict: DependencyDict;
	palette: PaletteResult;
	dimension: DimensionResult;
	paletteContent: string;
	dimensionContent: string;
	palettePath: string;
	dimensionPath: string;
}

function expandHomePath(filePath: string): string {
	if (filePath.startsWith('~/')) {
		return path.join(process.env.HOME || '', filePath.slice(2));
	}
	if (filePath.startsWith('${HOME}/')) {
		return path.join(process.env.HOME || '', filePath.slice(7));
	}
	return filePath;
}

async function loadYamlFile(filePath: string): Promise<string> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		throw new Error(`File not found: ${filePath}`);
	}
	return await file.text();
}

function isParseError(result: unknown): result is ParseError {
	return (
		typeof result === 'object' &&
		result !== null &&
		'line' in result &&
		'message' in result
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMainYamlPath(filePath: string): boolean {
	return path.basename(filePath) === 'main.yaml';
}

function scalarToString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`$config.${field} must be a non-empty string`);
	}
	return value;
}

function optionalScalarToString(
	value: unknown,
	field: string,
): string | undefined {
	if (value === undefined) return undefined;
	return scalarToString(value, field);
}

function numberToParam(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`$config.${field} must be a number`);
	}
	return String(value);
}

function stringArrayToParam(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new Error(`$config.${field} must be a string array`);
	}
	return value.join(',');
}

function variantsToParam(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (value === false) return 'false';
	if (value === 'auto') return 'auto';
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value.join(',');
	}
	throw new Error(`$config.${field} must be "auto", false, or a string array`);
}

function nightToParam(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (value === false) return 'false';
	if (value === 'auto') return 'auto';
	throw new Error(`$config.${field} must be "auto" or false`);
}

function parameterToThemefileParams(
	value: unknown,
	prefix: string,
): ParameterSet {
	if (value === undefined) return {};
	if (!isRecord(value)) {
		throw new Error(`$config.${prefix} must be an object`);
	}

	const allowed = new Set([
		'outputDir',
		'platform',
		'filterLayer',
		'colorSpace',
		'night',
		'variants',
	]);
	const unknown = Object.keys(value).filter((key) => !allowed.has(key));
	if (unknown.length > 0) {
		throw new Error(`Unknown $config.${prefix} field: ${unknown[0]}`);
	}

	const params: ParameterSet = {};
	const outputDir = optionalScalarToString(
		value.outputDir,
		`${prefix}.outputDir`,
	);
	if (outputDir !== undefined) params.output = outputDir;

	const platform = stringArrayToParam(value.platform, `${prefix}.platform`);
	if (platform !== undefined) params.platform = platform;

	const filterLayer = numberToParam(value.filterLayer, `${prefix}.filterLayer`);
	if (filterLayer !== undefined) params.filterLayer = filterLayer;

	const colorSpace = optionalScalarToString(
		value.colorSpace,
		`${prefix}.colorSpace`,
	);
	if (colorSpace !== undefined) params.colorSpace = colorSpace;

	const night = nightToParam(value.night, `${prefix}.night`);
	if (night !== undefined) params.night = night;

	const variants = variantsToParam(value.variants, `${prefix}.variants`);
	if (variants !== undefined) params.variants = variants;

	return params;
}

function resourceEntries(
	resource: Record<string, unknown>,
	kind: string,
): { kind: string; ref: string }[] {
	const value = resource[kind];
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new Error(`$config.resource.${kind} must be a string array`);
	}
	return value.map((ref) => ({ kind, ref }));
}

function parseConfigMainYaml(
	content: string,
	filePath: string,
): ThemefileLoadResult | { error: Error | ParseError } {
	const parsedYaml = parseThemeYaml(content);
	if (isParseError(parsedYaml)) {
		return { error: parsedYaml };
	}

	const raw = parsedYaml.raw as Record<string, unknown>;
	const config = raw.$config;
	if (!isRecord(config)) {
		return { error: new Error('main.yaml is missing required $config object') };
	}

	const allowed = new Set(['theme', 'resource', 'parameter', 'parameterGroup']);
	const unknown = Object.keys(config).filter((key) => !allowed.has(key));
	if (unknown.length > 0) {
		return { error: new Error(`Unknown $config field: ${unknown[0]}`) };
	}

	try {
		const theme = scalarToString(config.theme, 'theme');
		if (!isRecord(config.resource)) {
			throw new Error('$config.resource must be an object');
		}
		const resources = [
			...resourceEntries(config.resource, 'palette'),
			...resourceEntries(config.resource, 'dimension'),
			...resourceEntries(config.resource, 'custom'),
		];
		if (resources.length === 0) {
			throw new Error('$config.resource must declare at least one resource');
		}

		const parameter = parameterToThemefileParams(config.parameter, 'parameter');
		const groups: ParsedThemefile['groups'] = [];
		if (config.parameterGroup !== undefined) {
			if (!isRecord(config.parameterGroup)) {
				throw new Error('$config.parameterGroup must be an object');
			}
			for (const [name, groupValue] of Object.entries(config.parameterGroup)) {
				groups.push({
					name,
					PARAMETER: parameterToThemefileParams(
						groupValue,
						`parameterGroup.${name}`,
					),
				});
			}
		}

		return {
			parsed: {
				THEME: theme,
				PARAMETER: parameter,
				resources,
				groups,
			},
			themeDir: path.dirname(filePath),
			themefilePath: filePath,
			themefileContent: content,
			tokenPath: filePath,
			tokenContent: content,
		};
	} catch (err) {
		return { error: err instanceof Error ? err : new Error(String(err)) };
	}
}

export async function loadThemefile(
	themePath?: string,
): Promise<ThemefileLoadResult | { error: ParseError | Error }> {
	const themeDir = themePath
		? path.dirname(expandHomePath(themePath))
		: process.cwd();

	const themefilePath = themePath
		? expandHomePath(themePath)
		: path.join(themeDir, 'themefile');

	let themefileContent: string;
	try {
		themefileContent = await loadYamlFile(themefilePath);
	} catch (err) {
		return { error: err instanceof Error ? err : new Error(String(err)) };
	}

	if (isMainYamlPath(themefilePath)) {
		return parseConfigMainYaml(themefileContent, themefilePath);
	}

	const parsed = parseThemefile(themefileContent);
	if (isParseError(parsed)) {
		return { error: parsed };
	}

	return { parsed, themeDir, themefilePath, themefileContent };
}

export async function buildDependencyDictionary(
	parsed: ParsedThemefile,
	themeDir: string,
): Promise<DependencyDictionary | { error: Error }> {
	const resources = parsed.resources;

	if (resources.length === 0) {
		return { error: new Error('No resources declared in themefile') };
	}

	const dict: DependencyDict = {};
	const namespaces = new Set<string>();

	let paletteResult: PaletteResult | undefined;
	let dimensionResult: DimensionResult | undefined;
	let paletteContent = '';
	let dimensionContent = '';
	let palettePath = '';
	let dimensionPath = '';

	for (const { kind, ref } of resources) {
		const loaded = await loadResource(kind, ref, themeDir);
		if ('line' in loaded) {
			return { error: new Error(loaded.message) };
		}

		if (namespaces.has(loaded.namespace)) {
			return {
				error: new Error(
					`Duplicate namespace "${loaded.namespace}" declared by ${kind} ${ref} (${loaded.path})`,
				),
			};
		}
		namespaces.add(loaded.namespace);

		dict[loaded.namespace] = {
			data: loaded.data,
			path: loaded.path,
			kind,
		};

		// Backward compatibility: extract first palette and dimension for the old resolver
		if (kind === 'palette' && !paletteResult) {
			palettePath = loaded.path;
			paletteContent = loaded.content;
			const schemaError = await validatePaletteSchema(
				paletteContent,
				palettePath,
			);
			if (schemaError) {
				return {
					error: new Error(`Palette schema error: ${schemaError.message}`),
				};
			}
			const parsedPalette = parsePalette(paletteContent);
			if (isParseError(parsedPalette)) {
				return {
					error: new Error(
						`Palette parse error at line ${parsedPalette.line}: ${parsedPalette.message}`,
					),
				};
			}
			paletteResult = parsedPalette;
		}

		if (kind === 'dimension' && !dimensionResult) {
			dimensionPath = loaded.path;
			dimensionContent = loaded.content;
			const schemaError = await validateDimensionSchema(
				dimensionContent,
				dimensionPath,
			);
			if (schemaError) {
				return {
					error: new Error(`Dimension schema error: ${schemaError.message}`),
				};
			}
			const parsedDim = parseDimension(dimensionContent);
			if (isParseError(parsedDim)) {
				return {
					error: new Error(`Dimension parse error: ${parsedDim.message}`),
				};
			}
			dimensionResult = parsedDim;
		}
	}

	if (!paletteResult || !dimensionResult) {
		return {
			error: new Error('Missing required palette or dimension resource'),
		};
	}

	return {
		dict,
		palette: paletteResult,
		dimension: dimensionResult,
		paletteContent,
		dimensionContent,
		palettePath,
		dimensionPath,
	};
}

export async function processThemeDocument(
	yamlPath: string,
	dict: DependencyDict,
	colorSpace?: ColorSpaceFormat,
	contentOverride?: string,
): Promise<ThemeDocumentResult> {
	let content = contentOverride;
	if (content === undefined) {
		const file = Bun.file(yamlPath);
		if (!(await file.exists())) {
			return {
				ok: false,
				reason: 'file_not_found',
				message: `File not found: ${yamlPath}`,
				exitCode: ExitCode.FILE_NOT_FOUND,
			};
		}
		content = await file.text();
	}
	const parsed = parseThemeYaml(content);

	if (isParseError(parsed)) {
		return {
			ok: false,
			reason: 'parse_error',
			message: `Theme YAML parse error: ${parsed.message}`,
			exitCode: ExitCode.FORMAT_ERROR,
			line: parsed.line,
		};
	}

	const schemaResult = validateThemeSchema(parsed.raw);
	if (!schemaResult.valid) {
		const errorMessages = schemaResult.issues
			.filter((i) => i.level === 'error')
			.map((i) => `  [${i.path}] ${i.message}`)
			.join('\n');
		return {
			ok: false,
			reason: 'schema_error',
			message: `Theme schema validation failed:\n${errorMessages}`,
			exitCode: ExitCode.FORMAT_ERROR,
		};
	}
	for (const issue of schemaResult.issues) {
		if (issue.level === 'warning') {
			logger.warn(`[${issue.path}] ${issue.message}`);
		}
	}

	const sources: ReferenceDataSources = {};
	for (const [namespace, entry] of Object.entries(dict)) {
		sources[namespace] = entry.data;
	}

	try {
		// 展开 $extends 继承（在引用解析之前）
		const tokenTree = { ...parsed.raw } as DtcgTokenGroup;
		delete tokenTree.$config;
		const rootKeys = new Set(
			Object.keys(tokenTree).filter((k) => !k.startsWith('$')),
		);
		if (rootKeys.size === 0) rootKeys.add('theme');
		const expanded = expandExtends(tokenTree, rootKeys);

		const resolved = resolveReferences(expanded, sources);
		const transformResult = transformToWaveTokens(
			resolved,
			undefined,
			colorSpace,
		);
		return {
			ok: true,
			tree: transformResult.tokens,
			order: transformResult.tokens.map((t) => t.name),
			groupComments: transformResult.groupComments,
		};
	} catch (err) {
		if (err instanceof CircularReferenceError) {
			return {
				ok: false,
				reason: 'circular_reference',
				message: err.message,
				exitCode: err.exitCode,
			};
		}
		if (err instanceof ExtendsCycleError) {
			return {
				ok: false,
				reason: 'circular_reference',
				message: err.message,
				exitCode: err.exitCode,
			};
		}
		if (err instanceof UnresolvedReferenceError) {
			return {
				ok: false,
				reason: 'unresolved_reference',
				message: err.message,
				exitCode: err.exitCode,
			};
		}
		throw err;
	}
}

export function extractPlatform(parsed: ParsedThemefile): string[] {
	const platformParam = parsed.PARAMETER?.platform;
	if (!platformParam || platformParam === 'general') {
		if (platformParam === 'general') {
			logger.warn(
				'PARAMETER platform "general" is deprecated, use "json,jsonc" instead',
			);
		}
		return platformParam === 'general' ? ['json', 'jsonc'] : ['json'];
	}
	return platformParam
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function extractFilterLayer(
	parsed: ParsedThemefile,
): number | undefined {
	const filterLayerParam = parsed.PARAMETER?.filterLayer;
	if (typeof filterLayerParam === 'number') return filterLayerParam;
	if (typeof filterLayerParam === 'string')
		return parseInt(filterLayerParam, 10);
	return undefined;
}

export function extractColorSpace(
	parsed: ParsedThemefile,
): ColorSpaceFormat | undefined {
	const colorSpaceParam = parsed.PARAMETER?.colorSpace;
	if (
		colorSpaceParam &&
		['hex', 'oklch', 'srgb', 'hsl'].includes(colorSpaceParam)
	) {
		return colorSpaceParam as ColorSpaceFormat;
	}
	return undefined;
}

export function resolveOutputDir(
	parsed: ParsedThemefile,
	themeDir: string,
	cliOutput?: string,
): string {
	if (cliOutput) {
		return expandHomePath(cliOutput);
	}
	if (parsed.PARAMETER?.output) {
		const outputPath = parsed.PARAMETER.output;
		return path.isAbsolute(outputPath)
			? outputPath
			: path.join(themeDir, outputPath);
	}
	return path.join(themeDir, parsed.THEME);
}

// ── GROUP pipeline helpers ──────────────────────────────────────────

export function mergeParameters(
	global: ParameterSet,
	group: ParameterSet,
): ParameterSet {
	return { ...global, ...group };
}

export function resolveParameters(
	params: ParameterSet,
	themeDir: string,
	cliOutput?: string,
	cliPlatform?: string,
): ResolvedGroupParameters {
	// platforms: CLI overrides all
	const platformRaw = cliPlatform ?? params.platform;
	let platforms: string[];
	if (!platformRaw || platformRaw === 'general') {
		if (platformRaw === 'general') {
			logger.warn(
				'PARAMETER platform "general" is deprecated, use "json,jsonc" instead',
			);
		}
		platforms = platformRaw === 'general' ? ['json', 'jsonc'] : ['json'];
	} else {
		platforms = platformRaw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	// filterLayer
	const filterLayerRaw = params.filterLayer;
	const filterLayer =
		filterLayerRaw != null ? parseInt(filterLayerRaw, 10) : undefined;

	// colorSpace with explicit warning on invalid value
	let colorSpace: ColorSpaceFormat | undefined;
	const colorSpaceRaw = params.colorSpace;
	if (colorSpaceRaw) {
		if (['hex', 'oklch', 'srgb', 'hsl'].includes(colorSpaceRaw)) {
			colorSpace = colorSpaceRaw as ColorSpaceFormat;
		} else {
			logger.warn(
				`Invalid colorSpace "${colorSpaceRaw}", expected hex/oklch/srgb/hsl. Ignoring.`,
			);
		}
	}

	// outputDir: CLI > PARAMETER > default (<themeDir>/<THEME> is resolved by caller)
	const outputRaw = cliOutput ?? params.output;
	let outputDir: string;
	if (outputRaw) {
		outputDir = path.isAbsolute(outputRaw)
			? outputRaw
			: path.join(themeDir, outputRaw);
	} else {
		// default will be set by buildGroupPasses using THEME name
		outputDir = '';
	}

	return { platforms, filterLayer, colorSpace, outputDir };
}

export function buildGroupPasses(
	parsed: ParsedThemefile,
	themeDir: string,
	cliOutput?: string,
	cliPlatform?: string,
): ResolvedGroupParameters[] {
	const defaultOutputDir = path.join(themeDir, parsed.THEME);

	if (!parsed.groups || parsed.groups.length === 0) {
		// Backward compatible: single pass from global parameters
		const resolved = resolveParameters(
			parsed.PARAMETER,
			themeDir,
			cliOutput,
			cliPlatform,
		);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;
		return [resolved];
	}

	const passes: ResolvedGroupParameters[] = [];
	const seen = new Map<string, string>(); // key: "outputDir|platforms", value: group name

	for (const group of parsed.groups) {
		const merged = mergeParameters(parsed.PARAMETER, group.PARAMETER);
		const resolved = resolveParameters(
			merged,
			themeDir,
			cliOutput,
			cliPlatform,
		);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;

		// Conflict detection: duplicate (outputDir, platform) combinations
		const comboKey = `${resolved.outputDir}|${resolved.platforms.join(',')}`;
		const prev = seen.get(comboKey);
		if (prev) {
			const label = group.name ? `"${group.name}"` : '(anonymous)';
			logger.warn(
				`Duplicate (outputDir, platform) combination in GROUP ${label} (same as GROUP ${prev})`,
			);
		} else {
			seen.set(comboKey, group.name ? `"${group.name}"` : '(anonymous)');
		}

		passes.push(resolved);
	}

	return passes;
}

export { expandHomePath };
