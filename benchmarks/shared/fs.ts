import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export async function ensureCleanDir(dir: string): Promise<void> {
	await fs.rm(dir, { recursive: true, force: true });
	await fs.mkdir(dir, { recursive: true });
}

export async function copyDirectory(
	sourceDir: string,
	targetDir: string,
): Promise<void> {
	await fs.mkdir(targetDir, { recursive: true });
	const entries = await fs.readdir(sourceDir, { withFileTypes: true });

	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.join(targetDir, entry.name);
		if (entry.isDirectory()) {
			await copyDirectory(sourcePath, targetPath);
			continue;
		}
		if (!entry.isFile()) continue;

		await fs.copyFile(sourcePath, targetPath);
	}
}
