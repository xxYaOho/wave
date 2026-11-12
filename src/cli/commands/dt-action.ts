import {
	getResourceStatus,
	updateLeonardo,
	updateTailwind,
} from '../../core/resources/manager.ts';
import { ExitCode } from '../../types/index.ts';

export function createUpdateCommandAction() {
	return async (name: string | undefined, options: { version?: string }) => {
		const target = name ?? 'all';
		const version = options.version;
		try {
			if (target === 'tailwindcss' || target === 'all') {
				const result = await updateTailwind(version);
				console.log(
					`Updated tailwindcss ${result.resolvedVersion} (v${result.activeMajor})`,
				);
				for (const file of result.files) console.log(`  ${file}`);
			}
			if (target === 'leonardo' || target === 'all') {
				const result = await updateLeonardo();
				console.log(`Updated leonardo (${result.recipeSource} recipe)`);
				for (const file of result.files) console.log(`  ${file}`);
			}
			if (
				target !== 'tailwindcss' &&
				target !== 'leonardo' &&
				target !== 'all'
			) {
				console.error(
					`Unknown resource: ${target}. Supported: tailwindcss, leonardo`,
				);
				process.exitCode = ExitCode.INVALID_PARAMETER;
			}
		} catch (error) {
			console.error(
				`Resource update failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exitCode = ExitCode.GENERAL_ERROR;
		}
	};
}

export function createStatusCommandAction() {
	return async () => {
		const status = await getResourceStatus();
		console.log('Wave Resource Status');
		console.log(`Cache:  ${status.cacheDir}`);
		console.log(`State:  ${status.statePath}`);
		console.log(`Config: ${status.configDir}`);
		console.log('');
		console.log('tailwindcss');
		console.log(
			`  updated: ${status.tailwindcss.updatedBefore ? 'yes' : 'no'}`,
		);
		console.log(
			`  cache:   ${status.tailwindcss.cacheExists ? 'present' : 'missing'}`,
		);
		console.log(
			`  version: ${status.tailwindcss.resolvedVersion ?? 'builtin fallback'}`,
		);
		console.log(
			`  request: ${status.tailwindcss.requestedVersion ?? 'not requested'}`,
		);
		console.log('');
		console.log('leonardo');
		console.log(`  updated: ${status.leonardo.updatedBefore ? 'yes' : 'no'}`);
		console.log(
			`  cache:   light=${status.leonardo.lightCacheExists ? 'present' : 'missing'}, dark=${status.leonardo.darkCacheExists ? 'present' : 'missing'}`,
		);
		console.log(`  recipe:  ${status.leonardo.recipe ?? 'builtin fallback'}`);
		console.log(`  recipe path: ${status.leonardoRecipePath}`);
	};
}
