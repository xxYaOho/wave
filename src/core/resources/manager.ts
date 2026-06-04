import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildLeonardoResources } from './leonardo.ts';
import {
	leonardoRecipePath,
	resourceCacheDir,
	resourceCachePath,
	resourceConfigDir,
	resourceStatePath,
} from './paths.ts';
import { readResourceState, writeResourceState } from './state.ts';
import { buildTailwindResource } from './tailwind.ts';

export type ResourceName = 'tailwindcss' | 'leonardo';

export async function writeCacheResource(
	name: string,
	content: string,
): Promise<string> {
	const filePath = resourceCachePath(name);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf-8');
	return filePath;
}

export async function updateTailwind(
	version?: string,
): Promise<{ files: string[]; resolvedVersion: string; activeMajor: number }> {
	const result = await buildTailwindResource(version);
	const filePath = await writeCacheResource('tailwindcss', result.content);
	const state = await readResourceState();
	state.tailwindcss = {
		updatedBefore: true,
		requestedVersion: result.requestedVersion,
		resolvedVersion: result.resolvedVersion,
		activeMajor: result.activeMajor,
	};
	await writeResourceState(state);
	return {
		files: [filePath],
		resolvedVersion: result.resolvedVersion,
		activeMajor: result.activeMajor,
	};
}

export async function updateLeonardo(): Promise<{
	files: string[];
	recipeSource: 'user' | 'builtin';
}> {
	const result = await buildLeonardoResources();
	const files: string[] = [];
	for (const file of result.files) {
		files.push(await writeCacheResource(file.name, file.content));
	}
	const state = await readResourceState();
	state.leonardo = {
		updatedBefore: true,
		recipe: result.recipeSource,
	};
	await writeResourceState(state);
	return { files, recipeSource: result.recipeSource };
}

export async function updateResource(
	name: ResourceName,
	options: { version?: string } = {},
): Promise<string[]> {
	if (name === 'tailwindcss') {
		const result = await updateTailwind(options.version);
		return result.files;
	}
	const result = await updateLeonardo();
	return result.files;
}

export async function restoreResourceCache(
	name: string,
): Promise<string | null> {
	const state = await readResourceState();
	if (name === 'tailwindcss' && state.tailwindcss?.updatedBefore) {
		try {
			const result = await updateTailwind(state.tailwindcss.requestedVersion);
			return result.files[0] ?? null;
		} catch (error) {
			console.error(
				`Resource cache restore failed for tailwindcss: ${error instanceof Error ? error.message : String(error)}. Falling back to builtin.`,
			);
			return null;
		}
	}
	if (
		(name === 'leonardo-light' || name === 'leonardo-dark') &&
		state.leonardo?.updatedBefore
	) {
		try {
			const result = await updateLeonardo();
			return (
				result.files.find((file) => path.basename(file, '.yaml') === name) ??
				null
			);
		} catch (error) {
			console.error(
				`Resource cache restore failed for ${name}: ${error instanceof Error ? error.message : String(error)}. Falling back to builtin.`,
			);
			return null;
		}
	}
	return null;
}

export async function getResourceStatus(): Promise<{
	cacheDir: string;
	statePath: string;
	configDir: string;
	leonardoRecipePath: string;
	tailwindcss: {
		updatedBefore: boolean;
		cacheExists: boolean;
		requestedVersion?: string;
		resolvedVersion?: string;
		activeMajor?: number;
	};
	leonardo: {
		updatedBefore: boolean;
		lightCacheExists: boolean;
		darkCacheExists: boolean;
		recipe?: string;
	};
}> {
	const state = await readResourceState();
	const exists = async (filePath: string): Promise<boolean> =>
		await Bun.file(filePath).exists();
	return {
		cacheDir: resourceCacheDir(),
		statePath: resourceStatePath(),
		configDir: resourceConfigDir(),
		leonardoRecipePath: leonardoRecipePath(),
		tailwindcss: {
			updatedBefore: state.tailwindcss?.updatedBefore === true,
			cacheExists: await exists(resourceCachePath('tailwindcss')),
			requestedVersion: state.tailwindcss?.requestedVersion,
			resolvedVersion: state.tailwindcss?.resolvedVersion,
			activeMajor: state.tailwindcss?.activeMajor,
		},
		leonardo: {
			updatedBefore: state.leonardo?.updatedBefore === true,
			lightCacheExists: await exists(resourceCachePath('leonardo-light')),
			darkCacheExists: await exists(resourceCachePath('leonardo-dark')),
			recipe: state.leonardo?.recipe,
		},
	};
}
