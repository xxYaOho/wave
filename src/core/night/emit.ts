/**
 * Emit product `@night.yaml` beside a Day theme entry.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ExitCode, type ExitCodeType } from '../../types/index.ts';
import {
	collectDependencyDictionary,
	processThemeDocument,
} from '../pipeline/theme-pipeline.ts';
import { loadDesignTokenWorkspace } from '../pipeline/workspace-loader.ts';
import { deriveNightOverlay } from './derive-overlay.ts';
import {
	type NightCliParams,
	parseNightConfigSection,
	type ResolvedNightParams,
	resolveNightParams,
} from './params.ts';

export interface EmitNightInput {
	/** Path to main.yaml (default: cwd/main.yaml). */
	themePath?: string;
	cwd?: string;
	cli: NightCliParams;
	/** When true, refuse to overwrite an existing overlay. */
	noOverwrite?: boolean;
}

export interface EmitNightSuccess {
	ok: true;
	outputPath: string;
	themeStem: string;
	/** Same as Day document identity (no @night suffix). */
	themeId: string;
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
	const loaded = await loadDesignTokenWorkspace(input.themePath, cwd);
	if (!loaded.ok) {
		return {
			ok: false,
			exitCode: loaded.exitCode,
			message: loaded.message,
		};
	}

	let params: ResolvedNightParams;
	try {
		params = resolveNightParams(
			input.cli,
			await readRawConfigNight(loaded.workspace.path),
		);
	} catch (error) {
		return {
			ok: false,
			exitCode: ExitCode.INVALID_PARAMETER,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	const deps = await collectDependencyDictionary(
		loaded.workspace.config,
		loaded.workspace.workspaceDir,
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
		loaded.workspace.path,
		deps.dict,
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
	const themeStem = loaded.workspace.config.theme;
	// Day/Night share themeId; mode distinguishes appearance for Token Manage.
	const themeId = loaded.workspace.themeId?.trim() || themeStem;
	const baseId = themeId;
	const mode = 'night' as const;
	const outputPath = nightOverlayPath(loaded.workspace.path);

	let overwrote = false;
	try {
		await fs.access(outputPath);
		overwrote = true;
	} catch {
		overwrote = false;
	}
	if (overwrote && input.noOverwrite) {
		return {
			ok: false,
			exitCode: ExitCode.GENERAL_ERROR,
			message: `Night overlay already exists: ${outputPath}`,
		};
	}

	const header = [
		`# Night overlay draft — wave night (pure color-rule)`,
		`# Source Day: ${loaded.workspace.path}`,
		`# Generated: ${new Date().toISOString()}`,
		`# scene=${params.scene} (lightsLevel=${params.lightsLevel}, via ${params.sceneSource})`,
		`# chroma=${params.chroma} (via ${params.chromaSource})`,
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

	await fs.writeFile(outputPath, `${header}${body}`, 'utf8');

	return {
		ok: true,
		outputPath,
		themeStem,
		themeId,
		baseId,
		mode,
		params,
		mappedCount: derived.mapped.length,
		overwrote,
	};
}
