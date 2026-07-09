import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { $ } from 'bun';

const rootDir = path.resolve(import.meta.dir, '..');
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(distDir, 'wave');
const sourceResourcesDir = path.join(rootDir, 'src', 'resources');
const packagedResourcesDir = path.join(distDir, 'resources');
const pkg = await Bun.file(path.join(rootDir, 'package.json')).json();
const version = String(pkg.version ?? '').trim();

if (!version) {
	throw new Error('Missing package.json version.');
}

async function cleanupBunBuildArtifacts(): Promise<void> {
	const entries = await fs.readdir(rootDir);
	await Promise.all(
		entries
			.filter((entry) => entry.startsWith('.') && entry.endsWith('.bun-build'))
			.map((entry) => fs.rm(path.join(rootDir, entry), { force: true })),
	);
}

await cleanupBunBuildArtifacts();
await $`bun build ${path.join(rootDir, 'src/index.ts')} --compile --outfile ${outFile} --define ${`process.env.WAVE_VERSION="${version}"`}`;
await fs.rm(packagedResourcesDir, { recursive: true, force: true });
await fs.cp(sourceResourcesDir, packagedResourcesDir, { recursive: true });

if (process.platform === 'darwin') {
	await $`codesign --force --sign - ${outFile}`;
}

await cleanupBunBuildArtifacts();
