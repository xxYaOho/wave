import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const DEFAULT_MAIN_YAML = 'main.yaml';

export type ExclusiveFileInput =
	| { ok: true; path: string | undefined }
	| { ok: false; message: string };

/**
 * Resolve a CLI file input where a positional path and `-f/--file` are mutually
 * exclusive. Either may be omitted (caller applies cwd `main.yaml` default).
 */
export function resolveExclusiveFileInput(
	positional: string | undefined,
	fileOption: string | undefined,
	opts?: { label?: string; hint?: string },
): ExclusiveFileInput {
	if (positional && fileOption) {
		const label = opts?.label ?? 'input';
		const hint = opts?.hint ? ` ${opts.hint}` : '';
		return {
			ok: false,
			message: `Invalid ${label}: both ${positional} and ${fileOption} were provided. Use one path.${hint}`,
		};
	}
	return { ok: true, path: positional ?? fileOption };
}

/**
 * If `input` is a directory that contains `main.yaml`, return that file path.
 * Otherwise return the input unchanged (including `undefined` for caller
 * defaults). A directory without `main.yaml` stays as-is so the workspace
 * loader can reject it with the main-only entry matrix.
 */
export async function expandMainYamlEntry(
	input: string | undefined,
	cwd = process.cwd(),
): Promise<string | undefined> {
	if (input === undefined) return undefined;
	const resolved = path.isAbsolute(input) ? input : path.resolve(cwd, input);
	try {
		const stats = await fs.stat(resolved);
		if (!stats.isDirectory()) return input;
		const candidate = path.join(resolved, DEFAULT_MAIN_YAML);
		try {
			const candidateStats = await fs.stat(candidate);
			if (candidateStats.isFile()) return candidate;
		} catch {
			// fall through
		}
		return input;
	} catch {
		// Missing paths stay as given so downstream can report not-found.
	}
	return input;
}
