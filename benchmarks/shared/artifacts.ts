import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { sha256File } from './hash.ts';

export interface FileArtifact {
	relativePath: string;
	path: string;
	bytes: number;
	sha256: string;
}

async function walkFiles(dir: string, root: string): Promise<FileArtifact[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files: FileArtifact[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(fullPath, root)));
			continue;
		}
		if (!entry.isFile()) continue;

		const stat = await fs.stat(fullPath);
		files.push({
			relativePath: path.relative(root, fullPath),
			path: fullPath,
			bytes: stat.size,
			sha256: await sha256File(fullPath),
		});
	}

	return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function collectFileArtifacts(
	dir: string,
): Promise<FileArtifact[]> {
	try {
		const stat = await fs.stat(dir);
		if (!stat.isDirectory()) return [];
	} catch {
		return [];
	}

	return walkFiles(dir, dir);
}

export function totalArtifactBytes(files: FileArtifact[]): number {
	return files.reduce((total, file) => total + file.bytes, 0);
}

export function commonDirectoryRoot(dirs: string[]): string {
	if (dirs.length === 0) return '';
	const resolved = dirs.map((dir) => path.resolve(dir));
	const [first, ...rest] = resolved;
	if (!first) return '';
	const segments = first.split(path.sep);
	let end = segments.length;

	for (const dir of rest) {
		const otherSegments = dir.split(path.sep);
		while (
			end > 0 &&
			segments.slice(0, end).join(path.sep) !==
				otherSegments.slice(0, end).join(path.sep)
		) {
			end -= 1;
		}
	}

	const root = segments.slice(0, end).join(path.sep);
	return root === '' ? path.sep : root;
}
