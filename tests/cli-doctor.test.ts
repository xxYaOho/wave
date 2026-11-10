import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(
	args: string[],
	cwd = rootDir,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { exitCode, stdout, stderr };
}

describe('wave doctor', () => {
	test('token doctor and wcag consume an explicitly selected profile source', async () => {
		const profilePath = path.join(
			rootDir,
			'tests/fixtures/themes/profile-model/profiles/mobile.yaml',
		);
		const doctor = await runWave([
			'token',
			'doctor',
			'--json',
			'-f',
			profilePath,
		]);
		expect(doctor.exitCode).toBe(0);
		expect(doctor.stdout).toContain('profiles/mobile.yaml');

		const wcag = await runWave(['token', 'wcag', '-f', profilePath]);
		expect(wcag.exitCode).toBe(0);
		expect(wcag.stdout).toContain('profile-model-mobile');
	});

	test('top-level doctor runs toolchain diagnostics without main.yaml', async () => {
		const { exitCode, stdout } = await runWave(['doctor']);
		expect(exitCode).toBe(0);
		expect(stdout).toContain('PASS PNG safe compression');
		expect(stdout).toContain('PASS APNG encoding');
	});

	test('top-level doctor JSON runs without main.yaml', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-json-'));
		try {
			const result = await runWave(['doctor', '--json'], dir);
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout)).toHaveProperty('checks');
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('top-level status and verbose remain toolchain-only without main.yaml', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-tools-'));
		try {
			const status = await runWave(['doctor', '--status'], dir);
			const verbose = await runWave(['doctor', '--verbose'], dir);
			expect(status.exitCode).toBe(0);
			expect(status.stdout).toContain('toolchain: ok');
			expect(verbose.exitCode).toBe(0);
			expect(verbose.stdout).toContain('PASS PNG safe compression');
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('token doctor JSON requires main.yaml', async () => {
		const dir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-dt-doctor-json-'),
		);
		try {
			const result = await runWave(['token', 'doctor', '--json'], dir);
			expect(result.exitCode).toBe(10);
			expect(`${result.stdout}\n${result.stderr}`).toContain(
				path.join(dir, 'main.yaml'),
			);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('token wcag with pass fixture exits 0 and shows green scores', async () => {
		const { exitCode, stdout } = await runWave([
			'token',
			'wcag',
			'--file',
			'tests/fixtures/themes/doctor-contrast-pass/main.yaml',
		]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain('Contrast Check');
		expect(stdout).toContain('doctor-contrast-pass');
		expect(stdout).toContain('primary-main');
		expect(stdout).toContain('🟢 Normal Text   (AAA)');
		expect(stdout).toContain('🟢 Large Text    (AAA)');
		expect(stdout).toContain('🟢 UI Components (AA)');
		expect(stdout).not.toContain('🔴');
	});

	test('token wcag with report fixture exits 0 and shows red scores', async () => {
		const { exitCode, stdout } = await runWave([
			'token',
			'wcag',
			'--file',
			'tests/fixtures/themes/doctor-contrast-report/main.yaml',
		]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain('Contrast Check');
		expect(stdout).toContain('doctor-contrast-report');
		expect(stdout).toContain('🔴 Normal Text');
		expect(stdout).toContain('🔴 Large Text');
		expect(stdout).toContain('🔴 UI Components');
	});

	test('token wcag with invalid fixture exits non-zero', async () => {
		const { exitCode, stdout } = await runWave([
			'token',
			'wcag',
			'--file',
			'tests/fixtures/themes/doctor-contrast-invalid/main.yaml',
		]);
		expect(exitCode).not.toBe(0);
		expect(stdout).toContain('✗');
	});

	test('token wcag with empty fixture exits 0 and indicates no pairs', async () => {
		const { exitCode, stdout } = await runWave([
			'token',
			'wcag',
			'--file',
			'tests/fixtures/themes/doctor-contrast-empty/main.yaml',
		]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain('No wcagPairs found to evaluate');
	});

	test('token doctor validates explicit --file before status, verbose, or JSON rendering', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-file-'));
		const rejectedPath = path.join(dir, 'themefile');
		await fs.writeFile(rejectedPath, 'THEME legacy\n');
		try {
			for (const renderer of [
				['--status'],
				['--verbose'],
				['--json'],
			] as const) {
				const result = await runWave([
					'token',
					'doctor',
					...renderer,
					'--file',
					rejectedPath,
				]);
				const message = `${result.stdout}\n${result.stderr}`;
				expect(result.exitCode).toBe(5);
				expect(message).toContain(rejectedPath);
				expect(message).toContain('main.yaml');
				expect(message).toContain('wave token new');
			}
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('token doctor rejects every forbidden workspace entry in JSON mode', async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-doctor-reject-'));
		const profilesDir = path.join(dir, 'profiles');
		const directory = path.join(dir, 'nested', 'main.yaml');
		const marker = path.join(dir, 'existing-output.txt');
		await fs.mkdir(profilesDir);
		await fs.mkdir(directory, { recursive: true });
		const rejectedEntries = [
			{ path: path.join(dir, 'themefile'), exitCode: 5 },
			{ path: directory, exitCode: 5 },
			{ path: path.join(dir, 'palette.yaml'), exitCode: 5 },
			{ path: path.join(profilesDir, 'mobile.yaml'), exitCode: 5 },
			{ path: path.join(dir, 'main@night.yaml'), exitCode: 5 },
			{ path: path.join(dir, 'tokens.yaml'), exitCode: 5 },
			{ path: path.join(dir, 'missing/main.yaml'), exitCode: 10 },
		];
		await fs.writeFile(rejectedEntries[0]!.path, 'THEME legacy\n');
		for (const { path: filePath } of rejectedEntries.slice(2, -1)) {
			await fs.writeFile(filePath, '$config:\n  theme: rejected\ntheme: {}\n');
		}
		await fs.writeFile(marker, 'preserve-me');

		try {
			for (const entry of rejectedEntries) {
				const result = await runWave(
					['token', 'doctor', '--json', '--file', entry.path],
					dir,
				);
				const message = `${result.stdout}\n${result.stderr}`;
				expect(result.exitCode, entry.path).toBe(entry.exitCode);
				expect(message, entry.path).toContain(entry.path);
				expect(message, entry.path).toContain('main.yaml');
				expect(message, entry.path).toContain('wave token new');
				expect(await fs.readFile(marker, 'utf8')).toBe('preserve-me');
			}
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('doctor scopes reject cross-domain options with replacement commands', async () => {
		const topLevel = await runWave(['doctor', '--contrast']);
		expect(topLevel.exitCode).not.toBe(0);
		expect(`${topLevel.stdout}\n${topLevel.stderr}`).toContain(
			'wave token wcag --night',
		);

		const token = await runWave(['token', 'doctor', '--night']);
		expect(token.exitCode).not.toBe(0);
		expect(`${token.stdout}\n${token.stderr}`).toContain(
			'wave token wcag --night',
		);
	});
});
