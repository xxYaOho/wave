import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(
	args: string[],
	options: { env?: Record<string, string> } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn([process.execPath, 'run', 'src/index.ts', ...args], {
		cwd: rootDir,
		env: options.env ? { ...process.env, ...options.env } : process.env,
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
		expect(result.canInstall).toBe(false);
		expect(result.command).toBeNull();
		expect(result.note).toContain('wave install --yes');
	});

	test('module install --yes does not run full mise install', async () => {
		const { exitCode, stdout, stderr } = await runWave([
			'compress',
			'install',
			'--yes',
		]);

		expect(exitCode).toBe(2);
		expect(stdout).toContain('compress install plan');
		expect(stdout).toContain('Command: (check only)');
		expect(stderr).toContain('wave install --yes');
	});

	test('module install --json --yes returns one failed install result', async () => {
		const { exitCode, stdout } = await runWave([
			'motion',
			'install',
			'--json',
			'--yes',
		]);
		const result = JSON.parse(stdout);

		expect(exitCode).toBe(2);
		expect(result.kind).toBe('install-result');
		expect(result.module).toBe('motion');
		expect(result.ok).toBe(false);
		expect(result.error).toContain('wave install --yes');
	});

	test('install --yes reports missing mise without a stack trace', async () => {
		const { exitCode, stdout, stderr } = await runWave(['install', '--yes'], {
			env: { PATH: '/usr/bin:/bin' },
		});

		expect(exitCode).toBe(1);
		expect(stdout).toContain('wave install plan');
		expect(stderr).toContain('mise is required');
		expect(stderr).not.toContain('Executable not found');
		expect(stderr).not.toContain('Bun v');
	});

	test('install --json --yes reports missing mise as pure JSON', async () => {
		const { exitCode, stdout, stderr } = await runWave(
			['install', '--json', '--yes'],
			{ env: { PATH: '/usr/bin:/bin' } },
		);
		const result = JSON.parse(stdout);

		expect(exitCode).toBe(1);
		expect(stderr).toBe('');
		expect(result.ok).toBe(false);
		expect(result.error).toContain('mise is required');
	});
});
