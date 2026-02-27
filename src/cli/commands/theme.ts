import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Command } from 'commander';
import { ExitCode, type GenerateOptions, type ParseError } from '../../types/index.ts';
import { VERSION } from '../../config/index.ts';
import { parseThemefile } from '../../core/parser/themefile.ts';
import { parsePalette, validatePaletteSchema } from '../../core/parser/palette.ts';
import { parseDimension, validateDimensionSchema } from '../../core/parser/dimension.ts';
import { resolveResource } from '../../core/resolver/index.ts';
import { detectNightMode, detectVariants } from '../../core/detector/index.ts';
import { generateTokens, type GeneratorResult } from '../../core/generator/index.ts';
import { logger } from '../../utils/logger.ts';

interface BuiltinThemeConfig {
  palette: string;
  dimension: string;
}

const BUILTIN_THEMES: Record<string, BuiltinThemeConfig> = {};

function getBuiltinThemeNames(): string[] {
  return Object.keys(BUILTIN_THEMES);
}

function isBuiltinTheme(_name: string): boolean {
  return false;
}

interface ThemeCommandOptions {
  file?: string;
  list?: boolean;
  night?: boolean;
  noVariants?: boolean;
  variants?: string | boolean;
  init?: boolean;
  output?: string;
}

function isParseError(result: unknown): result is ParseError {
  return typeof result === 'object' && result !== null && 'line' in result && 'message' in result;
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

function parseCliOptions(options: ThemeCommandOptions): GenerateOptions {
  const result: GenerateOptions = {
    night: options.night !== false,
  };

  if (options.noVariants === true) {
    result.variants = [];
  } else if (options.variants === false) {
    result.variants = [];
  } else if (options.variants === undefined || options.variants === true) {
    result.variants = undefined;
  } else if (typeof options.variants === 'string') {
    result.variants = options.variants
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return result;
}

async function buildTokens(
  paletteContent: string,
  dimensionContent: string,
  palettePath?: string,
  dimensionPath?: string
): Promise<Record<string, unknown>> {
  const paletteSchemaError = await validatePaletteSchema(paletteContent, palettePath);
  if (paletteSchemaError) {
    throw new Error(`Palette schema error: ${paletteSchemaError.message}`);
  }

  const dimensionSchemaError = await validateDimensionSchema(dimensionContent, dimensionPath);
  if (dimensionSchemaError) {
    throw new Error(`Dimension schema error: ${dimensionSchemaError.message}`);
  }

  const palette = parsePalette(paletteContent);
  if (isParseError(palette)) {
    throw new Error(`Palette parse error at line ${palette.line}: ${palette.message}`);
  }

  const dimension = parseDimension(dimensionContent);
  if (isParseError(dimension)) {
    throw new Error(`Dimension parse error: ${dimension.message}`);
  }

  return {
    color: palette.global.color,
    dimension: dimension.global.dimension,
  };
}

async function generateThemeTokens(
  themeName: string,
  outputDir: string,
  paletteContent: string,
  dimensionContent: string,
  platform?: 'general' | 'css',
  filterLayer?: number,
  palettePath?: string,
  dimensionPath?: string
): Promise<GeneratorResult> {
  const tokens = await buildTokens(paletteContent, dimensionContent, palettePath, dimensionPath);
  await fs.mkdir(outputDir, { recursive: true });

  return generateTokens({
    themeName,
    outputDir,
    tokens,
    platform,
    filterLayer,
  });
}

async function handleBuiltinTheme(
  name: string,
  config: BuiltinThemeConfig,
  options: ThemeCommandOptions
): Promise<boolean> {
  const generateOptions = parseCliOptions(options);
  const themeDir = path.join(process.env.HOME || '', 'Downloads', name);
  const outputDir = options.output
    ? expandHomePath(options.output)
    : themeDir;

  const paletteResource = resolveResource(config.palette, 'palette', themeDir);
  const dimensionResource = resolveResource(config.dimension, 'dimension', themeDir);

  if (!paletteResource.exists) {
    process.exitCode = ExitCode.INVALID_RESOURCE;
    logger.error(`Built-in palette not found: ${config.palette}`);
    return false;
  }
  if (!dimensionResource.exists) {
    process.exitCode = ExitCode.INVALID_RESOURCE;
    logger.error(`Built-in dimension not found: ${config.dimension}`);
    return false;
  }

  let paletteContent: string;
  let dimensionContent: string;
  try {
    paletteContent = await loadYamlFile(paletteResource.path);
    dimensionContent = await loadYamlFile(dimensionResource.path);
  } catch (err) {
    process.exitCode = ExitCode.FILE_NOT_FOUND;
    logger.error(err instanceof Error ? err.message : String(err));
    return false;
  }

  logger.success(`Palette: ${config.palette} (builtin)`);
  logger.success(`Dimension: ${config.dimension} (builtin)`);

  let mainResult: GeneratorResult;
  try {
    mainResult = await generateThemeTokens(
      name,
      outputDir,
      paletteContent,
      dimensionContent,
      'general',
      undefined,
      paletteResource.path,
      dimensionResource.path
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('schema error')) {
      process.exitCode = ExitCode.INVALID_RESOURCE;
    } else {
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
    logger.error(errorMessage);
    return false;
  }

  if (!mainResult.success) {
    const errorMsg = mainResult.error || 'Failed to generate tokens';
    if (errorMsg.includes('schema error')) {
      process.exitCode = ExitCode.INVALID_RESOURCE;
    } else {
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
    logger.error(errorMsg);
    return false;
  }

  logger.success(`Generated main: ${mainResult.files.join(', ')}`);

  const nightResult = detectNightMode(themeDir, generateOptions);
  logger.info(nightResult.message);

  if (nightResult.available) {
    const nightGenResult = await generateThemeTokens(
      `${name}-night`,
      outputDir,
      paletteContent,
      dimensionContent,
      'general',
      undefined,
      paletteResource.path,
      dimensionResource.path
    );
    if (nightGenResult.success) {
      logger.success(`Generated night: ${nightGenResult.files.join(', ')}`);
    }
  }

  const variantsDetection = detectVariants(themeDir, generateOptions);
  logger.info(variantsDetection.message);

  if (variantsDetection.available) {
    for (const variantFile of variantsDetection.files) {
      const variantName = path.basename(variantFile, '.yaml');
      const isNightVariant = variantName.endsWith('@night');
      const baseName = isNightVariant ? variantName.replace('@night', '') : variantName;
      const suffix = isNightVariant ? `-${baseName}-night` : `-${baseName}`;

      const variantResult = await generateThemeTokens(
        `${name}${suffix}`,
        outputDir,
        paletteContent,
        dimensionContent,
        'general',
        undefined,
        paletteResource.path,
        dimensionResource.path
      );

      if (variantResult.success) {
        logger.success(`Generated variant ${variantName}: ${variantResult.files.join(', ')}`);
      }
    }
  }

  logger.success(`Output directory: ${outputDir}`);
  logger.success(`Theme generation complete: ${name}`);
  return true;
}

async function handleThemeGeneration(
  name: string,
  options: ThemeCommandOptions
): Promise<void> {
  const generateOptions = parseCliOptions(options);

  const themeDir = options.file
    ? path.dirname(expandHomePath(options.file))
    : path.join(process.env.HOME || '', 'Downloads', name);

  const themefilePath = options.file
    ? expandHomePath(options.file)
    : path.join(themeDir, 'themefile');

  let themefileContent: string;
  try {
    themefileContent = await loadYamlFile(themefilePath);
  } catch {
    process.exitCode = ExitCode.FILE_NOT_FOUND;
    logger.error(`Themefile not found: ${themefilePath}`);
    return;
  }

  const parsedThemefile = parseThemefile(themefileContent);
  if (isParseError(parsedThemefile)) {
    process.exitCode = ExitCode.FORMAT_ERROR;
    logger.error(`Themefile parse error at line ${parsedThemefile.line}: ${parsedThemefile.message}`);
    return;
  }

  const paletteRef = parsedThemefile.PALETTE;
  const dimensionRef = parsedThemefile.DIMENSION;
  const themeName = parsedThemefile.THEME;

  const platformParam = parsedThemefile.PARAMETER?.platform;
  const platform: 'general' | 'css' | undefined = 
    platformParam === 'css' ? 'css' : 
    platformParam === 'general' ? 'general' : 
    undefined;

  const filterLayerParam = parsedThemefile.PARAMETER?.filterLayer;
  const filterLayer: number | undefined = 
    typeof filterLayerParam === 'number' ? filterLayerParam :
    typeof filterLayerParam === 'string' ? parseInt(filterLayerParam, 10) :
    undefined;

  const paletteResource = resolveResource(paletteRef, 'palette', themeDir);
  const dimensionResource = resolveResource(dimensionRef, 'dimension', themeDir);

  if (!paletteResource.exists) {
    process.exitCode = ExitCode.INVALID_RESOURCE;
    logger.error(`Palette not found: ${paletteResource.path}`);
    return;
  }
  if (!dimensionResource.exists) {
    process.exitCode = ExitCode.INVALID_RESOURCE;
    logger.error(`Dimension not found: ${dimensionResource.path}`);
    return;
  }

  const outputDir = options.output
    ? expandHomePath(options.output)
    : path.join(process.env.HOME || '', 'Downloads', themeName);

  let paletteContent: string;
  let dimensionContent: string;
  try {
    paletteContent = await loadYamlFile(paletteResource.path);
    dimensionContent = await loadYamlFile(dimensionResource.path);
  } catch (err) {
    process.exitCode = ExitCode.FILE_NOT_FOUND;
    logger.error(err instanceof Error ? err.message : String(err));
    return;
  }

  logger.success(`Palette: ${paletteRef} (${paletteResource.isBuiltin ? 'builtin' : 'user'})`);
  logger.success(`Dimension: ${dimensionRef} (${dimensionResource.isBuiltin ? 'builtin' : 'user'})`);

  let mainResult: GeneratorResult;
  try {
    mainResult = await generateThemeTokens(
      themeName,
      outputDir,
      paletteContent,
      dimensionContent,
      platform,
      filterLayer,
      paletteResource.path,
      dimensionResource.path
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('schema error')) {
      process.exitCode = ExitCode.INVALID_RESOURCE;
    } else {
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
    logger.error(errorMessage);
    return;
  }

  if (!mainResult.success) {
    const errorMsg = mainResult.error || 'Failed to generate tokens';
    if (errorMsg.includes('schema error')) {
      process.exitCode = ExitCode.INVALID_RESOURCE;
    } else {
      process.exitCode = ExitCode.GENERAL_ERROR;
    }
    logger.error(errorMsg);
    return;
  }

  logger.success(`Generated main: ${mainResult.files.join(', ')}`);

  const nightResult = detectNightMode(themeDir, generateOptions);
  logger.info(nightResult.message);

  if (nightResult.available) {
    const nightGenResult = await generateThemeTokens(
      `${themeName}-night`,
      outputDir,
      paletteContent,
      dimensionContent,
      platform,
      filterLayer,
      paletteResource.path,
      dimensionResource.path
    );
    if (nightGenResult.success) {
      logger.success(`Generated night: ${nightGenResult.files.join(', ')}`);
    }
  }

  const variantsDetection = detectVariants(themeDir, generateOptions);
  logger.info(variantsDetection.message);

  if (variantsDetection.available) {
    for (const variantFile of variantsDetection.files) {
      const variantName = path.basename(variantFile, '.yaml');
      const isNightVariant = variantName.endsWith('@night');
      const baseName = isNightVariant ? variantName.replace('@night', '') : variantName;
      const suffix = isNightVariant ? `-${baseName}-night` : `-${baseName}`;

      const variantResult = await generateThemeTokens(
        `${themeName}${suffix}`,
        outputDir,
        paletteContent,
        dimensionContent,
        platform,
        filterLayer,
        paletteResource.path,
        dimensionResource.path
      );

      if (variantResult.success) {
        logger.success(`Generated variant ${variantName}: ${variantResult.files.join(', ')}`);
      }
    }
  }

  logger.success(`Output directory: ${outputDir}`);
  logger.success(`Theme generation complete: ${themeName}`);
}

export const themeCommand = new Command('theme')
  .description('Generate theme tokens')
  .argument('[name]', 'Theme name to generate')
  .option('-f, --file <path>', 'Themefile path')
  .option('--list', 'List built-in themes')
  .option('--no-night', 'Disable night mode generation')
  .option('--no-variants', 'Disable variants generation')
  .option('--variants [names]', 'Specify variants (comma separated)')
  .option('--init', 'Create theme template')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (name: string | undefined, options: ThemeCommandOptions) => {
    if (options.list) {
      console.log('Built-in themes:');
      for (const themeName of getBuiltinThemeNames()) {
        console.log(`  ${themeName}`);
      }
      process.exit(ExitCode.SUCCESS);
    }

    if (options.init) {
      console.log('Creating theme template...');
      console.log('TODO: Implement --init');
      process.exit(ExitCode.SUCCESS);
    }

    if (!name) {
      console.error('Error: Theme name is required');
      console.log('Usage: wave theme <name>');
      console.log('Try "wave help theme" for more information.');
      process.exit(ExitCode.MISSING_PARAMETER);
    }

    logger.info(`Generating theme: ${name}`);
    logger.info(`Version: ${VERSION}`);

    if (isBuiltinTheme(name) && !options.file) {
      const config = BUILTIN_THEMES[name];
      if (!config) {
        process.exitCode = ExitCode.THEME_NOT_FOUND;
        logger.error(`Theme not found: ${name}`);
        return;
      }
      await handleBuiltinTheme(name, config, options);
      return;
    }

    const themeDir = options.file
      ? path.dirname(expandHomePath(options.file))
      : path.join(process.env.HOME || '', 'Downloads', name);

    const themefilePath = options.file
      ? expandHomePath(options.file)
      : path.join(themeDir, 'themefile');

    const file = Bun.file(themefilePath);
    if (!(await file.exists())) {
      if (options.file) {
        process.exitCode = ExitCode.FILE_NOT_FOUND;
        logger.error(`Themefile not found: ${themefilePath}`);
      } else {
        process.exitCode = ExitCode.THEME_NOT_FOUND;
        logger.error(`Theme not found: ${name}`);
      }
      return;
    }

    await handleThemeGeneration(name, options);
  });
