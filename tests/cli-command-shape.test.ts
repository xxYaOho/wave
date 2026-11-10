import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(
		['bun', 'run', path.join(rootDir, 'src/index.ts'), ...args],
		{
			cwd: rootDir,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	return { exitCode: await proc.exited, stdout, stderr };
}

describe('public CLI command shape', () => {
	test('top-level help uses grouped new command tree', async () => {
		const result = await runWave(['--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Common commands:');
		expect(result.stdout).toContain('token');
		expect(result.stdout).toContain('Workspace:');
		expect(result.stdout).toContain('Toolchain:');
		expect(result.stdout).toContain('version');
	});

	test('token help separates commands and resources', async () => {
		const result = await runWave(['token', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('build');
		expect(result.stdout).toContain('new');
		expect(result.stdout).toContain('migrate');
		expect(result.stdout).toContain('Resources:');
		expect(result.stdout).toContain('show');
		expect(result.stdout).not.toContain('\n    resources');
		expect(result.stdout).not.toContain('--out <path>');
	});

	test('token new exposes profile and night creation commands', async () => {
		const result = await runWave(['token', 'new', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('profile');
		expect(result.stdout).toContain('night');

		const night = await runWave(['token', 'new', 'night', '--help']);
		expect(night.exitCode).toBe(0);
		expect(night.stdout).toContain('wave token new night [options]');
		expect(night.stdout).toContain('-f, --file <path>');
		expect(night.stdout).toContain('-m, --manual');
		expect(night.stdout).toContain('-h, --help');
		expect(night.stdout).not.toContain('[theme]');
		expect(night.stdout.match(/Wave Night/g)?.length).toBe(1);

		const positional = await runWave(['token', 'new', 'night', './main.yaml']);
		expect(positional.exitCode).not.toBe(0);
	});

	test('top-level help uses the approved groups and options', async () => {
		const result = await runWave(['--help']);
		expect(result.stdout).toContain('Common commands:');
		expect(result.stdout).toContain('Workspace:');
		expect(result.stdout).toContain('Other:');
		expect(result.stdout).toContain('Options:');
		expect(result.stdout).toContain('-m, --manual');
		expect(result.stdout).toContain('-h, --help');
		expect(result.stdout).toContain('--version');
		const shortVersion = await runWave(['-v']);
		expect(shortVersion.exitCode).toBe(0);
	});

	test('manual short-circuits every command level', async () => {
		const result = await runWave(['token', 'build', '--manual']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('# token build');
		expect(result.stdout).not.toContain('BUILD FAILED');
	});

	test('manual rejects unknown command paths', async () => {
		const result = await runWave(['token', 'unknown', '--manual']);
		expect(result.exitCode).not.toBe(0);
		expect(result.stdout).toBe('');
		expect(result.stderr).toContain('Unknown command path');
	});

	test('tailwind-version compatibility flag is rejected', async () => {
		const result = await runWave([
			'token',
			'update',
			'--tailwind-version',
			'4',
		]);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('unknown option');
	});

	test('legacy aliases and subcommands fail', async () => {
		for (const args of [
			['design-token'],
			['dt'],
			['mg'],
			['night'],
			['show'],
			['compress', 'run'],
			['motion', 'gif'],
			['workspace', 'create'],
			['token', '--build'],
		]) {
			const result = await runWave(args);
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).not.toContain('CommanderError');
		}
	});
});
