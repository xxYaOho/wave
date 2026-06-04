import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

async function runWave(
	args: string[],
	env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', 'src/index.ts', ...args], {
		cwd: rootDir,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

describe('wave show', () => {
	test('lists built-in palettes and dimensions without args', async () => {
		const { exitCode, stdout } = await runWave(['show']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Palettes:');
		expect(stdout).toContain('Dimensions:');
		expect(stdout).toContain('leonardo');
		expect(stdout).toContain('tailwindcss4');
		expect(stdout).toContain('wave');
	});

	test('lists resources for a category', async () => {
		const { exitCode, stdout } = await runWave(['show', 'palette']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Palettes:');
		expect(stdout).toContain('leonardo');
		expect(stdout).toContain('tailwindcss4');
	});

	test('outputs flat-json for a palette by default', async () => {
		const { exitCode, stdout } = await runWave(['show', 'tailwindcss4']);

		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(typeof parsed).toBe('object');
		expect(Object.keys(parsed).length).toBeGreaterThan(0);
		// Should contain flat keys like tailwindcss4.color.red.50
		const hasFlatKey = Object.keys(parsed).some((k) =>
			k.startsWith('tailwindcss4.color.'),
		);
		expect(hasFlatKey).toBe(true);
	});

	test('outputs yaml for a dimension', async () => {
		const { exitCode, stdout } = await runWave([
			'show',
			'wave',
			'--format',
			'yaml',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('wave:');
	});

	test('outputs nested json for a palette', async () => {
		const { exitCode, stdout } = await runWave([
			'show',
			'leonardo',
			'--format',
			'json',
		]);

		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty('leonardo');
	});

	test('shows resource detail with category and name', async () => {
		const { exitCode, stdout } = await runWave([
			'show',
			'palette',
			'tailwindcss4',
			'--format',
			'yaml',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('tailwindcss4:');
	});

	test('shows updated cache resource without network access', async () => {
		const tempHome = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-show-cache-'),
		);
		const env = {
			HOME: tempHome,
			WAVE_TAILWIND_FIXTURE_DIR: path.join(rootDir, 'tests/fixtures/resources'),
		};
		try {
			const update = await runWave(
				['dt', 'update', 'tailwindcss', '--version', '3'],
				env,
			);
			expect(update.exitCode).toBe(0);

			const show = await runWave(['show', 'tailwindcss'], {
				HOME: tempHome,
				WAVE_TAILWIND_FIXTURE_DIR: '/no/such/fixture',
			});

			expect(show.exitCode).toBe(0);
			const parsed = JSON.parse(show.stdout);
			expect(parsed['tailwindcss.color.red.500']).toBe('#ef4444');
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('returns error for nonexistent resource', async () => {
		const { exitCode, stderr } = await runWave(['show', 'nonexistent']);

		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('not found');
	});

	test('returns error for unknown format', async () => {
		const { exitCode, stderr } = await runWave([
			'show',
			'wave',
			'--format',
			'xml',
		]);

		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('Unknown format');
	});

	test('returns error for unknown category', async () => {
		const { exitCode, stderr } = await runWave([
			'show',
			'unknown-category',
			'some-name',
		]);

		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('Unknown category');
	});
});
