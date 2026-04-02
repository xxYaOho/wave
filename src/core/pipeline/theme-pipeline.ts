import * as path from 'node:path';
import {
  type ColorSpaceFormat,
  type ParsedThemefile,
  type PaletteResult,
  type DimensionResult,
  type ParseError,
  type ReferenceDataSources,
  type SdTokenTree,
} from '../../types/index.ts';
import { parseThemefile } from '../parser/themefile.ts';
import { parsePalette, validatePaletteSchema, parseDimension, validateDimensionSchema } from '../parser/index.ts';
import { parseThemeYaml } from '../parser/theme-yaml.ts';
import { resolveReferences, CircularReferenceError, UnresolvedReferenceError } from '../resolver/index.ts';
import { loadResource } from '../resolver/resource-loader.ts';
import { transformToSDFormat } from '../transformer/index.ts';
import { logger } from '../../utils/logger.ts';

export interface ThemefileLoadResult {
  parsed: ParsedThemefile;
  themeDir: string;
  themefilePath: string;
  themefileContent: string;
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

export interface ThemeDocumentResult {
  tree: SdTokenTree;
  order: string[];
  groupComments: Record<string, string>;
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
  return typeof result === 'object' && result !== null && 'line' in result && 'message' in result;
}

export async function loadThemefile(themePath?: string): Promise<ThemefileLoadResult | { error: ParseError | Error }> {
  const themeDir = themePath
    ? path.dirname(expandHomePath(themePath))
    : path.join(process.env.HOME || '', 'Downloads', 'theme');

  const themefilePath = themePath
    ? expandHomePath(themePath)
    : path.join(themeDir, 'themefile');

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
  themeDir: string
): Promise<DependencyDictionary | { error: Error }> {
  // Auto-convert legacy PALETTE/DIMENSION into RESOURCE declarations
  const resources: Array<{ kind: string; ref: string }> =
    parsed.resources && parsed.resources.length > 0
      ? parsed.resources
      : [
          { kind: 'palette', ref: parsed.PALETTE! },
          { kind: 'dimension', ref: parsed.DIMENSION! },
        ];

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
          `Duplicate namespace "${loaded.namespace}" declared by ${kind} ${ref} (${loaded.path})`
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
      const schemaError = await validatePaletteSchema(paletteContent, palettePath);
      if (schemaError) {
        return { error: new Error(`Palette schema error: ${schemaError.message}`) };
      }
      const parsedPalette = parsePalette(paletteContent);
      if (isParseError(parsedPalette)) {
        return { error: new Error(`Palette parse error at line ${parsedPalette.line}: ${parsedPalette.message}`) };
      }
      paletteResult = parsedPalette;
    }

    if (kind === 'dimension' && !dimensionResult) {
      dimensionPath = loaded.path;
      dimensionContent = loaded.content;
      const schemaError = await validateDimensionSchema(dimensionContent, dimensionPath);
      if (schemaError) {
        return { error: new Error(`Dimension schema error: ${schemaError.message}`) };
      }
      const parsedDim = parseDimension(dimensionContent);
      if (isParseError(parsedDim)) {
        return { error: new Error(`Dimension parse error: ${parsedDim.message}`) };
      }
      dimensionResult = parsedDim;
    }
  }

  if (!paletteResult || !dimensionResult) {
    return { error: new Error('Missing required palette or dimension resource') };
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
  colorSpace?: ColorSpaceFormat
): Promise<ThemeDocumentResult | null> {
  const file = Bun.file(yamlPath);
  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  const parsed = parseThemeYaml(content);

  if (isParseError(parsed)) {
    logger.warn(`Theme YAML parse error at line ${parsed.line}: ${parsed.message}`);
    return null;
  }

  const sources: ReferenceDataSources = {};
  for (const [namespace, entry] of Object.entries(dict)) {
    sources[namespace] = entry.data;
  }

  try {
    const resolved = resolveReferences(parsed.raw, sources);
    const transformResult = transformToSDFormat(resolved, undefined, colorSpace);
    return { tree: transformResult.tree, order: transformResult.order, groupComments: transformResult.groupComments };
  } catch (err) {
    if (err instanceof CircularReferenceError) {
      logger.error(err.message);
      process.exitCode = err.exitCode;
      return null;
    }
    if (err instanceof UnresolvedReferenceError) {
      logger.error(err.message);
      process.exitCode = err.exitCode;
      return null;
    }
    throw err;
  }
}

export function extractPlatform(parsed: ParsedThemefile): string[] {
  const platformParam = parsed.PARAMETER?.platform;
  if (!platformParam || platformParam === 'general') {
    if (platformParam === 'general') {
      logger.warn('PARAMETER platform "general" is deprecated, use "json,jsonc" instead');
    }
    return platformParam === 'general' ? ['json', 'jsonc'] : ['json'];
  }
  return platformParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractFilterLayer(parsed: ParsedThemefile): number | undefined {
  const filterLayerParam = parsed.PARAMETER?.filterLayer;
  if (typeof filterLayerParam === 'number') return filterLayerParam;
  if (typeof filterLayerParam === 'string') return parseInt(filterLayerParam, 10);
  return undefined;
}

export function extractColorSpace(parsed: ParsedThemefile): ColorSpaceFormat | undefined {
  const colorSpaceParam = parsed.PARAMETER?.colorSpace;
  if (colorSpaceParam && ['hex', 'oklch', 'srgb', 'hsl'].includes(colorSpaceParam)) {
    return colorSpaceParam as ColorSpaceFormat;
  }
  return undefined;
}

export function resolveOutputDir(
  parsed: ParsedThemefile,
  themeDir: string,
  cliOutput?: string
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
  return path.join(process.env.HOME || '', 'Downloads', parsed.THEME);
}

export { expandHomePath };
