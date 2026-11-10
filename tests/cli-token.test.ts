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
	test('build consumes a Day profile from an arbitrary directory via -f', async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-token-profile-source-'),
		);
		const outputDir = path.join(dir, 'out');
		const profileDir = path.join(dir, 'themes', 'mobile');
		await fs.mkdir(profileDir, { recursive: true });
		const mainPath = path.join(dir, 'main.yaml');
		const profilePath = path.join(profileDir, 'mobile.yaml');
		try {
			await fs.writeFile(
				mainPath,
				`$id: cli-source-base
$config:
  theme: cli-source
  parameter:
    platform: [json]
theme:
  color:
    primary: { $id: primary-id, $type: color, $value: "#112233" }
`,
			);
			await fs.writeFile(
				profilePath,
				`$config:
  base: cli-source-base
$override:
  primary-id:
    $value: "#445566"
`,
			);
			const result = await runWave(
				['token', 'build', '-f', profilePath, '--output', outputDir],
				dir,
			);
			expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
			expect(
				await Bun.file(path.join(outputDir, 'cli-source-mobile.json')).exists(),
			).toBe(true);
			expect(result.stdout).toContain('cli-source-mobile.json');
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('build rejects --profiles all when -f selects a profile source', async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-token-profile-all-'),
		);
		const profileDir = path.join(dir, 'custom');
		await fs.mkdir(profileDir, { recursive: true });
		const profilePath = path.join(profileDir, 'mobile.yaml');
		try {
			await fs.writeFile(
				path.join(dir, 'main.yaml'),
				'$id: cli-source-base\n$config:\n  theme: cli-source\ntheme: {}\n',
			);
			await fs.writeFile(
				profilePath,
				'$config:\n  base: cli-source-base\ntheme: {}\n',
			);
			const result = await runWave(
				['token', 'build', '-f', profilePath, '--profiles', 'all'],
				dir,
			);
			expect(result.exitCode).toBe(5);
			expect(`${result.stdout}\n${result.stderr}`).toContain(
				'--profiles all requires a main.yaml',
			);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

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
