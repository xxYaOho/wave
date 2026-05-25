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

describe('wave dt', () => {
	test('top-level help shows actionable command overview', async () => {
		const bare = await runWave([]);
		const help = await runWave(['-h']);

		for (const result of [bare, help]) {
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Wave CLI');
			expect(result.stdout).toContain('wave <command> [options]');
			expect(result.stdout).toContain(
				'design-token   Build and inspect design tokens',
			);
			expect(result.stdout).toContain('dt             Alias of design-token');
			expect(result.stdout).toContain('wave <command> --help');
			expect(result.stdout).not.toContain('--no-night');
			expect(result.stdout).not.toContain('--variant');
		}
	});

	test('dt help shows design-token module help instead of build help', async () => {
		const { exitCode, stdout } = await runWave(['dt', '--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Design Token');
		expect(stdout).toContain('Usage:');
		expect(stdout).toContain('wave dt [options]');
		expect(stdout).toContain('build           Build design token output');
		expect(stdout).toContain('wcag            Check color contrast');
		expect(stdout).toContain('-f, --file <path>    main.yaml path');
		expect(stdout).not.toContain('Usage: wave dt build');
	});

	test('design-token help matches dt module help', async () => {
		const dt = await runWave(['dt', '--help']);
		const designToken = await runWave(['design-token', '--help']);

		expect(designToken.exitCode).toBe(0);
		expect(designToken.stdout).toBe(dt.stdout);
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

	test('design-token without subcommand defaults to build', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		const outputDir = path.join(rootDir, '.temp-test-design-token-build');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode } = await runWave([
			'design-token',
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

	test('dt build accepts main.yaml with $config as the design-token entry', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/config-main');
		const outputDir = path.join(fixtureDir, 'theme');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode, stdout } = await runWave([
			'dt',
			'build',
			path.join(fixtureDir, 'main.yaml'),
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('config-main.css');
		expect(stdout).toContain('config-main2sketch.json');
		expect(
			await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
		).toBe(true);
		expect(
			await Bun.file(path.join(outputDir, 'config-main2sketch.json')).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('dt without explicit input defaults to current directory main.yaml', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/config-main');
		const outputDir = path.join(fixtureDir, 'theme');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode, stdout } = await runWave(['dt'], fixtureDir);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('config-main.css');
		expect(stdout).not.toContain('No themefile found');
		expect(
			await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('dt accepts positional and -f main.yaml inputs', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/config-main');
		const outputDir = path.join(fixtureDir, 'theme');
		const mainYaml = path.join(fixtureDir, 'main.yaml');

		await fs.rm(outputDir, { recursive: true, force: true });

		const positional = await runWave(['dt', mainYaml]);
		expect(positional.exitCode).toBe(0);
		expect(
			await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });

		const fileFlag = await runWave(['dt', '-f', mainYaml]);
		expect(fileFlag.exitCode).toBe(0);
		expect(
			await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('dt supports repeatable --variant alias for selected variants', async () => {
		const fixtureDir = path.join(
			rootDir,
			'tests/fixtures/baseline-independent',
		);
		const outputDir = path.join(rootDir, '.temp-test-dt-variant-alias');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode } = await runWave([
			'dt',
			'-f',
			path.join(fixtureDir, 'themefile'),
			'-o',
			outputDir,
			'--variant',
			'dark',
		]);

		expect(exitCode).toBe(0);
		expect(
			await Bun.file(
				path.join(outputDir, 'baseline-independent-dark.json'),
			).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('dt build main.yaml fails clearly when $config is missing', async () => {
		const fixtureDir = path.join(
			rootDir,
			'tests/fixtures/themes/config-main-missing',
		);

		const { exitCode, stdout } = await runWave([
			'dt',
			'build',
			path.join(fixtureDir, 'main.yaml'),
		]);

		expect(exitCode).toBe(12);
		expect(stdout).toContain('Missing required $config in main.yaml entry');
		expect(stdout).not.toContain('themefile load');
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
