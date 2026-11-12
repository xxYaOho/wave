import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { createInstallPlan } from '../src/cli/commands/install.ts';
import { createCliRunner } from './utils/cli-runner.ts';

const rootDir = path.resolve(import.meta.dir, '..');

const runWave = createCliRunner(
	(args: string[], options: { env?: Record<string, string> } = {}) => ({
		command: [process.execPath, 'run', 'src/index.ts', ...args],
		cwd: rootDir,
		env: options.env ? { ...process.env, ...options.env } : process.env,
	}),
);

describe('toolchain CLI', () => {
	test('compress doctor --json returns structured toolchain diagnostics', async () => {
		const { stdout } = await runWave(['compress', 'doctor', '--json']);
		const result = JSON.parse(stdout);

		expect(result.module).toBe('compress');
		expect(Array.isArray(result.checks)).toBe(true);
		expect(result.checks.length).toBeGreaterThan(0);
	});

	test('removed mg alias is rejected while motion doctor stays available', async () => {
		const removed = await runWave(['mg', 'doctor', '--json']);
		expect(removed.exitCode).not.toBe(0);

		const { exitCode, stdout } = await runWave(['motion', 'doctor', '--json']);
		const result = JSON.parse(stdout);

		expect(exitCode).toBe(0);
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
		expect(result.canInstall).toBe(true);
		expect(result.command).toEqual(['mise', 'run', 'install:compress']);
		expect(result.note).toContain('install:compress');
	});

	test('module install plans use module-specific mise tasks', () => {
		expect(createInstallPlan('compress')).toMatchObject({
			module: 'compress',
			canInstall: true,
			command: ['mise', 'run', 'install:compress'],
		});
		expect(createInstallPlan('motion')).toMatchObject({
			module: 'motion',
			canInstall: true,
			command: ['mise', 'run', 'install:motion'],
		});
	});

	test('core install plan uses the full wave install task', () => {
		expect(createInstallPlan('core')).toMatchObject({
			module: 'core',
			canInstall: true,
			command: ['mise', 'run', 'install:wave'],
		});
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
