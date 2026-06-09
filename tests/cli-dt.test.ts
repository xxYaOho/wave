import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(
	args: string[],
	cwd = rootDir,
	env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd,
		env: { ...process.env, ...env },
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

	test('dt build writes variants for every parameter group pass', async () => {
		const fixtureDir = path.join(
			rootDir,
			'tests/fixtures/themes/config-group-variants',
		);
		const outputDir = path.join(fixtureDir, 'theme');

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode, stdout } = await runWave(
			['dt', 'build', '--variants', 'dark'],
			fixtureDir,
		);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('config-group-variants.css');
		expect(stdout).toContain('config-group-variants-night.css');
		expect(stdout).toContain('config-group-variants-dark.css');
		expect(
			await Bun.file(
				path.join(outputDir, 'css', 'config-group-variants.css'),
			).exists(),
		).toBe(true);
		expect(
			await Bun.file(
				path.join(outputDir, 'sketch', 'config-group-variants2sketch.json'),
			).exists(),
		).toBe(true);
		expect(
			await Bun.file(
				path.join(outputDir, 'css', 'config-group-variants-night.css'),
			).exists(),
		).toBe(true);
		expect(
			await Bun.file(
				path.join(
					outputDir,
					'sketch',
					'config-group-variants-night2sketch.json',
				),
			).exists(),
		).toBe(true);
		expect(
			await Bun.file(
				path.join(outputDir, 'css', 'config-group-variants-dark.css'),
			).exists(),
		).toBe(true);
		expect(
			await Bun.file(
				path.join(
					outputDir,
					'sketch',
					'config-group-variants-dark2sketch.json',
				),
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
			expect(await Bun.file(path.join(tempDir, 'manual.md')).exists()).toBe(
				false,
			);
			expect(stdout).toContain('See MANUAL.md for detailed usage');
			expect(stdout).toContain('Run "wave dt" to generate tokens');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('dt show lists built-in design-token resources', async () => {
		const { exitCode, stdout } = await runWave(['dt', 'show']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Palettes:');
		expect(stdout).toContain('Dimensions:');
		expect(stdout).toContain('tailwindcss');
		expect(stdout).toContain('wave');
	});

	test('dt update help documents public options without running update', async () => {
		const { exitCode, stdout, stderr } = await runWave([
			'dt',
			'update',
			'--help',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Design Token Resource Update');
		expect(stdout).toContain('wave dt update [name] [options]');
		expect(stdout).toContain('--version <version>');
		expect(stdout).not.toContain('--tailwind-version');
		expect(stderr).toBe('');
	});

	test('dt update tailwindcss --version 3 writes cache and state', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const env = {
				HOME: tempHome,
				WAVE_TAILWIND_FIXTURE_DIR: path.join(
					rootDir,
					'tests/fixtures/resources',
				),
			};
			const result = await runWave(
				['dt', 'update', 'tailwindcss', '--version', '3'],
				rootDir,
				env,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Updated tailwindcss 3.4.17 (v3)');

			const cachePath = path.join(
				tempHome,
				'.cache/wave/resources/tailwindcss.yaml',
			);
			const statePath = path.join(
				tempHome,
				'.local/state/wave/resources/state.json',
			);
			expect(await Bun.file(cachePath).exists()).toBe(true);
			expect(await Bun.file(statePath).exists()).toBe(true);
			const cache = await fs.readFile(cachePath, 'utf-8');
			expect(cache).toContain('tailwindcss:');
			expect(cache).toContain('#ef4444');
			const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
			expect(state.tailwindcss).toMatchObject({
				updatedBefore: true,
				requestedVersion: '3',
				resolvedVersion: '3.4.17',
				activeMajor: 3,
			});
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('dt update tailwindcss --version 4 writes OKLCH cache', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const result = await runWave(
				['dt', 'update', 'tailwindcss', '--version', '4'],
				rootDir,
				{
					HOME: tempHome,
					WAVE_TAILWIND_FIXTURE_DIR: path.join(
						rootDir,
						'tests/fixtures/resources',
					),
				},
			);

			expect(result.exitCode).toBe(0);
			const cache = await fs.readFile(
				path.join(tempHome, '.cache/wave/resources/tailwindcss.yaml'),
				'utf-8',
			);
			expect(cache).toContain('colorSpace: oklch');
			expect(cache).toContain('components:');
			expect(cache).toContain('- 0.936');
			expect(cache).toContain('- 0.808');
			expect(cache).toContain('- 0.704');
			expect(cache).not.toMatch(/999999|0000001/);
			expect(cache).toContain('#000');
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('dt update leonardo writes light and dark generated resources', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const configDir = path.join(tempHome, '.config/wave/resources');
			await fs.mkdir(configDir, { recursive: true });
			await fs.writeFile(
				path.join(configDir, 'leonardo.yaml'),
				'colors:\n  brand: "#3366ff"\nratios:\n  values: [1, 2, 3]\n',
				'utf-8',
			);

			const result = await runWave(['dt', 'update', 'leonardo'], rootDir, {
				HOME: tempHome,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Updated leonardo (user recipe)');
			expect(
				await Bun.file(
					path.join(tempHome, '.cache/wave/resources/leonardo-light.yaml'),
				).exists(),
			).toBe(true);
			expect(
				await Bun.file(
					path.join(tempHome, '.cache/wave/resources/leonardo-dark.yaml'),
				).exists(),
			).toBe(true);
			const light = await fs.readFile(
				path.join(tempHome, '.cache/wave/resources/leonardo-light.yaml'),
				'utf-8',
			);
			expect(light).toContain('leonardo-light:');
			expect(light).toContain('brand:');
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('dt status shows cache and state locations', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const result = await runWave(['dt', 'status'], rootDir, {
				HOME: tempHome,
			});
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Wave Resource Status');
			expect(result.stdout).toContain('.cache/wave/resources');
			expect(result.stdout).toContain('tailwindcss');
			expect(result.stdout).toContain('leonardo');
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});
});
