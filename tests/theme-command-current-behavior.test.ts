import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

async function runWaveTheme(
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', 'src/index.ts', 'create', ...args], {
		cwd: rootDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

describe('theme command current behavior', () => {
	test('default create output no longer auto-discovers night or variants', async () => {
		const fixtureDir = path.join(
			rootDir,
			'tests/fixtures/baseline-independent',
		);
		const outputDir = path.join(rootDir, '.temp-test-baseline-independent');

		try {
			await fs.rm(outputDir, { recursive: true, force: true });
		} catch {}

		const { exitCode } = await runWaveTheme([
			'-f',
			path.join(fixtureDir, 'themefile'),
			'-o',
			outputDir,
		]);

		expect(exitCode).toBe(0);

		const mainJson = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'baseline-independent.json'),
				'utf-8',
			),
		);
		const nightExists = await Bun.file(
			path.join(outputDir, 'baseline-independent-night.json'),
		).exists();
		const darkExists = await Bun.file(
			path.join(outputDir, 'baseline-independent-dark.json'),
		).exists();

		expect(mainJson['theme-test-from']).toBe('#111111');
		expect(nightExists).toBe(false);
		expect(darkExists).toBe(false);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('palette and dimension are shared as reference sources for default output', async () => {
		const fixtureDir = path.join(
			rootDir,
			'tests/fixtures/baseline-independent',
		);
		const outputDir = path.join(
			rootDir,
			'.temp-test-baseline-independent-shared',
		);

		try {
			await fs.rm(outputDir, { recursive: true, force: true });
		} catch {}

		const { exitCode } = await runWaveTheme([
			'-f',
			path.join(fixtureDir, 'themefile'),
			'-o',
			outputDir,
		]);

		expect(exitCode).toBe(0);

		const mainJson = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'baseline-independent.json'),
				'utf-8',
			),
		);
		const nightExists = await Bun.file(
			path.join(outputDir, 'baseline-independent-night.json'),
		).exists();
		const darkExists = await Bun.file(
			path.join(outputDir, 'baseline-independent-dark.json'),
		).exists();

		// Color normalization canonicalizes hex output to lowercase.
		expect(mainJson['theme-test-shared']).toBe('#ffffff');
		expect(nightExists).toBe(false);
		expect(darkExists).toBe(false);

		await fs.rm(outputDir, { recursive: true, force: true });
	});
});
