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
import {
	deepFreeze,
	isTokenCache,
	makeTokenCacheKey,
	normalizeCachePath,
	resourceContentHash,
	type TokenCache,
} from './token-cache.ts';

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
	optionsOrCache: { readOnly?: boolean } | TokenCache = {},
	cache?: TokenCache,
): Promise<DependencyDictionary> {
	const options = isTokenCache(optionsOrCache) ? {} : optionsOrCache;
	const activeCache = isTokenCache(optionsOrCache) ? optionsOrCache : cache;
	const dict = Object.create(null) as DependencyDict;
	let loaded: LoadedDependency[] = [];
	const issues: DependencyLoadIssue[] = [];
	const ambiguous = new Set<string>();
	const signatures: Array<Record<string, unknown>> = [];

	for (const [declarationIndex, declaration] of config.resources.entries()) {
		const resource = await loadResource(
			declaration.kind,
			declaration.ref,
			themeDir,
			options,
			activeCache,
		);
		if ('line' in resource) {
			signatures.push({
				index: declarationIndex,
				declaration,
				status: 'error',
				message: resource.message,
			});
			issues.push({ ...declaration, message: resource.message });
			continue;
		}
		signatures.push({
			index: declarationIndex,
			declaration,
			status: 'loaded',
			path: normalizeCachePath(resource.path),
			source: resource.source,
			kind: resource.kind,
			contentSha256: resourceContentHash(resource.content),
		});

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

	const result: DependencyDictionary = { dict, loaded, issues };
	if (!activeCache) return result;
	const cacheKey = makeTokenCacheKey('dictionary', {
		themeDir: normalizeCachePath(themeDir),
		readOnly: options.readOnly === true,
		duplicateSemanticsVersion: 'namespace-duplicate-v1',
		declarationOrder: signatures,
		contextFingerprint: makeTokenCacheKey('dictionary', {
			resources: config.resources,
		}),
	});
	const cached = activeCache.get<DependencyDictionary>('dictionary', cacheKey);
	if (cached) return cached;
	if (issues.length > 0) return result;
	return activeCache.set('dictionary', cacheKey, deepFreeze(result));
}

export async function processThemeDocument(
	yamlPath: string,
	dict: DependencyDict,
	colorSpace?: ColorSpaceFormat,
	contentOverrideOrCache?: string | TokenCache,
	cache?: TokenCache,
): Promise<ThemeDocumentResult> {
	const contentOverride = isTokenCache(contentOverrideOrCache)
		? undefined
		: contentOverrideOrCache;
	const activeCache = isTokenCache(contentOverrideOrCache)
		? contentOverrideOrCache
		: cache;
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
	const parsed = parseThemeYaml(content, activeCache, yamlPath);

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
			{
				provenance: resolution.provenance,
				rootKeys: resolution.rootKeys,
			},
			activeCache,
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
		const resolved = resolveParameters(config.parameter, themeDir, cliOutput);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;
		return [resolved];
	}

	const passes: ResolvedGroupParameters[] = [];

	for (const group of config.parameterGroups) {
		const merged = mergeParameters(config.parameter, group.parameter);
		const resolved = resolveParameters(merged, themeDir, cliOutput);
		if (!resolved.outputDir) resolved.outputDir = defaultOutputDir;

		passes.push({ ...resolved, groupName: group.name });
	}

	return passes;
}
