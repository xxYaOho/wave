import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

async function runWaveTheme(
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', 'src/index.ts', 'theme', ...args], {
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
	test('main, night and variant are parsed as independent documents', async () => {
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
		const nightJson = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'baseline-independent-night.json'),
				'utf-8',
			),
		);
		const darkJson = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'baseline-independent-dark.json'),
				'utf-8',
			),
		);

		// Each document should contain its own defined value, proving they are independent
		expect(mainJson['theme-test-from']).toBe('#111111');
		expect(nightJson['theme-test-from']).toBe('#222222');
		expect(darkJson['theme-test-from']).toBe('#333333');

		// None should bleed into each other
		expect(mainJson['theme-test-from']).not.toBe('#222222');
		expect(nightJson['theme-test-from']).not.toBe('#111111');

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('palette and dimension are shared as reference sources across main, night and variant', async () => {
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
		const nightJson = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'baseline-independent-night.json'),
				'utf-8',
			),
		);
		const darkJson = JSON.parse(
			await fs.readFile(
				path.join(outputDir, 'baseline-independent-dark.json'),
				'utf-8',
			),
		);

		// All three documents reference the same palette color from shared sources
		expect(mainJson['theme-test-shared']).toBe('#FFFFFF');
		expect(nightJson['theme-test-shared']).toBe('#FFFFFF');
		expect(darkJson['theme-test-shared']).toBe('#FFFFFF');

		await fs.rm(outputDir, { recursive: true, force: true });
	});
});
