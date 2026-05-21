import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', 'src/index.ts', ...args], {
		cwd: rootDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

describe('toolchain CLI', () => {
	test('compress doctor --json returns structured toolchain diagnostics', async () => {
		const { stdout } = await runWave(['compress', 'doctor', '--json']);
		const result = JSON.parse(stdout);

		expect(result.module).toBe('compress');
		expect(Array.isArray(result.checks)).toBe(true);
		expect(result.checks.length).toBeGreaterThan(0);
	});

	test('motion doctor is also available through mg alias', async () => {
		const { stdout } = await runWave(['mg', 'doctor', '--json']);
		const result = JSON.parse(stdout);

		expect(result.module).toBe('motion');
		expect(Array.isArray(result.checks)).toBe(true);
	});

	test('install --check shows the core mise install plan', async () => {
		const { exitCode, stdout } = await runWave(['install', '--check']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('wave install plan');
		expect(stdout).toContain('mise install');
	});

	test('compress install --json outputs one install plan document', async () => {
		const { exitCode, stdout } = await runWave([
			'compress',
			'install',
			'--json',
		]);
		const result = JSON.parse(stdout);

		expect(exitCode).toBe(0);
		expect(result.kind).toBe('install-plan');
		expect(result.module).toBe('compress');
		expect(result.willInstall).toBe(false);
	});
});
