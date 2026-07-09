import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { BuiltinDimension, BuiltinPalette } from '../../types/index.ts';

const SOURCE_RESOURCES_DIR = path.join(import.meta.dir, '..', '..', 'resources');

function candidateResourceDirs(): string[] {
	const execDir = path.dirname(process.execPath);
	return [...new Set([SOURCE_RESOURCES_DIR, path.join(execDir, 'resources')])];
}

function hasKnownResource(resourceDir: string): boolean {
	try {
		return (
			Bun.file(path.join(resourceDir, 'palettes', 'tailwindcss.yaml')).size > 0 &&
			Bun.file(path.join(resourceDir, 'dimensions', 'wave.yaml')).size > 0
		);
	} catch {
		return false;
	}
}

export function getResourcesDir(): string {
	for (const candidate of candidateResourceDirs()) {
		if (hasKnownResource(candidate)) {
			return candidate;
		}
	}
	return SOURCE_RESOURCES_DIR;
}

export async function loadBuiltinPalette(
	name: string,
): Promise<BuiltinPalette | null> {
	try {
		const filePath = getBuiltinPalettePath(name);
		const file = Bun.file(filePath);

		if (!(await file.exists())) {
			return null;
		}

		const content = await file.text();
		const parsed = yaml.load(content) as BuiltinPalette;

		return parsed;
	} catch (error) {
		console.error(`Failed to load builtin palette "${name}":`, error);
		return null;
	}
}

export async function loadBuiltinDimension(
	name: string,
): Promise<BuiltinDimension | null> {
	try {
		const filePath = getBuiltinDimensionPath(name);
		const file = Bun.file(filePath);

		if (!(await file.exists())) {
			return null;
		}

		const content = await file.text();
		const parsed = yaml.load(content) as BuiltinDimension;

		return parsed;
	} catch (error) {
		console.error(`Failed to load builtin dimension "${name}":`, error);
		return null;
	}
}

export function getBuiltinPalettePath(name: string): string {
	return path.join(getResourcesDir(), 'palettes', `${name}.yaml`);
}

export function getBuiltinDimensionPath(name: string): string {
	return path.join(getResourcesDir(), 'dimensions', `${name}.yaml`);
}
