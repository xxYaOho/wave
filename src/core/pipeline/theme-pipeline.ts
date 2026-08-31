import * as path from 'node:path';
import {
	type ColorSpaceFormat,
	type DesignTokenBuildConfig,
	ExitCode,
	type ParameterSet,
	type ParseError,
	type ReferenceDataSources,
	type ResolvedGroupParameters,
	type ThemeDocumentResult,
} from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { parseThemeYaml } from '../parser/theme-yaml.ts';
import {
	CircularReferenceError,
	ExtendsCycleError,
	expandExtends,
	resolveReferences,
	UnresolvedReferenceError,
} from '../resolver/index.ts';
import { loadResource } from '../resolver/resource-loader.ts';
import {
	DtcgReferenceTypeError,
	validateCompleteTokenReferenceTypes,
	validateResolvedCompositeReferences,
} from '../schema/dtcg-reference-types.ts';
import { validateThemeSchema } from '../schema/theme.ts';
import { ColorValueError } from '../transformer/color-value.ts';
import { transformToWaveTokens } from '../transformer/index.ts';

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
	loaded: LoadedDependency[];
	issues: DependencyLoadIssue[];
}

export interface LoadedDependency {
	kind: string;
	ref: string;
	namespace: string;
	data: Record<string, unknown>;
	content: string;
	path: string;
	source: 'builtin' | 'cache' | 'user';
}

export interface DependencyLoadIssue {
	kind: string;
	ref: string;
	message: string;
	namespace?: string;
}

function isParseError(result: unknown): result is ParseError {
	return (
		typeof result === 'object' &&
		result !== null &&
		'line' in result &&
		'message' in result
	);
}

export async function collectDependencyDictionary(
	config: Pick<DesignTokenBuildConfig, 'resources'>,
	themeDir: string,
): Promise<DependencyDictionary> {
	const dict = Object.create(null) as DependencyDict;
	let loaded: LoadedDependency[] = [];
	const issues: DependencyLoadIssue[] = [];
	const ambiguous = new Set<string>();

	for (const declaration of config.resources) {
		const resource = await loadResource(
			declaration.kind,
			declaration.ref,
			themeDir,
		);
		if ('line' in resource) {
			issues.push({ ...declaration, message: resource.message });
			continue;
		}

		if (ambiguous.has(resource.namespace)) {
			issues.push({
				...declaration,
				namespace: resource.namespace,
				message: `Duplicate namespace "${resource.namespace}"`,
			});
			continue;
		}
		if (dict[resource.namespace]) {
			delete dict[resource.namespace];
			loaded = loaded.filter((entry) => entry.namespace !== resource.namespace);
			ambiguous.add(resource.namespace);
			issues.push({
				...declaration,
				namespace: resource.namespace,
				message: `Duplicate namespace "${resource.namespace}"`,
			});
			continue;
		}

		const entry = { ...declaration, ...resource };
		dict[resource.namespace] = {
			data: resource.data,
			path: resource.path,
			kind: declaration.kind,
			source: resource.source,
		};
		loaded.push(entry);
	}

	return { dict, loaded, issues };
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

		validateCompleteTokenReferenceTypes(expanded, sources);
		const resolution = resolveReferences(expanded, sources);
		validateResolvedCompositeReferences(resolution.tree, resolution.provenance);
		const resolved = resolution.tree;
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
		if (err instanceof DtcgReferenceTypeError) {
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
	if (platformRaw === undefined || platformRaw === 'general') {
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
	config: DesignTokenBuildConfig,
	themeDir: string,
	cliOutput?: string,
	cliPlatform?: string,
): ResolvedGroupParameters[] {
	const defaultOutputDir = path.join(themeDir, config.theme);
	if (cliPlatform !== undefined) {
		const resolved = resolveParameters(
			config.parameter,
			themeDir,
			cliOutput,
			cliPlatform,
		);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;
		return [resolved];
	}

	if (config.parameterGroups.length === 0) {
		const resolved = resolveParameters(
			config.parameter,
			themeDir,
			cliOutput,
			cliPlatform,
		);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;
		return [resolved];
	}

	const passes: ResolvedGroupParameters[] = [];

	for (const group of config.parameterGroups) {
		const merged = mergeParameters(config.parameter, group.parameter);
		const resolved = resolveParameters(
			merged,
			themeDir,
			cliOutput,
			cliPlatform,
		);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;

		passes.push({ ...resolved, groupName: group.name });
	}

	return passes;
}
