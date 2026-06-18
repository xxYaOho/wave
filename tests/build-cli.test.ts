import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const waveBin = path.join(rootDir, 'dist/wave');

async function runCommand(
	args: string[],
	options: { cwd?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(args, {
		cwd: options.cwd ?? rootDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

async function listBunBuildArtifacts(): Promise<string[]> {
	const entries = await fs.readdir(rootDir);
	return entries.filter(
		(entry) => entry.startsWith('.') && entry.endsWith('.bun-build'),
	);
}

describe('build:cli', () => {
	test('builds a runnable compiled CLI and cleans Bun build artifacts', async () => {
		const staleArtifact = path.join(rootDir, '.stale-test.bun-build');
		await fs.writeFile(staleArtifact, 'stale', 'utf-8');

		const build = await runCommand(['pnpm', 'build:cli']);

		expect(build.exitCode).toBe(0);
		expect(build.stderr).not.toContain('error:');
		expect(await Bun.file(staleArtifact).exists()).toBe(false);
		expect(await listBunBuildArtifacts()).toEqual([]);

		const pkg = await Bun.file(path.join(rootDir, 'package.json')).json();
		const version = await runCommand([waveBin, '--version']);

		expect(version.exitCode).toBe(0);
		expect(version.stdout.trim()).toBe(pkg.version);

		if (process.platform === 'darwin') {
			const verify = await runCommand([
				'codesign',
				'--verify',
				'--verbose',
				waveBin,
			]);

			expect(verify.exitCode).toBe(0);
			expect(verify.stderr).toContain('valid on disk');
		}
	});
});
