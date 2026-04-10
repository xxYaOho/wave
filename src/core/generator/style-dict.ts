import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import StyleDictionary from 'style-dictionary';
import type { Config, PlatformConfig } from 'style-dictionary/types';
import { nameKebabTransform } from './transforms/kebab.ts';
import { valueCssVarTransform } from './transforms/css-var.ts';
import { jsoncFormat } from './transforms/jsonc.ts';
import { flatJsonFormat, flatJsoncFormat, cssVariablesWithDescFormat, sketchColorsFormat, inheritColorAttributeTransform } from './transforms/index.ts';
import { sketchFormat } from './transforms/sketch-format.ts';
import { logger } from '../../utils/logger.ts';

export interface GeneratorOptions {
  themeName: string;
  outputDir: string;
  tokens: Record<string, unknown>;
  platform?: string[];
  filterLayer?: number;
  groupComments?: Record<string, string>;
}

export interface GeneratorResult {
  success: boolean;
  files: string[];
  error?: string;
}

const WAVE_TRANSFORM_GROUP = 'wave/css';

function registerWaveExtensions(): void {
  StyleDictionary.registerTransform(nameKebabTransform);
  StyleDictionary.registerTransform(inheritColorAttributeTransform);
  StyleDictionary.registerTransform(valueCssVarTransform);
  StyleDictionary.registerFormat(jsoncFormat);
  StyleDictionary.registerFormat(flatJsonFormat);
  StyleDictionary.registerFormat(flatJsoncFormat);
  StyleDictionary.registerFormat(cssVariablesWithDescFormat);
  StyleDictionary.registerFormat(sketchColorsFormat);
  StyleDictionary.registerFormat(sketchFormat);

  StyleDictionary.registerTransformGroup({
    name: WAVE_TRANSFORM_GROUP,
    transforms: [
      'attribute/cti',
      nameKebabTransform.name,
    ],
  });
}

let extensionsRegistered = false;

function ensureExtensionsRegistered(): void {
  if (!extensionsRegistered) {
    registerWaveExtensions();
    extensionsRegistered = true;
  }
}

export async function generateTokens(
  options: GeneratorOptions
): Promise<GeneratorResult> {
  ensureExtensionsRegistered();

  const { themeName, outputDir, tokens, platform, filterLayer } = options;
  const generatedFiles: string[] = [];

  try {
    const tempTokenPath = path.join(outputDir, '.temp-tokens.json');
    await Bun.write(tempTokenPath, JSON.stringify(tokens, null, 2));

    const platforms: Record<string, PlatformConfig> = {};

    const targetPlatforms = platform ?? ['json'];
    const validPlatforms = new Set<string>();

    for (const p of targetPlatforms) {
      const normalized = p.trim();
      if (normalized === 'json') {
        platforms.json = {
          buildPath: outputDir,
          transforms: ['attribute/cti', nameKebabTransform.name, inheritColorAttributeTransform.name],
          files: [{
            destination: `${themeName}.json`,
            format: flatJsonFormat.name,
            options: { filterLayer },
          }],
        };
        validPlatforms.add('json');
      } else if (normalized === 'jsonc') {
        platforms.jsonc = {
          buildPath: outputDir,
          transforms: ['attribute/cti', nameKebabTransform.name, inheritColorAttributeTransform.name],
          files: [{
            destination: `${themeName}.jsonc`,
            format: flatJsoncFormat.name,
            options: { filterLayer },
          }],
        };
        validPlatforms.add('jsonc');
      } else if (normalized === 'css') {
        platforms.css = {
          buildPath: outputDir,
          transforms: ['attribute/cti', nameKebabTransform.name, inheritColorAttributeTransform.name],
          files: [{
            destination: `${themeName}.css`,
            format: cssVariablesWithDescFormat.name,
            options: { filterLayer, groupComments: options.groupComments },
          }],
        };
        validPlatforms.add('css');
      } else if (normalized === 'sketch') {
        platforms.sketch = {
          buildPath: outputDir,
          transforms: ['attribute/cti', nameKebabTransform.name, inheritColorAttributeTransform.name],
          files: [{
            destination: `${themeName}2sketch.json`,
            format: sketchFormat.name,
            options: { filterLayer },
          }],
        };
        validPlatforms.add('2sketch.json');
      } else {
        logger.warn(`Unknown platform "${normalized}", skipping`);
      }
    }

    if (Object.keys(platforms).length === 0) {
      return {
        success: true,
        files: [],
      };
    }

    const config: Config = {
      source: [tempTokenPath],
      platforms,
    };

    const sd = new StyleDictionary(config);
    await sd.buildAllPlatforms();

    for (const p of validPlatforms) {
      generatedFiles.push(`${themeName}.${p}`);
    }

    try {
      await fs.unlink(tempTokenPath);
    } catch {}

    return {
      success: true,
      files: generatedFiles,
    };
  } catch (error) {
    return {
      success: false,
      files: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function generateVariant(
  baseName: string,
  variantName: string,
  outputDir: string,
  tokens: Record<string, unknown>,
  isNight: boolean = false
): Promise<GeneratorResult> {
  const suffix = isNight ? '-night' : `-${variantName}`;
  const themeName = `${baseName}${suffix}`;

  return generateTokens({
    themeName,
    outputDir,
    tokens,
  });
}

export {
  nameKebabTransform,
  valueCssVarTransform,
  jsoncFormat,
  flatJsonFormat,
  flatJsoncFormat,
  cssVariablesWithDescFormat,
  sketchColorsFormat,
  WAVE_TRANSFORM_GROUP,
};
