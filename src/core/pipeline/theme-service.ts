import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { detectNightMode, detectVariants } from '../../core/detector/index.ts';
import type { ThemeFileEntry } from '../../core/doctor/theme-context.ts';
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
import { transformToWaveTokens } from '../transformer/index.ts';
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

export interface ThemeGenerationInput {
	themeName: string;
	themePath?: string;
	cliOutput?: string;
	cliPlatform?: string;
	generateOptions: GenerateOptions;
	selectedThemes?: ThemeFileEntry[];
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

function isSelected(
	selected: ThemeFileEntry[] | undefined,
	name: string,
): boolean {
	if (!selected) return true;
	return selected.some((s) => s.name === name);
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
	selectedThemes?: ThemeFileEntry[],
	ctx?: BuildContext,
	warnLegacyFallback?: () => void,
): Promise<{ files: string[] } | ThemeGenerationFailure> {
	const files: string[] = [];

	const mainYamlPath = mainYamlPathOverride ?? path.join(themeDir, 'main.yaml');
	const mainYamlFile = Bun.file(mainYamlPath);
	const hasMainYaml =
		mainYamlContentOverride !== undefined || (await mainYamlFile.exists());

	if (hasMainYaml && isSelected(selectedThemes, 'main')) {
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
			ctx?.markFailed('parse', msg, { phase: 'main parse' });
			return {
				ok: false,
				exitCode: parseResult.exitCode,
				message: msg,
			};
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
			ctx?.markFailed('generate', msg, { phase: 'main generate' });
			return {
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
				message: msg,
			};
		}

		files.push(...mainResult.files);
		ctx?.addOutput('main', mainResult.files);
		if (!ctx) logger.success(`Generated main: ${mainResult.files.join(', ')}`);
	} else if (isSelected(selectedThemes, 'main')) {
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
		ctx?.addOutput('main', result.files);
		if (!ctx) logger.success(`Generated main: ${result.files.join(', ')}`);
	}

	return { files };
}

export async function generateTheme(
	input: ThemeGenerationInput,
	ctx?: BuildContext,
): Promise<ThemeGenerationResult> {
	const {
		themeName,
		themePath,
		cliOutput,
		cliPlatform,
		generateOptions,
		selectedThemes,
	} = input;
	const legacyFallbackWarnings = new Set<string>();
	const warnLegacyFallback = (): void => {
		if (legacyFallbackWarnings.has('main')) return;
		legacyFallbackWarnings.add('main');
		logger.warn(MAIN_FALLBACK_WARNING);
		ctx?.addWarning('main', MAIN_FALLBACK_WARNING);
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
		const source = loaded?.path.includes('src/resources')
			? 'builtin'
			: loaded?.path.includes('/.cache/wave/resources/') ||
					loaded?.path.includes('\\.cache\\wave\\resources\\')
				? 'cache'
				: 'user';
		ctx?.addResource(kind, ref, source);
		if (!ctx) {
			logger.success(`Resource [${kind}]: ${ref} (${source})`);
		}
	}

	// Step 3: Build group passes
	const passes = buildGroupPasses(parsed, themeDir, cliOutput, cliPlatform);

	// Step 4: Generate main theme for each pass
	const generatedFiles: string[] = [];

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
			selectedThemes,
			ctx,
			warnLegacyFallback,
		);

		if (!('files' in result)) {
			return result;
		}

		generatedFiles.push(...result.files);
	}

	// Step 5: Generate night mode
	const nightResult = detectNightMode(themeDir, generateOptions);
	if (nightResult.available) {
		ctx?.setNight('enabled');
	} else if (nightResult.message.includes('disabled')) {
		ctx?.setNight('disabled');
	} else {
		ctx?.setNight('skipped');
	}
	if (!ctx) logger.info(nightResult.message);

	if (nightResult.available && isSelected(selectedThemes, 'main@night')) {
		const nightYamlPath = path.join(themeDir, 'main@night.yaml');
		const nightYamlFile = Bun.file(nightYamlPath);
		const hasNightYaml = await nightYamlFile.exists();

		if (hasNightYaml) {
			for (const pass of passes) {
				if (!ctx)
					logger.info('Found main@night.yaml, parsing night theme tokens...');
				const nightParseResult = await processThemeDocument(
					nightYamlPath,
					dict,
					pass.colorSpace as ColorSpaceFormat | undefined,
				);

				if (!nightParseResult.ok) {
					const msg = nightParseResult.line
						? `${nightParseResult.message} at line ${nightParseResult.line}`
						: nightParseResult.message;
					ctx?.markFailed('parse', msg, { phase: 'night parse' });
					return {
						ok: false,
						exitCode: nightParseResult.exitCode,
						message: msg,
					};
				}

				const nightGenResult = await generateTokens({
					themeName: `${resolvedThemeName}-night`,
					outputDir: pass.outputDir,
					tokens: nightParseResult.tree,
					platform: pass.platforms,
					filterLayer: pass.filterLayer,
					groupComments: nightParseResult.groupComments,
					resolved: nightParseResult.resolved,
					colorSpace: pass.colorSpace as ColorSpaceFormat | undefined,
				});

				if (nightGenResult.success) {
					generatedFiles.push(...nightGenResult.files);
					ctx?.addOutput('night', nightGenResult.files);
					if (!ctx)
						logger.success(
							`Generated night: ${nightGenResult.files.join(', ')}`,
						);
				}
			}
		} else {
			for (const pass of passes) {
				const nightGenResult = await generateThemeTokens(
					`${resolvedThemeName}-night`,
					pass.outputDir,
					depResult,
					pass.platforms,
					pass.filterLayer,
					pass.colorSpace as ColorSpaceFormat | undefined,
				);
				if (nightGenResult.success) {
					generatedFiles.push(...nightGenResult.files);
					ctx?.addOutput('night', nightGenResult.files);
					if (!ctx)
						logger.success(
							`Generated night: ${nightGenResult.files.join(', ')}`,
						);
				}
			}
		}
	}

	// Step 6: Generate variants
	const variantsDetection = detectVariants(themeDir, generateOptions);
	const variantNames = variantsDetection.files.map((f) =>
		path.basename(f, '.yaml'),
	);
	if (variantsDetection.available) {
		ctx?.setVariants('enabled', variantsDetection.files.length, variantNames);
	} else if (variantsDetection.message.includes('disabled')) {
		ctx?.setVariants('disabled', 0, []);
	} else {
		ctx?.setVariants('none', 0, []);
	}
	if (!ctx) logger.info(variantsDetection.message);

	if (variantsDetection.available) {
		for (const variantFile of variantsDetection.files) {
			const variantName = path.basename(variantFile, '.yaml');
			if (!isSelected(selectedThemes, variantName)) {
				continue;
			}
			const isNightVariant = variantName.endsWith('@night');
			const baseName = isNightVariant
				? variantName.replace('@night', '')
				: variantName;
			const suffix = isNightVariant ? `-${baseName}-night` : `-${baseName}`;

			for (const pass of passes) {
				const variantTokens = await processThemeDocument(
					variantFile,
					dict,
					pass.colorSpace as ColorSpaceFormat | undefined,
				);

				if (!variantTokens.ok) {
					const msg = variantTokens.line
						? `${variantTokens.message} at line ${variantTokens.line}`
						: variantTokens.message;
					ctx?.markFailed('parse', msg, { phase: 'variant parse' });
					return {
						ok: false,
						exitCode: variantTokens.exitCode,
						message: msg,
					};
				}

				const variantResult = await generateTokens({
					themeName: `${resolvedThemeName}${suffix}`,
					outputDir: pass.outputDir,
					tokens: variantTokens.tree,
					platform: pass.platforms,
					filterLayer: pass.filterLayer,
					groupComments: variantTokens.groupComments,
					resolved: variantTokens.resolved,
					colorSpace: pass.colorSpace as ColorSpaceFormat | undefined,
				});

				if (variantResult.success) {
					generatedFiles.push(...variantResult.files);
					ctx?.addOutput('variant', variantResult.files, variantName);
					if (!ctx) {
						logger.success(
							`Generated variant ${variantName}: ${variantResult.files.join(', ')}`,
						);
					}
				}
			}
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
	const { paletteContent, dimensionContent, palettePath, dimensionPath } =
		depResult;

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
