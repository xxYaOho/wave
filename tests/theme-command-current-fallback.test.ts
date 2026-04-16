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

describe('theme command current fallback behavior', () => {
	test('fails fast when main.yaml has unresolvable references', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/baseline-fallback');
		const outputDir = path.join(rootDir, '.temp-test-baseline-fallback');

		try {
			await fs.rm(outputDir, { recursive: true, force: true });
		} catch {}

		const { exitCode, stderr } = await runWaveTheme([
			'-f',
			path.join(fixtureDir, 'themefile'),
			'-o',
			outputDir,
		]);

		// After fail-fast refactor: parse failure returns non-zero and does not generate files
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('Unresolved theme references found');

		const fileExists = await Bun.file(
			path.join(outputDir, 'baseline-fallback.json'),
		).exists();
		expect(fileExists).toBe(false);
	});
});
