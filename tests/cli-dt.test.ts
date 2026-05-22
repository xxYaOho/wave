import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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

describe('wave dt', () => {
	test('dt help shows module commands instead of build help', async () => {
		const { exitCode, stdout } = await runWave(['dt', '--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Usage: wave dt');
		expect(stdout).toContain('build');
		expect(stdout).toContain('wcag');
		expect(stdout).not.toContain('Usage: wave dt build');
	});

	test('dt build generates design token output through the new module entry', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		const outputDir = path.join(rootDir, '.temp-test-dt-build');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode } = await runWave([
			'dt',
			'build',
			'-f',
			path.join(fixtureDir, 'themefile'),
			'-o',
			outputDir,
		]);

		expect(exitCode).toBe(0);

		const output = JSON.parse(
			await fs.readFile(path.join(outputDir, 'test-standard.json'), 'utf-8'),
		);
		expect(output['theme-color-primary']).toBeDefined();

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('dt without subcommand defaults to build', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		const outputDir = path.join(rootDir, '.temp-test-dt-default-build');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode } = await runWave([
			'dt',
			'-f',
			path.join(fixtureDir, 'themefile'),
			'-o',
			outputDir,
		]);

		expect(exitCode).toBe(0);
		expect(
			await Bun.file(path.join(outputDir, 'test-standard.json')).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('dt wcag runs contrast checks as a dedicated design-token command', async () => {
		const { exitCode, stdout } = await runWave([
			'dt',
			'wcag',
			'--file',
			'tests/fixtures/themes/doctor-contrast-pass/themefile',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Contrast Check');
		expect(stdout).toContain('doctor-contrast-pass');
		expect(stdout).toContain('🟢 Normal Text   (AAA)');
	});

	test('dt wcag supports main night scope', async () => {
		const { exitCode, stdout } = await runWave([
			'dt',
			'wcag',
			'main',
			'--night',
			'--file',
			'tests/fixtures/themes/doctor-contrast-multi/themefile',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('doctor-contrast-multi-night');
	});

	test('dt wcag supports variant scope', async () => {
		const { exitCode, stdout } = await runWave([
			'dt',
			'wcag',
			'dark',
			'--file',
			'tests/fixtures/themes/doctor-contrast-variant-night/themefile',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('doctor-contrast-variant-night-dark');
	});

	test('dt wcag supports variant night scope', async () => {
		const { exitCode, stdout } = await runWave([
			'dt',
			'wcag',
			'dark',
			'--night',
			'--file',
			'tests/fixtures/themes/doctor-contrast-variant-night/themefile',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('doctor-contrast-variant-night-dark-night');
	});

	test('dt init creates a design-token workspace template', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-dt-init-'));

		try {
			const proc = Bun.spawn(
				['bun', 'run', path.join(rootDir, 'src/index.ts'), 'dt', 'init'],
				{
					cwd: tempDir,
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);

			const stdout = await new Response(proc.stdout).text();
			const exitCode = await proc.exited;

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Theme template initialized successfully');
			expect(await Bun.file(path.join(tempDir, 'themefile')).exists()).toBe(
				true,
			);
			expect(await Bun.file(path.join(tempDir, 'main.yaml')).exists()).toBe(
				true,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('dt show lists built-in design-token resources', async () => {
		const { exitCode, stdout } = await runWave(['dt', 'show']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Palettes:');
		expect(stdout).toContain('Dimensions:');
		expect(stdout).toContain('tailwindcss4');
		expect(stdout).toContain('wave');
	});
});
