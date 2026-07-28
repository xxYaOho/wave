import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { GeneratorResult } from '../../core/generator/index.ts';
import { generateTokens } from '../../core/generator/index.ts';
import {
	parseDimension,
	parsePalette,
	validateDimensionSchema,
	validatePaletteSchema,
} from '../../core/parser/index.ts';
import type {
	ColorSpaceFormat,
	ExitCodeType,
	GenerateOptions,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import type { BuildContext } from '../../utils/receipt.ts';
import {
	DIMENSION_BUILD_WARNING,
	findPublicDimensionRoots,
} from '../doctor/dimension-migration.ts';
import { transformToWaveTokens } from '../transformer/index.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
	type ProfileDocument,
	type ProfileEntry,
	parseProfileDocument,
	resolveProfilesToBuild,
} from './profile-resolver.ts';
import {
	buildDependencyDictionary,
	buildGroupPasses,
	type DependencyDict,
	type DependencyDictionary,
	loadThemefile,
	processThemeDocument,
} from './theme-pipeline.ts';

const MAIN_FALLBACK_WARNING =
	'No main.yaml found. Direct RESOURCE token generation is deprecated and will be removed; create main.yaml with wave dt init.';

function parseYamlObject(content: string): Record<string, unknown> | undefined {
	const parsed = yaml.load(content);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	return parsed as Record<string, unknown>;
}

export interface ThemeGenerationInput {
	themeName: string;
	themePath?: string;
	cliOutput?: string;
	cliPlatform?: string;
	generateOptions: GenerateOptions;
}

export interface ThemeGenerationSuccess {
	ok: true;
	themeName: string;
	outputDir: string;
	generatedFiles: string[];
}

export interface ThemeGenerationFailure {
	ok: false;
	exitCode: ExitCodeType;
	message: string;
	line?: number;
}

export type ThemeGenerationResult =
	| ThemeGenerationSuccess
	| ThemeGenerationFailure;

function profileThemeName(
	baseThemeName: string,
	profile: ProfileDocument,
): string {
	return profile.entry.isDefault
		? baseThemeName
		: `${baseThemeName}-${profile.entry.name}`;
}

async function generatePass(
	resolvedThemeName: string,
	themeDir: string,
	outputDir: string,
	dict: DependencyDict,
	depResult: DependencyDictionary,
	platforms: string[],
	filterLayer: number | undefined,
	colorSpace: string | undefined,
	_generateOptions: GenerateOptions,
	mainYamlPathOverride?: string,
	mainYamlContentOverride?: string,
	ctx?: BuildContext,
	warnLegacyFallback?: () => void,
	outputScope: 'main' | 'profile' | 'night' = 'main',
	outputLabel?: string,
	fatal: boolean = true,
): Promise<{ files: string[] } | ThemeGenerationFailure> {
	const files: string[] = [];

	const mainYamlPath = mainYamlPathOverride ?? path.join(themeDir, 'main.yaml');
	const mainYamlFile = Bun.file(mainYamlPath);
	const hasMainYaml =
		mainYamlContentOverride !== undefined || (await mainYamlFile.exists());

	if (hasMainYaml) {
		if (!ctx) logger.info('Found main.yaml, parsing theme tokens...');
		const parseResult = await processThemeDocument(
			mainYamlPath,
			dict,
			colorSpace as ColorSpaceFormat | undefined,
			mainYamlContentOverride,
		);

		if (!parseResult.ok) {
			const msg = parseResult.line
				? `${parseResult.message} at line ${parseResult.line}`
				: parseResult.message;
			if (fatal) ctx?.markFailed('parse', msg, { phase: 'main parse' });
			return {
				ok: false,
				exitCode: parseResult.exitCode,
				message: msg,
			};
		}

		if (findPublicDimensionRoots(parseResult.resolved).length > 0) {
			if (
				!ctx?.warnings.some(
					(warning) => warning.message === DIMENSION_BUILD_WARNING,
				)
			) {
				ctx?.addWarning('dimension', DIMENSION_BUILD_WARNING);
			}
			if (!ctx) logger.warn(DIMENSION_BUILD_WARNING);
		}

		await fs.mkdir(outputDir, { recursive: true });
		const mainResult = await generateTokens({
			themeName: resolvedThemeName,
			outputDir,
			tokens: parseResult.tree,
			platform: platforms,
			filterLayer,
			groupComments: parseResult.groupComments,
			resolved: parseResult.resolved,
			colorSpace: colorSpace as ColorSpaceFormat | undefined,
		});

		if (!mainResult.success) {
			const msg = mainResult.error || 'Failed to generate tokens';
			if (fatal) ctx?.markFailed('generate', msg, { phase: 'main generate' });
			return {
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
				message: msg,
			};
		}

		files.push(...mainResult.files);
		ctx?.addOutput(outputScope, mainResult.files, outputLabel);
		if (!ctx) logger.success(`Generated main: ${mainResult.files.join(', ')}`);
	} else {
		// No main.yaml — generate from palette + dimension directly
		warnLegacyFallback?.();
		const result = await generateThemeTokens(
			resolvedThemeName,
			outputDir,
			depResult,
			platforms,
			filterLayer,
			colorSpace as ColorSpaceFormat | undefined,
		);

		if (!result.success) {
			const msg = result.error || 'Failed to generate tokens';
			ctx?.markFailed('generate', msg, { phase: 'main generate' });
			return {
				ok: false,
				exitCode: result.error?.includes('schema error')
					? ExitCode.INVALID_RESOURCE
					: ExitCode.GENERAL_ERROR,
				message: msg,
			};
		}

		files.push(...result.files);
		ctx?.addOutput(outputScope, result.files, outputLabel);
		if (!ctx) logger.success(`Generated main: ${result.files.join(', ')}`);
	}

	return { files };
}

export async function generateTheme(
	input: ThemeGenerationInput,
	ctx?: BuildContext,
): Promise<ThemeGenerationResult> {
	const { themeName, themePath, cliOutput, cliPlatform, generateOptions } =
		input;
	const resolvedCliOutput =
		cliOutput && !path.isAbsolute(cliOutput)
			? path.resolve(process.cwd(), cliOutput)
			: cliOutput;
	const legacyFallbackWarnings = new Set<string>();
	const nightSkipWarnings = new Set<string>();
	const warnLegacyFallback = (): void => {
		if (legacyFallbackWarnings.has('main')) return;
		legacyFallbackWarnings.add('main');
		logger.warn(MAIN_FALLBACK_WARNING);
		ctx?.addWarning('main', MAIN_FALLBACK_WARNING);
	};
	const warnNightSkipped = (name: string): void => {
		if (nightSkipWarnings.has(name)) return;
		nightSkipWarnings.add(name);
		if (ctx?.nightMode.state !== 'enabled') {
			ctx?.setNight('skipped', NIGHT_SKIP_MESSAGE);
		}
		ctx?.addWarning('night', NIGHT_SKIP_MESSAGE);
		if (!ctx) logger.warn(NIGHT_SKIP_MESSAGE);
	};

	// Step 1: Load themefile
	const loadResult = await loadThemefile(themePath);
	if ('error' in loadResult) {
		const err = loadResult.error;
		const phase = err.message.includes('not found')
			? 'themefile load'
			: 'themefile parse';
		ctx?.markFailed('load', err.message, {
			phase,
			detail: err.message,
			line: 'line' in err ? (err as { line: number }).line : undefined,
		});
		if (err.message.includes('not found')) {
			return {
				ok: false,
				exitCode: ExitCode.FILE_NOT_FOUND,
				message: err.message,
			};
		}
		if ('line' in err) {
			return {
				ok: false,
				exitCode: ExitCode.FORMAT_ERROR,
				message: err.message,
				line: (err as { line: number }).line,
			};
		}
		return {
			ok: false,
			exitCode: ExitCode.GENERAL_ERROR,
			message: err.message,
		};
	}

	const { parsed, themeDir, mainYamlPath, mainYamlContent } = loadResult;
	const resolvedThemeName = parsed.THEME || themeName;

	// Step 2: Build dependency dictionary (once)
	const depResult = await buildDependencyDictionary(parsed, themeDir);
	if ('error' in depResult) {
		const errMsg = depResult.error.message;
		ctx?.markFailed('resource', errMsg, { phase: 'resource resolve' });
		return {
			ok: false,
			exitCode: errMsg.includes('schema error')
				? ExitCode.INVALID_RESOURCE
				: ExitCode.FILE_NOT_FOUND,
			message: errMsg,
		};
	}

	const { dict } = depResult;

	// Collect resources
	for (const { kind, ref } of parsed.resources) {
		const loaded = Object.values(dict).find((e) => e.kind === kind);
		const source = loaded?.source ?? 'user';
		ctx?.addResource(kind, ref, source);
		if (!ctx) {
			logger.success(`Resource [${kind}]: ${ref} (${source})`);
		}
	}

	const generatedFiles: string[] = [];

	const profiles = await discoverProfiles(themeDir);
	if (profiles.length === 0) {
		if (generateOptions.profile || generateOptions.profiles) {
			const message = 'No main.yaml found';
			ctx?.markFailed('load', message, { phase: 'profile resolve' });
			return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
		}

		ctx?.setProfiles('default', 1, ['main']);
		const passes = buildGroupPasses(
			parsed,
			themeDir,
			resolvedCliOutput,
			cliPlatform,
		);
		const firstPass = passes[0]!;
		if (ctx) ctx.outputDir = firstPass.outputDir;
		for (const pass of passes) {
			const result = await generatePass(
				resolvedThemeName,
				themeDir,
				pass.outputDir,
				dict,
				depResult,
				pass.platforms,
				pass.filterLayer,
				pass.colorSpace,
				generateOptions,
				mainYamlPath,
				mainYamlContent,
				ctx,
				warnLegacyFallback,
				'main',
			);
			if (!('files' in result)) return result;
			generatedFiles.push(...result.files);
		}
		return {
			ok: true,
			themeName: resolvedThemeName,
			outputDir: firstPass.outputDir,
			generatedFiles,
		};
	}

	let selectedProfiles: ProfileEntry[];
	try {
		selectedProfiles = resolveProfilesToBuild(profiles, generateOptions);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx?.markFailed('load', message, { phase: 'profile resolve' });
		return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
	}

	ctx?.setProfiles(
		generateOptions.profiles === 'all'
			? 'all'
			: generateOptions.profile
				? 'single'
				: 'default',
		selectedProfiles.length,
		selectedProfiles.map((profile) => profile.name),
	);

	const baseProfile = profiles.find((profile) => profile.isDefault);
	if (!baseProfile) {
		const message = 'No main.yaml found';
		ctx?.markFailed('load', message, { phase: 'profile resolve' });
		return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
	}

	const baseDocument = await parseProfileDocument(baseProfile, {
		defaultParsed: parsed,
		baseDir: themeDir,
	});
	const baseDayTree = parseYamlObject(baseDocument.tokenContent);
	const firstPass = buildGroupPasses(
		baseDocument.parsed,
		baseDocument.buildDir,
		resolvedCliOutput,
		cliPlatform,
	)[0]!;
	if (ctx) ctx.outputDir = firstPass.outputDir;

	for (const entry of selectedProfiles) {
		const document = entry.isDefault
			? baseDocument
			: await parseProfileDocument(entry, {
					baseParsed: baseDocument.parsed,
					baseDir: themeDir,
				});
		const dayTree = entry.isDefault
			? baseDayTree
			: parseYamlObject(document.tokenContent);
		const profileDepResult = await buildDependencyDictionary(
			document.parsed,
			themeDir,
		);
		if ('error' in profileDepResult) {
			const message = profileDepResult.error.message;
			ctx?.markFailed('resource', message, {
				phase: `${entry.name} resource resolve`,
			});
			return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
		}
		const profilePasses = buildGroupPasses(
			document.parsed,
			document.buildDir,
			resolvedCliOutput,
			cliPlatform,
		);
		for (const pass of profilePasses) {
			const result = await generatePass(
				profileThemeName(resolvedThemeName, document),
				path.dirname(entry.path),
				pass.outputDir,
				profileDepResult.dict,
				profileDepResult,
				pass.platforms,
				pass.filterLayer,
				pass.colorSpace,
				generateOptions,
				entry.path,
				document.tokenContent,
				ctx,
				warnLegacyFallback,
				entry.isDefault ? 'main' : 'profile',
				entry.isDefault ? undefined : entry.name,
			);
			if (!('files' in result)) return result;
			generatedFiles.push(...result.files);
		}

		if (!generateOptions.night) {
			ctx?.setNight('disabled');
			continue;
		}
		if (!entry.nightPath || !dayTree) {
			warnNightSkipped(entry.name);
			continue;
		}

		let nightTree: Record<string, unknown> | undefined;
		try {
			nightTree = parseYamlObject(await Bun.file(entry.nightPath).text());
		} catch {
			nightTree = undefined;
		}
		if (!nightTree) {
			warnNightSkipped(entry.name);
			continue;
		}

		const mergedNight = mergeNightOverlay(dayTree, nightTree);
		if (!mergedNight.ok) {
			warnNightSkipped(entry.name);
			continue;
		}

		ctx?.setNight('enabled');
		const nightContent = yaml.dump(mergedNight.tree, { lineWidth: -1 });
		for (const pass of profilePasses) {
			const result = await generatePass(
				`${profileThemeName(resolvedThemeName, document)}-night`,
				path.dirname(entry.path),
				pass.outputDir,
				profileDepResult.dict,
				profileDepResult,
				pass.platforms,
				pass.filterLayer,
				pass.colorSpace,
				generateOptions,
				entry.nightPath,
				nightContent,
				ctx,
				warnLegacyFallback,
				'night',
				entry.isDefault ? undefined : entry.name,
				false,
			);
			if (!('files' in result)) {
				warnNightSkipped(entry.name);
				break;
			}
			generatedFiles.push(...result.files);
		}
	}

	return {
		ok: true,
		themeName: resolvedThemeName,
		outputDir: firstPass.outputDir,
		generatedFiles,
	};
}

// Helper function for generating tokens without main.yaml
// Uses static top-level imports — no dynamic import()
async function generateThemeTokens(
	themeName: string,
	outputDir: string,
	depResult: DependencyDictionary,
	platforms?: string[],
	filterLayer?: number,
	colorSpace?: ColorSpaceFormat,
): Promise<GeneratorResult> {
	const paletteDependency = depResult.loaded.find(
		(entry) => entry.kind === 'palette',
	);
	const dimensionDependency = depResult.loaded.find(
		(entry) => entry.kind === 'dimension',
	);
	if (!paletteDependency || !dimensionDependency) {
		return {
			success: false,
			files: [],
			error: 'Missing required palette or dimension resource',
		};
	}
	const { content: paletteContent, path: palettePath } = paletteDependency;
	const { content: dimensionContent, path: dimensionPath } =
		dimensionDependency;

	const paletteSchemaError = await validatePaletteSchema(
		paletteContent,
		palettePath,
	);
	if (paletteSchemaError) {
		throw new Error(`Palette schema error: ${paletteSchemaError.message}`);
	}

	const dimensionSchemaError = await validateDimensionSchema(
		dimensionContent,
		dimensionPath,
	);
	if (dimensionSchemaError) {
		throw new Error(`Dimension schema error: ${dimensionSchemaError.message}`);
	}

	const palette = parsePalette(paletteContent);
	if (palette && 'line' in palette && 'message' in palette) {
		throw new Error(
			`Palette parse error at line ${palette.line}: ${palette.message}`,
		);
	}

	const dimension = parseDimension(dimensionContent);
	if (dimension && 'line' in dimension && 'message' in dimension) {
		throw new Error(`Dimension parse error: ${dimension.message}`);
	}

	// Wrap palette + dimension in a synthetic resolved theme tree so the same
	// transformer can produce WaveToken[] for the no-main.yaml fallback path.
	const syntheticTree = {
		color: (palette as { color: unknown }).color,
		dimension: (dimension as { dimension: unknown }).dimension,
	} as unknown as ResolvedTokenGroup;

	const transformResult = transformToWaveTokens(
		syntheticTree,
		undefined,
		colorSpace,
	);

	await fs.mkdir(outputDir, { recursive: true });

	return generateTokens({
		themeName,
		outputDir,
		tokens: transformResult.tokens,
		resolved: syntheticTree,
		colorSpace,
		platform: platforms,
		filterLayer,
	});
}
