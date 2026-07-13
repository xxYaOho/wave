import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
	type ColorSpaceFormat,
	type DimensionResult,
	ExitCode,
	type PaletteResult,
	type ParameterSet,
	type ParsedThemefile,
	type ParseError,
	type ReferenceDataSources,
	type ResolvedGroupParameters,
	type ThemeDocumentResult,
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
import { ColorValueError } from '../transformer/color-value.ts';
import { transformToWaveTokens } from '../transformer/index.ts';

export interface ThemefileLoadResult {
	parsed: ParsedThemefile;
	themeDir: string;
	themefilePath: string;
	themefileContent: string;
	mainYamlPath?: string;
	mainYamlContent?: string;
}

export interface DependencyDict {
	[namespace: string]: {
		data: Record<string, unknown>;
		path: string;
		kind: string;
		source: 'builtin' | 'cache' | 'user';
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

function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	if (typeof value === 'string') return [value];
	return [];
}

function normalizeParameterValue(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is string => typeof item === 'string')
			.join(',');
	}
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return String(value);
	return undefined;
}

function normalizeParameterSet(value: unknown): ParameterSet {
	const params: ParameterSet = {};
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return params;
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		const normalized = normalizeParameterValue(raw);
		if (normalized !== undefined) {
			const mappedKey = key === 'outputDir' ? 'output' : key;
			params[mappedKey] = normalized;
		}
	}
	return params;
}

function parseMainConfig(
	content: string,
	mainPath: string,
): { parsed: ParsedThemefile; tokenContent: string } | ParseError {
	let loaded: unknown;
	try {
		loaded = yaml.load(content);
	} catch (err) {
		if (err instanceof yaml.YAMLException) {
			return {
				line: err.mark?.line ? err.mark.line + 1 : 1,
				message: `YAML 语法错误: ${err.message}`,
			};
		}
		return {
			line: 1,
			message: `解析错误: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
		return { line: 1, message: 'main.yaml root must be an object' };
	}

	const root = loaded as Record<string, unknown>;
	const config = root.$config;
	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		return { line: 1, message: 'Missing required $config in main.yaml entry' };
	}

	const configObj = config as Record<string, unknown>;
	const theme =
		typeof configObj.theme === 'string'
			? configObj.theme
			: path.basename(path.dirname(mainPath));
	const resources: { kind: string; ref: string }[] = [];
	const resourceConfig = configObj.resource;
	if (
		resourceConfig &&
		typeof resourceConfig === 'object' &&
		!Array.isArray(resourceConfig)
	) {
		for (const [kind, refs] of Object.entries(
			resourceConfig as Record<string, unknown>,
		)) {
			for (const ref of toStringList(refs)) {
				resources.push({ kind, ref });
			}
		}
	}
	if (resources.length === 0) {
		return {
			line: 1,
			message: 'Missing required $config.resource declarations',
		};
	}

	const parameter = normalizeParameterSet(configObj.parameter);
	const groups = [] as ParsedThemefile['groups'];
	const parameterGroup = configObj.parameterGroup;
	if (
		parameterGroup &&
		typeof parameterGroup === 'object' &&
		!Array.isArray(parameterGroup)
	) {
		for (const [name, groupParams] of Object.entries(
			parameterGroup as Record<string, unknown>,
		)) {
			groups.push({ name, PARAMETER: normalizeParameterSet(groupParams) });
		}
	}

	const tokenRoot = { ...root };
	delete tokenRoot.$config;
	return {
		parsed: {
			THEME: theme,
			PARAMETER: parameter,
			resources,
			groups,
		},
		tokenContent: yaml.dump(tokenRoot, { lineWidth: -1 }),
	};
}

function isParseError(result: unknown): result is ParseError {
	return (
		typeof result === 'object' &&
		result !== null &&
		'line' in result &&
		'message' in result
	);
}

export async function loadThemefile(
	themePath?: string,
): Promise<ThemefileLoadResult | { error: ParseError | Error }> {
	const expandedThemePath = themePath ? expandHomePath(themePath) : undefined;
	const themeDir = expandedThemePath
		? path.dirname(expandedThemePath)
		: process.cwd();

	if (expandedThemePath && /\.ya?ml$/i.test(expandedThemePath)) {
		let mainYamlContent: string;
		try {
			mainYamlContent = await loadYamlFile(expandedThemePath);
		} catch (err) {
			return { error: err instanceof Error ? err : new Error(String(err)) };
		}
		const configResult = parseMainConfig(mainYamlContent, expandedThemePath);
		if (isParseError(configResult)) {
			return { error: configResult };
		}
		return {
			parsed: configResult.parsed,
			themeDir,
			themefilePath: expandedThemePath,
			themefileContent: mainYamlContent,
			mainYamlPath: expandedThemePath,
			mainYamlContent: configResult.tokenContent,
		};
	}

	const themefilePath = expandedThemePath ?? path.join(themeDir, 'themefile');

	let themefileContent: string;
	try {
		themefileContent = await loadYamlFile(themefilePath);
	} catch (err) {
		return { error: err instanceof Error ? err : new Error(String(err)) };
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
			source: loaded.source,
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

	const schemaResult = validateThemeSchema(parsed.raw, 'raw');
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
		const rootKeys = new Set(
			Object.keys(parsed.raw).filter((k) => !k.startsWith('$')),
		);
		if (rootKeys.size === 0) rootKeys.add('theme');
		const expanded = expandExtends(parsed.raw, rootKeys);

		const resolved = resolveReferences(expanded, sources);
		const resolvedSchemaResult = validateThemeSchema(resolved, 'resolved');
		if (!resolvedSchemaResult.valid) {
			const errorMessages = resolvedSchemaResult.issues
				.filter((i) => i.level === 'error')
				.map((i) => `  [${i.path}] ${i.message}`)
				.join('\n');
			return {
				ok: false,
				reason: 'schema_error',
				message: `Theme schema validation failed after reference resolution:\n${errorMessages}`,
				exitCode: ExitCode.FORMAT_ERROR,
			};
		}
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
			resolved,
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
		if (err instanceof ColorValueError) {
			return {
				ok: false,
				reason: 'schema_error',
				message: err.message,
				exitCode: ExitCode.FORMAT_ERROR,
			};
		}
		throw err;
	}
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
