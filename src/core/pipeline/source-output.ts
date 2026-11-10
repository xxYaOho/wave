import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Validate a single source-file write before creating any directories. */
export async function planSourceOutput(
	outputPath: string,
	force = false,
	protectedPaths: string[] = [],
): Promise<{ outputPath: string; overwrites: boolean }> {
	const target = path.resolve(outputPath);
	let existing: Awaited<ReturnType<typeof fs.lstat>> | undefined;
	try {
		existing = await fs.lstat(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	if (existing && !existing.isFile())
		throw new Error(
			`Output must be a regular file, not a directory or symlink: ${target}`,
		);
	for (const source of protectedPaths) {
		const sourceStat = await fs.stat(source);
		if (
			target === path.resolve(source) ||
			(existing &&
				existing.dev === sourceStat.dev &&
				existing.ino === sourceStat.ino)
		)
			throw new Error(
				`Output cannot overwrite a Day source or base: ${target}`,
			);
	}
	if (existing && !force)
		throw new Error(
			`Output already exists: ${target}. Use --force to overwrite.`,
		);
	// Catch invalid parent paths during dry-run too, without mkdir side effects.
	let parent = path.dirname(target);
	while (true) {
		try {
			if (!(await fs.stat(parent)).isDirectory())
				throw new Error(`Output parent must be a directory: ${parent}`);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			parent = path.dirname(parent);
		}
	}
	return { outputPath: target, overwrites: existing !== undefined };
}

/** Exclusive creation by default; forced replacement changes only this entry. */
export async function writeSourceOutput(
	outputPath: string,
	content: string,
	force = false,
): Promise<void> {
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	if (!force) {
		await fs.writeFile(outputPath, content, { encoding: 'utf8', flag: 'wx' });
		return;
	}
	// Rename avoids truncating another file through an existing hard link.
	const temporary = path.join(
		path.dirname(outputPath),
		`.wave-${randomUUID()}.tmp`,
	);
	try {
		await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
		await fs.rename(temporary, outputPath);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
