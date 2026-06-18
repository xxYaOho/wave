import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd: rootDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { exitCode, stdout, stderr };
}

async function directoryExists(dir: string): Promise<boolean> {
	try {
		return (await fs.stat(dir)).isDirectory();
	} catch {
		return false;
	}
}

describe('wave manual', () => {
	test('top-level help includes manual command', async () => {
		const { exitCode, stdout } = await runWave(['--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('manual         Open the local Wave manual');
	});

	test('manual help is actionable', async () => {
		const { exitCode, stdout } = await runWave(['manual', '--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Manual');
		expect(stdout).toContain('wave manual [options]');
		expect(stdout).toContain('--port <port>');
		expect(stdout).toContain('--host <host>');
		expect(stdout).toContain('--no-open');
	});

	test('missing build output returns readable error', async () => {
		const manualApp = path.join(rootDir, 'dist/manual-app');
		const backup = path.join(rootDir, 'dist/manual-app-test-backup');
		await fs.rm(backup, { recursive: true, force: true });
		try {
			if (await directoryExists(manualApp)) {
				await fs.rename(manualApp, backup);
			}

			const { exitCode, stderr } = await runWave([
				'manual',
				'--no-open',
				'--port',
				'4567',
			]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain('Manual app is not built');
		} finally {
			if (await directoryExists(backup)) {
				await fs.rename(backup, manualApp);
			}
		}
	});
});
