import * as yaml from 'js-yaml';
import type { BuiltinDimension, BuiltinPalette } from '../../types/index.ts';

export type UserPalette = BuiltinPalette;
export type UserDimension = BuiltinDimension;

export async function loadUserPalette(
	absolutePath: string,
): Promise<UserPalette | null> {
	try {
		const file = Bun.file(absolutePath);

		if (!(await file.exists())) {
			return null;
		}

		const content = await file.text();
		const parsed = yaml.load(content) as UserPalette;

		if (!parsed || typeof parsed !== 'object') {
			return null;
		}

		return parsed;
	} catch (error) {
		if (
			error instanceof yaml.YAMLException ||
			(error instanceof Error &&
				error.message.includes('No such file or directory'))
		) {
			return null;
		}

		return null;
	}
}

export async function loadUserDimension(
	absolutePath: string,
): Promise<UserDimension | null> {
	try {
		const file = Bun.file(absolutePath);

		if (!(await file.exists())) {
			return null;
		}

		const content = await file.text();
		const parsed = yaml.load(content) as UserDimension;

		if (!parsed || typeof parsed !== 'object') {
			return null;
		}

		return parsed;
	} catch (error) {
		if (
			error instanceof yaml.YAMLException ||
			(error instanceof Error &&
				error.message.includes('No such file or directory'))
		) {
			return null;
		}

		return null;
	}
}
