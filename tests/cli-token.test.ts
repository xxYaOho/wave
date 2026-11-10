import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(
	args: string[],
	cwd = rootDir,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(
		['bun', 'run', path.join(rootDir, 'src/index.ts'), ...args],
		{
			cwd,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	return { exitCode: await proc.exited, stdout, stderr };
}

describe('wave token', () => {
	test('token and token build both enter the build implementation', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-token-shape-'));
		try {
			const bare = await runWave(['token'], dir);
			const explicit = await runWave(['token', 'build'], dir);
			expect(bare.exitCode).toBe(explicit.exitCode);
			expect(bare.stdout).toContain('BUILD FAILED');
			expect(explicit.stdout).toContain('BUILD FAILED');
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('token new is the workspace creation entry', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-token-new-'));
		try {
			const result = await runWave(['token', 'new'], dir);
			expect(result.exitCode).toBe(0);
			expect(await Bun.file(path.join(dir, 'main.yaml')).exists()).toBe(true);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('migrate requires an explicit migration', async () => {
		const result = await runWave(['token', 'migrate']);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('wave token migrate extensions');
	});
});
