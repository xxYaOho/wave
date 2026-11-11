import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { $ } from 'bun';
import { createManualData } from '../src/core/manual/build.ts';

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

const manual = await createManualData(rootDir);
// The CLI only consumes the English view. Keeping the embedded define to this
// view avoids duplicating the web bundle's Chinese data in the executable.
const manualData = manual.locales?.en ?? manual;

async function cleanupBunBuildArtifacts(): Promise<void> {
	const entries = await fs.readdir(rootDir);
	await Promise.all(
		entries
			.filter((entry) => entry.startsWith('.') && entry.endsWith('.bun-build'))
			.map((entry) => fs.rm(path.join(rootDir, entry), { force: true })),
	);
}

await cleanupBunBuildArtifacts();
await $`bun build ${path.join(rootDir, 'src/index.ts')} --compile --outfile ${outFile} --define ${`process.env.WAVE_VERSION=${JSON.stringify(version)}`} --define ${`process.env.WAVE_MANUAL_DATA=${JSON.stringify(JSON.stringify(manualData))}`}`;
await fs.rm(packagedResourcesDir, { recursive: true, force: true });
await fs.cp(sourceResourcesDir, packagedResourcesDir, { recursive: true });

if (process.platform === 'darwin') {
	await $`codesign --force --sign - ${outFile}`;
}

await cleanupBunBuildArtifacts();
