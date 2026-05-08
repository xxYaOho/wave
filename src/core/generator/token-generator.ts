import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WaveFormatFn, WaveToken } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { cssVariablesFormat } from './formats/css.ts';
import { flatJsoncFormat, flatJsonFormat } from './formats/flat.ts';
import { sketchFormat } from './formats/sketch.ts';

export interface GeneratorOptions {
	themeName: string;
	outputDir: string;
	tokens: WaveToken[];
	platform?: string[];
	filterLayer?: number;
	groupComments?: Record<string, string>;
}

export interface GeneratorResult {
	success: boolean;
	files: string[];
	error?: string;
}

interface PlatformDefinition {
	format: WaveFormatFn;
	filename: (themeName: string) => string;
	extra?: Record<string, unknown>;
}

const PLATFORMS: Record<string, PlatformDefinition> = {
	json: {
		format: flatJsonFormat,
		filename: (n) => `${n}.json`,
	},
	jsonc: {
		format: flatJsoncFormat,
		filename: (n) => `${n}.jsonc`,
	},
	css: {
		format: cssVariablesFormat,
		filename: (n) => `${n}.css`,
		extra: { includeRootKeys: ['color', 'style'] },
	},
	sketch: {
		format: sketchFormat,
		filename: (n) => `${n}2sketch.json`,
	},
};

export async function generateTokens(
	options: GeneratorOptions,
): Promise<GeneratorResult> {
	const { themeName, outputDir, tokens, platform, filterLayer, groupComments } =
		options;
	const generatedFiles: string[] = [];
	const targetPlatforms = platform ?? ['json'];

	try {
		for (const p of targetPlatforms) {
			const normalized = p.trim();
			const def = PLATFORMS[normalized];
			if (!def) {
				logger.warn(`Unknown platform "${normalized}", skipping`);
				continue;
			}

			const formatOptions: Record<string, unknown> = {
				...(def.extra ?? {}),
			};
			if (filterLayer !== undefined) formatOptions.filterLayer = filterLayer;
			if (groupComments !== undefined) {
				formatOptions.groupComments = groupComments;
			}

			const filename = def.filename(themeName);
			const out = def.format(tokens, formatOptions);

			await fs.mkdir(outputDir, { recursive: true });
			await Bun.write(path.join(outputDir, filename), out);
			generatedFiles.push(filename);
		}

		return { success: true, files: generatedFiles };
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
	tokens: WaveToken[],
	isNight: boolean = false,
): Promise<GeneratorResult> {
	const suffix = isNight ? '-night' : `-${variantName}`;
	const themeName = `${baseName}${suffix}`;
	return generateTokens({ themeName, outputDir, tokens });
}
