import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { detectNightMode, detectVariants } from '../../core/detector/index.ts';
import type { GeneratorResult } from '../../core/generator/index.ts';
import { generateTokens } from '../../core/generator/index.ts';
import type {
	ExitCodeType,
	GenerateOptions,
	ParsedThemefile,
	ThemeDocumentResult,
} from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import {
	buildDependencyDictionary,
	expandHomePath,
	extractColorSpace,
	extractFilterLayer,
	extractPlatform,
	loadThemefile,
	processThemeDocument,
	resolveOutputDir,
} from './theme-pipeline.ts';

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

// CQ-007: Theme generation orchestration service
// Extracts CLI command logic into a reusable core service
export async function generateTheme(
	input: ThemeGenerationInput,
): Promise<ThemeGenerationResult> {
	const { themeName, themePath, cliOutput, cliPlatform, generateOptions } =
		input;

	// Step 1: Load themefile
	const loadResult = await loadThemefile(themePath);
	if ('error' in loadResult) {
		const err = loadResult.error;
		if (err.message.includes('not found')) {
			return {
				ok: false,
				exitCode: 10, // FILE_NOT_FOUND
				message: err.message,
			};
		} else if ('line' in err) {
			return {
				ok: false,
				exitCode: 12, // FORMAT_ERROR
				message: err.message,
				line: (err as { line: number }).line,
			};
		} else {
			return {
				ok: false,
				exitCode: 1, // GENERAL_ERROR
				message: err.message,
			};
		}
	}

	const { parsed, themeDir } = loadResult;
	const resolvedThemeName = parsed.THEME || themeName;

	// Step 2: Extract configuration
	const platforms = cliPlatform
		? cliPlatform
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		: extractPlatform(parsed);
	const filterLayer = extractFilterLayer(parsed);
	const colorSpace = extractColorSpace(parsed);

	// Step 3: Build dependency dictionary
	const depResult = await buildDependencyDictionary(parsed, themeDir);
	if ('error' in depResult) {
		const errMsg = depResult.error.message;
		return {
			ok: false,
			exitCode: errMsg.includes('schema error') ? 13 : 10, // INVALID_RESOURCE or FILE_NOT_FOUND
			message: errMsg,
		};
	}

	const {
		palette,
		dimension,
		paletteContent,
		dimensionContent,
		palettePath,
		dimensionPath,
		dict,
	} = depResult;

	const outputDir = resolveOutputDir(parsed, themeDir, cliOutput);

	// Log resources
	for (const { kind, ref } of parsed.resources) {
		const loaded = Object.values(dict).find((e) => e.kind === kind);
		const isBuiltin = loaded?.path.includes('src/resources') ?? false;
		logger.success(
			`Resource [${kind}]: ${ref} (${isBuiltin ? 'builtin' : 'user'})`,
		);
	}

	// Step 4: Generate main theme
	const generatedFiles: string[] = [];
	const mainYamlPath = path.join(themeDir, 'main.yaml');
	const mainYamlFile = Bun.file(mainYamlPath);
	const hasMainYaml = await mainYamlFile.exists();

	let mainResult: GeneratorResult;

	if (hasMainYaml) {
		logger.info('Found main.yaml, parsing theme tokens...');
		const parseResult = await processThemeDocument(
			mainYamlPath,
			dict,
			colorSpace,
		);

		if (!parseResult.ok) {
			return {
				ok: false,
				exitCode: parseResult.exitCode,
				message: parseResult.line
					? `${parseResult.message} at line ${parseResult.line}`
					: parseResult.message,
			};
		}

		await fs.mkdir(outputDir, { recursive: true });
		mainResult = await generateTokens({
			themeName: resolvedThemeName,
			outputDir,
			tokens: parseResult.tree,
			platform: platforms,
			filterLayer,
			groupComments: parseResult.groupComments,
		});

		if (!mainResult.success) {
			return {
				ok: false,
				exitCode: 1, // GENERAL_ERROR
				message: mainResult.error || 'Failed to generate tokens',
			};
		}

		generatedFiles.push(...mainResult.files);
		logger.success(`Generated main: ${mainResult.files.join(', ')}`);
	} else {
		mainResult = await generateThemeTokens(
			resolvedThemeName,
			outputDir,
			paletteContent,
			dimensionContent,
			platforms,
			filterLayer,
			palettePath,
			dimensionPath,
		);

		if (!mainResult.success) {
			return {
				ok: false,
				exitCode: mainResult.error?.includes('schema error') ? 13 : 1,
				message: mainResult.error || 'Failed to generate tokens',
			};
		}

		generatedFiles.push(...mainResult.files);
		logger.success(`Generated main: ${mainResult.files.join(', ')}`);
	}

	// Step 5: Generate night mode
	const nightResult = detectNightMode(themeDir, generateOptions);
	logger.info(nightResult.message);

	if (nightResult.available) {
		const nightYamlPath = path.join(themeDir, 'main@night.yaml');
		const nightYamlFile = Bun.file(nightYamlPath);
		const hasNightYaml = await nightYamlFile.exists();

		if (hasNightYaml) {
			logger.info('Found main@night.yaml, parsing night theme tokens...');
			const nightParseResult = await processThemeDocument(
				nightYamlPath,
				dict,
				colorSpace,
			);

			if (!nightParseResult.ok) {
				return {
					ok: false,
					exitCode: nightParseResult.exitCode,
					message: nightParseResult.line
						? `${nightParseResult.message} at line ${nightParseResult.line}`
						: nightParseResult.message,
				};
			}

			const nightGenResult = await generateTokens({
				themeName: `${resolvedThemeName}-night`,
				outputDir,
				tokens: nightParseResult.tree,
				platform: platforms,
				filterLayer,
				groupComments: nightParseResult.groupComments,
			});

			if (nightGenResult.success) {
				generatedFiles.push(...nightGenResult.files);
				logger.success(`Generated night: ${nightGenResult.files.join(', ')}`);
			}
		} else {
			const nightGenResult = await generateThemeTokens(
				`${resolvedThemeName}-night`,
				outputDir,
				paletteContent,
				dimensionContent,
				platforms,
				filterLayer,
				palettePath,
				dimensionPath,
			);
			if (nightGenResult.success) {
				generatedFiles.push(...nightGenResult.files);
				logger.success(`Generated night: ${nightGenResult.files.join(', ')}`);
			}
		}
	}

	// Step 6: Generate variants
	const variantsDetection = detectVariants(themeDir, generateOptions);
	logger.info(variantsDetection.message);

	if (variantsDetection.available) {
		for (const variantFile of variantsDetection.files) {
			const variantName = path.basename(variantFile, '.yaml');
			const isNightVariant = variantName.endsWith('@night');
			const baseName = isNightVariant
				? variantName.replace('@night', '')
				: variantName;
			const suffix = isNightVariant ? `-${baseName}-night` : `-${baseName}`;

			const variantTokens = await processThemeDocument(
				variantFile,
				dict,
				colorSpace,
			);

			if (!variantTokens.ok) {
				return {
					ok: false,
					exitCode: variantTokens.exitCode,
					message: variantTokens.line
						? `${variantTokens.message} at line ${variantTokens.line}`
						: variantTokens.message,
				};
			}

			const variantResult = await generateTokens({
				themeName: `${resolvedThemeName}${suffix}`,
				outputDir,
				tokens: variantTokens.tree,
				platform: platforms,
				filterLayer,
				groupComments: variantTokens.groupComments,
			});

			if (variantResult.success) {
				generatedFiles.push(...variantResult.files);
				logger.success(
					`Generated variant ${variantName}: ${variantResult.files.join(', ')}`,
				);
			}
		}
	}

	logger.success(`Output directory: ${outputDir}`);
	logger.success(`Theme generation complete: ${resolvedThemeName}`);

	return {
		ok: true,
		themeName: resolvedThemeName,
		outputDir,
		generatedFiles,
	};
}

// Helper function for generating tokens without main.yaml
async function generateThemeTokens(
	themeName: string,
	outputDir: string,
	paletteContent: string,
	dimensionContent: string,
	platforms?: string[],
	filterLayer?: number,
	palettePath?: string,
	dimensionPath?: string,
): Promise<GeneratorResult> {
	const {
		parsePalette,
		validatePaletteSchema,
		parseDimension,
		validateDimensionSchema,
	} = await import('../../core/parser/index.ts');

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

	const tokens = {
		color: (palette as { color: unknown }).color,
		dimension: (dimension as { dimension: unknown }).dimension,
	};

	await fs.mkdir(outputDir, { recursive: true });

	return generateTokens({
		themeName,
		outputDir,
		tokens,
		platform: platforms,
		filterLayer,
	});
}
