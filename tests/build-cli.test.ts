import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createCliRunner } from './utils/cli-runner.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const waveBin = path.join(rootDir, 'dist/wave');

const runCommand = createCliRunner(
	(args: string[], options: { cwd?: string } = {}) => ({
		command: args,
		cwd: options.cwd ?? rootDir,
	}),
);

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

	test('packages Markdown manual content for use outside the source checkout', async () => {
		const build = await runCommand(['pnpm', 'build:cli']);
		expect(build.exitCode).toBe(0);

		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-built-cli-'));
		try {
			const result = await runCommand(
				[waveBin, 'token', 'new', 'night', '-m'],
				{
					cwd: tempDir,
				},
			);
			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe('');
			expect(result.stdout).toContain('# token new night');
			expect(result.stdout).toContain('## Scope');
			expect(result.stdout).toContain('## Options');
			expect(result.stdout).toContain('## Related commands');
			expect(result.stdout).not.toMatch(/[\u4e00-\u9fff]/);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
