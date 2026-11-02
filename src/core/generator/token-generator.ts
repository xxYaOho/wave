import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
	ColorSpaceFormat,
	ResolvedTokenGroup,
	WaveFormatFn,
	WaveToken,
} from '../../types/index.ts';
import { transformToWaveTokens } from '../transformer/theme-transformer.ts';
import { cssVariablesFormat } from './formats/css.ts';
import { flatJsoncFormat, flatJsonFormat } from './formats/flat.ts';
import { mdYamlFormat } from './formats/md-yml.ts';
import { sketchFormat } from './formats/sketch.ts';

export interface GeneratorOptions {
	themeName: string;
	outputDir: string;
	tokens: WaveToken[];
	platform?: string[];
	filterLayer?: number;
	groupComments?: Record<string, string>;
	resolved?: ResolvedTokenGroup;
	colorSpace?: ColorSpaceFormat;
	/** Identity of the current day document; consumed by the sketch payload. */
	themeId?: string;
	/** Series key for Token Manage; main uses own id/stem, profiles use main id. */
	baseId?: string;
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

export interface PlannedTokenOutput {
	platform: string;
	filePath: string;
	format: WaveFormatFn;
	extra?: Record<string, unknown>;
}

export type TokenOutputPlanResult =
	| { ok: true; outputs: PlannedTokenOutput[] }
	| { ok: false; error: string };

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
		extra: {
			includeRootKeys: [
				'color',
				'state',
				'shadow',
				'gradient',
				'border',
				'radius',
				'font',
			],
		},
	},
	sketch: {
		format: sketchFormat,
		filename: (n) => `${n}2sketch.json`,
		extra: {
			includeRootKeys: [
				'color',
				'state',
				'shadow',
				'gradient',
				'border',
				'radius',
				'font',
			],
		},
	},
	'md-yml': {
		format: mdYamlFormat,
		filename: (n) => `${n}2md.yml`,
	},
};

export function planTokenOutputs(options: {
	themeName: string;
	outputDir: string;
	platform?: string[];
}): TokenOutputPlanResult {
	const normalizedPlatforms = [
		...new Set(
			(options.platform ?? ['json']).map((platform) => platform.trim()),
		),
	];
	if (normalizedPlatforms.length === 0) {
		return { ok: false, error: 'At least one output platform is required' };
	}

	const outputs: PlannedTokenOutput[] = [];
	for (const platform of normalizedPlatforms) {
		const definition = PLATFORMS[platform];
		if (!definition) {
			return {
				ok: false,
				error: `Unknown platform "${platform}". Supported platforms: ${Object.keys(PLATFORMS).join(', ')}`,
			};
		}
		outputs.push({
			platform,
			filePath: path.resolve(
				options.outputDir,
				definition.filename(options.themeName),
			),
			format: definition.format,
			extra: definition.extra,
		});
	}

	return { ok: true, outputs };
}

function tokensForPlatform(
	platform: string,
	tokens: WaveToken[],
	resolved: ResolvedTokenGroup | undefined,
	colorSpace: ColorSpaceFormat | undefined,
): WaveToken[] {
	if (platform !== 'sketch') return tokens;
	if (!resolved || colorSpace === 'hex') return tokens;
	// Sketch re-materializes HEX values and intentionally has no md-yml lineage.
	return transformToWaveTokens(resolved, undefined, 'hex').tokens;
}

export async function generateTokens(
	options: GeneratorOptions,
): Promise<GeneratorResult> {
	const {
		themeName,
		outputDir,
		tokens,
		platform,
		filterLayer,
		groupComments,
		resolved,
		colorSpace,
		themeId,
		baseId,
	} = options;
	const generatedFiles: string[] = [];
	const plan = planTokenOutputs({ themeName, outputDir, platform });
	if (!plan.ok) {
		return { success: false, files: [], error: plan.error };
	}

	try {
		const pendingOutputs: Array<{ filePath: string; out: string }> = [];
		for (const output of plan.outputs) {
			const formatOptions: Record<string, unknown> = {
				...(output.extra ?? {}),
			};
			if (filterLayer !== undefined) formatOptions.filterLayer = filterLayer;
			if (groupComments !== undefined) {
				formatOptions.groupComments = groupComments;
			}
			if (themeId !== undefined) formatOptions.themeId = themeId;
			if (baseId !== undefined) formatOptions.baseId = baseId;

			const out = output.format(
				tokensForPlatform(output.platform, tokens, resolved, colorSpace),
				formatOptions,
			);
			pendingOutputs.push({ filePath: output.filePath, out });
		}

		await fs.mkdir(outputDir, { recursive: true });
		for (const { filePath, out } of pendingOutputs) {
			await Bun.write(filePath, out);
			generatedFiles.push(path.basename(filePath));
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
