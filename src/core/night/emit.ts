/**
 * Emit product `@night.yaml` beside a Day theme entry.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ExitCode, type ExitCodeType } from '../../types/index.ts';
import { sketchNightPassIds } from '../pipeline/sketch-identity.ts';
import {
	planSourceOutput,
	writeSourceOutput,
} from '../pipeline/source-output.ts';
import {
	collectDependencyDictionary,
	processThemeDocument,
} from '../pipeline/theme-pipeline.ts';
import { loadDesignTokenSource } from '../pipeline/workspace-loader.ts';
import { deriveNightOverlay } from './derive-overlay.ts';
import {
	accentMainToneFromProduct,
	type NightCliParams,
	parseNightConfigSection,
	type ResolvedNightParams,
	resolveNightParams,
} from './params.ts';

export interface EmitNightInput {
	/** Day main/profile file or workspace directory (default: cwd/main.yaml). */
	themePath?: string;
	cwd?: string;
	cli: NightCliParams;
	output?: string;
	force?: boolean;
	dryRun?: boolean;
}

export interface EmitNightSuccess {
	ok: true;
	outputPath: string;
	defaultOutputPath: string;
	sourcePath: string;
	dryRun: boolean;
	themeStem: string;
	/** Same as Day document identity (no @night suffix). */
	themeId?: string | undefined;
	baseId: string;
	mode: 'night';
	params: ResolvedNightParams;
	mappedCount: number;
	overwrote: boolean;
}

export interface EmitNightFailure {
	ok: false;
	exitCode: ExitCodeType;
	message: string;
}

export type EmitNightResult = EmitNightSuccess | EmitNightFailure;

function nightOverlayPath(themePath: string): string {
	const dir = path.dirname(themePath);
	const stem = path.basename(themePath, path.extname(themePath));
	return path.join(dir, `${stem}@night.yaml`);
}

async function readRawConfigNight(
	themePath: string,
): Promise<ReturnType<typeof parseNightConfigSection>> {
	try {
		// Workspace loader strips `$config` from tokenContent; re-read the file.
		const raw = await fs.readFile(themePath, 'utf8');
		const doc = yaml.load(raw);
		if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return undefined;
		const config = (doc as Record<string, unknown>).$config;
		if (!config || typeof config !== 'object' || Array.isArray(config))
			return undefined;
		return parseNightConfigSection((config as Record<string, unknown>).night);
	} catch {
		return undefined;
	}
}

export async function emitNightOverlay(
	input: EmitNightInput,
): Promise<EmitNightResult> {
	const cwd = input.cwd ?? process.cwd();
	const loaded = await loadDesignTokenSource(input.themePath, cwd);
	if (!loaded.ok) {
		return {
			ok: false,
			exitCode: loaded.exitCode,
			message: loaded.message,
		};
	}
	const { source } = loaded;
	const { document, workspace } = source;
	const defaultOutputPath = nightOverlayPath(source.path);
	const outputPath = input.output
		? path.resolve(cwd, input.output)
		: defaultOutputPath;
	let plan: Awaited<ReturnType<typeof planSourceOutput>>;
	try {
		plan = await planSourceOutput(outputPath, input.force, [
			source.path,
			workspace.path,
		]);
	} catch (error) {
		return {
			ok: false,
			exitCode: ExitCode.GENERAL_ERROR,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	let params: ResolvedNightParams;
	try {
		params = resolveNightParams(
			input.cli,
			// Profile config has no night section; Night settings are inherited
			// from its actual base main, while resources come from the merged Day.
			await readRawConfigNight(workspace.path),
		);
	} catch (error) {
		return {
			ok: false,
			exitCode: ExitCode.INVALID_PARAMETER,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	const deps = await collectDependencyDictionary(
		document.config,
		document.buildDir,
		// Creation planning and validation must never restore caches on disk.
		{ readOnly: true },
	);
	if (deps.issues.length > 0) {
		const first = deps.issues[0]!;
		return {
			ok: false,
			exitCode: ExitCode.INVALID_RESOURCE,
			message: `Resource load failed for ${first.kind}:${first.ref}: ${first.message}`,
		};
	}

	const processed = await processThemeDocument(
		source.path,
		deps.dict,
		undefined,
		document.tokenContent,
	);
	if (!processed.ok) {
		return {
			ok: false,
			exitCode: processed.exitCode,
			message: processed.message,
		};
	}

	const resolvedRoot = processed.resolved as Record<string, unknown>;
	const resolvedTheme = (
		resolvedRoot.theme && typeof resolvedRoot.theme === 'object'
			? resolvedRoot.theme
			: {}
	) as Record<string, unknown>;

	const derived = deriveNightOverlay({ resolvedTheme, params });
	const themeStem = document.config.theme;
	// Day/Night share themeId; mode distinguishes appearance for Token Manage.
	const { themeId, baseId, mode } = sketchNightPassIds({
		isDefault: source.entry.isDefault,
		documentThemeId: document.themeId,
		mainThemeId: workspace.themeId,
		themeStem,
	});

	const header = [
		`# Night overlay draft — wave token new night (pure color-rule)`,
		`# Source Day: ${source.path}`,
		`# Generated: ${new Date().toISOString()}`,
		`# scene=${params.scene} (lightsLevel=${params.lightsLevel}, via ${params.sceneSource})`,
		`# luminance=${params.luminance} → accentMain tone ${accentMainToneFromProduct(params.luminance)} (Primary Night 明度; via ${params.luminanceSource})`,
		`# themeId=${themeId} baseId=${baseId} mode=${mode}`,
		`# Contract: theme.color / theme.state path-leaf only; no root $id`,
		`# Wave day/night ↔ macOS light/dark; Dark is a theme not a mode`,
		'',
	].join('\n');

	const body = yaml.dump(derived.overlay, {
		lineWidth: 100,
		noRefs: true,
		sortingKeys: false,
	});

	if (!input.dryRun) {
		try {
			await writeSourceOutput(outputPath, `${header}${body}`, input.force);
		} catch (error) {
			return {
				ok: false,
				exitCode: ExitCode.GENERAL_ERROR,
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	return {
		ok: true,
		outputPath,
		defaultOutputPath,
		sourcePath: source.path,
		dryRun: input.dryRun === true,
		themeStem,
		themeId,
		baseId,
		mode,
		params,
		mappedCount: derived.mapped.length,
		overwrote: plan.overwrites,
	};
}
