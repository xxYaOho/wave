import * as yaml from 'js-yaml';
import {
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
} from '../pipeline/profile-resolver.ts';
import { collectDependencyDictionary } from '../pipeline/theme-pipeline.ts';
import {
	createTokenCache,
	type TokenCache,
} from '../pipeline/token-cache.ts';
import { loadDesignTokenSource } from '../pipeline/workspace-loader.ts';
import { runThemeContrastCheck } from './registry.ts';
import { createThemeDoctorContextFromContent } from './theme-context.ts';
import { ExitCode, type DoctorRunResult } from '../../types/index.ts';

export type WcagServiceResult =
	| { kind: 'error'; message: string; exitCode: number }
	| { kind: 'skip'; message: typeof NIGHT_SKIP_MESSAGE }
	| ({ kind: 'result'; displayThemeName: string } & DoctorRunResult);

export async function runDesignTokenContrastCheck(
	options: { sourcePath?: string; night?: boolean },
	cache = createTokenCache(),
): Promise<WcagServiceResult> {
	const loadResult = await loadDesignTokenSource(options.sourcePath, undefined, cache);
	if (!loadResult.ok)
		return {
			kind: 'error',
			message: loadResult.message,
			exitCode: loadResult.exitCode,
		};

	const { source } = loadResult;
	const { workspace, entry } = source;
	const document = source.document;
	const profileDictResult = await collectDependencyDictionary(
		document.config,
		document.buildDir,
		{},
		cache,
	);

	let contextPath = entry.path;
	let contextContent = document.tokenContent;
	let displayThemeName = entry.isDefault
		? workspace.config.theme
		: `${workspace.config.theme}-${entry.name}`;
	if (options.night) {
		if (!entry.nightPath) return { kind: 'skip', message: NIGHT_SKIP_MESSAGE };
		const dayRaw = yaml.load(document.tokenContent);
		const nightRaw = yaml.load(await Bun.file(entry.nightPath).text());
		const merged =
			typeof dayRaw === 'object' &&
			dayRaw !== null &&
			!Array.isArray(dayRaw) &&
			typeof nightRaw === 'object' &&
			nightRaw !== null &&
			!Array.isArray(nightRaw)
				? mergeNightOverlay(
						dayRaw as Record<string, unknown>,
						nightRaw as Record<string, unknown>,
				  )
				: { ok: false as const, message: NIGHT_SKIP_MESSAGE };
		if (!merged.ok) {
			if ('error' in merged)
				return {
					kind: 'error',
					message: merged.error,
					exitCode: ExitCode.FORMAT_ERROR,
				};
			return { kind: 'skip', message: NIGHT_SKIP_MESSAGE };
		}
		contextContent = yaml.dump(merged.tree, { lineWidth: -1 });
		contextPath = entry.nightPath;
		displayThemeName = `${displayThemeName}-night`;
	}

	const ctxResult = await createThemeDoctorContextFromContent(
		contextPath,
		contextContent,
		profileDictResult.dict,
	);
	if (!ctxResult.ok)
		return {
			kind: 'error',
			message: ctxResult.findings[0]!.message,
			exitCode: ctxResult.exitCode,
		};

	const checkResult = await runThemeContrastCheck(ctxResult.context);
	return { kind: 'result', displayThemeName, ...checkResult };
}
