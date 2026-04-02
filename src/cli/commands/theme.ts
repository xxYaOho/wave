import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Command } from 'commander';
import {
  ExitCode,
  type GenerateOptions,
} from '../../types/index.ts';
import type { GeneratorResult } from '../../core/generator/index.ts';
import { VERSION } from '../../config/index.ts';
import { generateTokens } from '../../core/generator/index.ts';
import { detectNightMode, detectVariants } from '../../core/detector/index.ts';
import { logger } from '../../utils/logger.ts';
import {
  loadThemefile,
  buildDependencyDictionary,
  processThemeDocument,
  extractPlatform,
  extractFilterLayer,
  extractColorSpace,
  resolveOutputDir,
  expandHomePath,
} from '../../core/pipeline/theme-pipeline.ts';

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
  const { parsePalette, validatePaletteSchema, parseDimension, validateDimensionSchema } = await import('../../core/parser/index.ts');

  const paletteSchemaError = await validatePaletteSchema(paletteContent, palettePath);
  if (paletteSchemaError) {
    throw new Error(`Palette schema error: ${paletteSchemaError.message}`);
  }

  const dimensionSchemaError = await validateDimensionSchema(dimensionContent, dimensionPath);
  if (dimensionSchemaError) {
    throw new Error(`Dimension schema error: ${dimensionSchemaError.message}`);
  }

  const palette = parsePalette(paletteContent);
  if (palette && 'line' in palette && 'message' in palette) {
    throw new Error(`Palette parse error at line ${palette.line}: ${palette.message}`);
  }

  const dimension = parseDimension(dimensionContent);
  if (dimension && 'line' in dimension && 'message' in dimension) {
    throw new Error(`Dimension parse error: ${dimension.message}`);
  }

  const tokens = {
    color: (palette as { global: { color: unknown } }).global.color,
    dimension: (dimension as { global: { dimension: unknown } }).global.dimension,
  };

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

  const { resolveResource } = await import('../../core/resolver/index.ts');

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
    const { default: BunFile } = await import('bun');
    paletteContent = await Bun.file(paletteResource.path).text();
    dimensionContent = await Bun.file(dimensionResource.path).text();
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

  const themePath = options.file
    ? expandHomePath(options.file)
    : undefined;

  const loadResult = await loadThemefile(themePath);
  if ('error' in loadResult) {
    const err = loadResult.error;
    if (err.message.includes('not found')) {
      process.exitCode = ExitCode.FILE_NOT_FOUND;
    } else if ('line' in err) {
      process.exitCode = ExitCode.FORMAT_ERROR;
      logger.error(`Themefile parse error at line ${(err as { line: number }).line}: ${err.message}`);
      return;
    } else {
      process.exitCode = ExitCode.GENERAL_ERROR;
      logger.error(err.message);
      return;
    }
    logger.error(err.message);
    return;
  }

  const { parsed, themeDir, themefilePath } = loadResult;
  const themeName = parsed.THEME;

  const platform = extractPlatform(parsed);
  const filterLayer = extractFilterLayer(parsed);
  const colorSpace = extractColorSpace(parsed);

  const depResult = await buildDependencyDictionary(parsed, themeDir);
  if ('error' in depResult) {
    const errMsg = depResult.error.message;
    process.exitCode = errMsg.includes('schema error')
      ? ExitCode.INVALID_RESOURCE
      : ExitCode.FILE_NOT_FOUND;
    logger.error(errMsg);
    return;
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

  const outputDir = resolveOutputDir(parsed, themeDir, options.output);

  logger.success(`Palette: ${parsed.PALETTE} (${palettePath.includes('src/resources') ? 'builtin' : 'user'})`);
  logger.success(`Dimension: ${parsed.DIMENSION} (${dimensionPath.includes('src/resources') ? 'builtin' : 'user'})`);

  const mainYamlPath = path.join(themeDir, 'main.yaml');
  const mainYamlFile = Bun.file(mainYamlPath);
  const hasMainYaml = await mainYamlFile.exists();

  let mainResult: GeneratorResult;

  if (hasMainYaml) {
    logger.info('Found main.yaml, parsing theme tokens...');
    const parseResult = await processThemeDocument(mainYamlPath, dict, colorSpace);

    if (!parseResult) {
      process.exitCode = ExitCode.GENERAL_ERROR;
      logger.error('Failed to parse main.yaml');
      return;
    }

    await fs.mkdir(outputDir, { recursive: true });
    mainResult = await generateTokens({
      themeName,
      outputDir,
      tokens: parseResult.tree,
      platform,
      filterLayer,
    });

    if (!mainResult.success) {
      const errorMsg = mainResult.error || 'Failed to generate tokens';
      process.exitCode = ExitCode.GENERAL_ERROR;
      logger.error(errorMsg);
      return;
    }

    logger.success(`Generated main: ${mainResult.files.join(', ')}`);
  } else {
    try {
      mainResult = await generateThemeTokens(
        themeName,
        outputDir,
        paletteContent,
        dimensionContent,
        platform,
        filterLayer,
        palettePath,
        dimensionPath
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
  }

  const nightResult = detectNightMode(themeDir, generateOptions);
  logger.info(nightResult.message);

  if (nightResult.available) {
    const nightYamlPath = path.join(themeDir, 'main@night.yaml');
    const nightYamlFile = Bun.file(nightYamlPath);
    const hasNightYaml = await nightYamlFile.exists();

    if (hasNightYaml) {
      logger.info('Found main@night.yaml, parsing night theme tokens...');
      const nightParseResult = await processThemeDocument(nightYamlPath, dict, colorSpace);

      if (!nightParseResult) {
        process.exitCode = ExitCode.GENERAL_ERROR;
        logger.error('Failed to parse main@night.yaml');
        return;
      }

      const nightGenResult = await generateTokens({
        themeName: `${themeName}-night`,
        outputDir,
        tokens: nightParseResult.tree,
        platform,
        filterLayer,
      });

      if (nightGenResult.success) {
        logger.success(`Generated night: ${nightGenResult.files.join(', ')}`);
      }
    } else {
      const nightGenResult = await generateThemeTokens(
        `${themeName}-night`,
        outputDir,
        paletteContent,
        dimensionContent,
        platform,
        filterLayer,
        palettePath,
        dimensionPath
      );
      if (nightGenResult.success) {
        logger.success(`Generated night: ${nightGenResult.files.join(', ')}`);
      }
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

      const variantTokens = await processThemeDocument(variantFile, dict, colorSpace);

      if (!variantTokens) {
        process.exitCode = ExitCode.GENERAL_ERROR;
        logger.error(`Failed to parse variant: ${variantFile}`);
        return;
      }

      const variantResult = await generateTokens({
        themeName: `${themeName}${suffix}`,
        outputDir,
        tokens: variantTokens.tree,
        platform,
        filterLayer,
      });

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

    let themeName = name;

    if (!themeName && !options.file) {
      const defaultThemefile = 'themefile';
      const file = Bun.file(defaultThemefile);
      if (await file.exists()) {
        options.file = defaultThemefile;
        themeName = 'theme';
      } else {
        console.error('Error: No themefile found in current directory');
        console.error('Usage: wave theme [path] or wave theme -f <path>');
        console.error('Or create a themefile in current directory');
        process.exit(ExitCode.FILE_NOT_FOUND);
      }
    }

    if (!themeName && options.file) {
      themeName = 'theme';
    }

    if (!themeName) {
      console.error('Error: Theme name is required');
      console.error('Usage: wave theme [path] or wave theme -f <path>');
      process.exit(ExitCode.MISSING_PARAMETER);
    }

    logger.info(`Generating theme: ${themeName}`);
    logger.info(`Version: ${VERSION}`);

    if (isBuiltinTheme(themeName) && !options.file) {
      const config = BUILTIN_THEMES[themeName];
      if (!config) {
        process.exitCode = ExitCode.THEME_NOT_FOUND;
        logger.error(`Theme not found: ${themeName}`);
        return;
      }
      await handleBuiltinTheme(themeName, config, options);
      return;
    }

    const themeDir = options.file
      ? path.dirname(expandHomePath(options.file))
      : path.join(process.env.HOME || '', 'Downloads', themeName);

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
        logger.error(`Theme not found: ${themeName}`);
      }
      return;
    }

    await handleThemeGeneration(themeName, options);
  });
