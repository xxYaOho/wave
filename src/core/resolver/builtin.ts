import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { BuiltinDimension, BuiltinPalette } from '../../types/index.ts';

const RESOURCES_DIR = path.join(import.meta.dir, '..', '..', 'resources');

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
	return path.join(RESOURCES_DIR, 'palettes', `${name}.yaml`);
}

export function getBuiltinDimensionPath(name: string): string {
	return path.join(RESOURCES_DIR, 'dimensions', `${name}.yaml`);
}
