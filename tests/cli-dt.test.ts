import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { SketchPayloadV2 } from '../src/types/index.ts';

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

function isolatedResourceEnv(tempDir: string): Record<string, string> {
	return {
		WAVE_RESOURCE_CACHE_DIR: path.join(tempDir, '.wave-cache'),
		WAVE_RESOURCE_STATE_PATH: path.join(tempDir, '.wave-state.json'),
		WAVE_RESOURCE_CONFIG_DIR: path.join(tempDir, '.wave-config'),
	};
}

async function makeRejectedWorkspace(): Promise<{
	dir: string;
	paths: Record<string, string>;
}> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-rejected-entry-'));
	const profilesDir = path.join(dir, 'profiles');
	await fs.mkdir(profilesDir);
	const paths = {
		themefile: path.join(dir, 'themefile'),
		directory: path.join(dir, 'nested', 'main.yaml'),
		resource: path.join(dir, 'palette.yaml'),
		profile: path.join(profilesDir, 'mobile.yaml'),
		night: path.join(dir, 'main@night.yaml'),
		arbitrary: path.join(dir, 'tokens.yaml'),
	};
	await fs.writeFile(paths.themefile, 'THEME legacy\n');
	await fs.mkdir(paths.directory, { recursive: true });
	for (const filePath of [
		paths.resource,
		paths.profile,
		paths.night,
		paths.arbitrary,
	]) {
		await fs.writeFile(filePath, '$config:\n  theme: rejected\ntheme: {}\n');
	}
	return { dir, paths };
}

async function copyFixtureWorkspace(
	relativePath: string,
): Promise<{ dir: string; env: Record<string, string> }> {
	const sourceDir = path.join(rootDir, relativePath);
	const workspaceDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-fixture-'),
	);
	await fs.cp(sourceDir, workspaceDir, {
		recursive: true,
		filter: (source) => {
			const name = path.basename(source);
			return !['.DS_Store', '.tmp', 'theme', 'dist', 'build'].includes(name);
		},
	});
	const mainPath = path.join(workspaceDir, 'main.yaml');
	if (await Bun.file(mainPath).exists()) {
		const document = yaml.load(await fs.readFile(mainPath, 'utf8')) as {
			$config?: { parameter?: Record<string, unknown> };
		};
		if (document.$config?.parameter) {
			delete document.$config.parameter.night;
			await fs.writeFile(mainPath, yaml.dump(document, { lineWidth: -1 }));
		}
	}
	return { dir: workspaceDir, env: isolatedResourceEnv(workspaceDir) };
}

describe('wave token', () => {
	test('legacy token aliases and top-level creation commands are rejected', async () => {
		for (const command of ['dt', 'design-token', 'create', 'init', 'show']) {
			const result = await runWave([command]);
			expect(result.exitCode).not.toBe(0);
			expect(`${result.stdout}\n${result.stderr}`).toContain(
				`unknown command '${command}'`,
			);
		}
		const show = await runWave(['token', 'show']);
		expect(show.exitCode).toBe(0);
		expect(show.stdout).toContain('Palettes:');
	});

	test('token keeps default and explicit actions while legacy aliases fail', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/standard',
		);
		const doctorMain = path.join(
			rootDir,
			'tests/fixtures/themes/doctor-contrast-pass/main.yaml',
		);
		const profileFile = path.join(
			rootDir,
			'tests/fixtures/themes/profile-model/profiles/mobile.yaml',
		);

		try {
			const defaultBuild = await runWave(['token'], fixture.dir, fixture.env);
			expect(defaultBuild.exitCode).toBe(0);
			expect(defaultBuild.stdout).toContain('test-standard.json');

			const explicitBuild = await runWave(
				['token', 'build', '-f', path.join(fixture.dir, 'main.yaml')],
				rootDir,
				fixture.env,
			);
			expect(explicitBuild.exitCode).toBe(0);
			expect(explicitBuild.stdout).toContain('test-standard.json');

			const doctor = await runWave(
				['token', 'doctor', '--json', '-f', doctorMain],
				rootDir,
				fixture.env,
			);
			expect(doctor.exitCode).toBe(0);
			expect(doctor.stdout).toContain('"ok": true');

			const wcag = await runWave(
				['token', 'wcag', '-f', profileFile],
				rootDir,
				fixture.env,
			);
			expect(wcag.exitCode).toBe(0);
			expect(wcag.stdout).toContain('profile-model-mobile');

			for (const alias of ['dt', 'design-token']) {
				const result = await runWave([alias, 'build']);
				expect(result.exitCode, alias).not.toBe(0);
				expect(`${result.stdout}\n${result.stderr}`, alias).toContain(
					`unknown command '${alias}'`,
				);
			}
		} finally {
			await fs.rm(fixture.dir, { recursive: true, force: true });
		}
	});

	test('token build applies the complete main-only rejection matrix without touching artifacts', async () => {
		const fixture = await makeRejectedWorkspace();
		const outputDir = path.join(fixture.dir, 'dist');
		const marker = path.join(outputDir, 'existing.txt');
		await fs.mkdir(outputDir);
		await fs.writeFile(marker, 'preserve-me');

		try {
			const cases: Array<{
				name: string;
				args: string[];
				rejectedPath: string;
				exitCode: number;
			}> = [
				{
					name: 'cwd without main',
					args: ['token', 'build', '--output', outputDir],
					rejectedPath: path.join(fixture.dir, 'main.yaml'),
					exitCode: 10,
				},
				{
					name: 'explicit missing main',
					args: [
						'token',
						'build',
						'-f',
						path.join(fixture.dir, 'missing/main.yaml'),
						'--output',
						outputDir,
					],
					rejectedPath: path.join(fixture.dir, 'missing/main.yaml'),
					exitCode: 10,
				},
				...Object.entries(fixture.paths).map(([name, rejectedPath]) => ({
					name,
					args: ['token', 'build', '-f', rejectedPath, '--output', outputDir],
					rejectedPath,
					exitCode: 5,
				})),
			];

			for (const entry of cases) {
				const result = await runWave(entry.args, fixture.dir);
				const message = `${result.stdout}\n${result.stderr}`;
				expect(result.exitCode, entry.name).toBe(entry.exitCode);
				expect(message, entry.name).toContain(entry.rejectedPath);
				expect(message, entry.name).toContain('main.yaml');
				expect(message, entry.name).toContain('wave token new');
				expect(await fs.readFile(marker, 'utf8'), entry.name).toBe(
					'preserve-me',
				);
			}

			const validMain = path.join(
				rootDir,
				'tests/fixtures/themes/standard/main.yaml',
			);
			const conflict = await runWave(
				['token', 'build', validMain, '-f', validMain, '--output', outputDir],
				fixture.dir,
			);
			const conflictMessage = `${conflict.stdout}\n${conflict.stderr}`;
			expect(conflict.exitCode).not.toBe(0);
			expect(conflictMessage).toContain('too many arguments');
			expect(await fs.readFile(marker, 'utf8')).toBe('preserve-me');
		} finally {
			await fs.rm(fixture.dir, { recursive: true, force: true });
		}
	});
	test('top-level help shows actionable command overview', async () => {
		const help = await runWave(['--help']);

		for (const result of [help]) {
			expect(result.stdout).toContain('Wave CLI');
			expect(result.stdout).toContain('wave <command> [options]');
			expect(result.stdout).toContain(
				'token              Build and maintain design tokens',
			);
			expect(result.stdout).toContain('wave <command> --help');
			expect(result.stdout).not.toContain('--no-night');
			expect(result.stdout).not.toContain('--variant');
			expect(result.stdout).not.toContain('design-token');
		}
	});

	test('token help shows module help instead of build help', async () => {
		const { exitCode, stdout } = await runWave(['token', '--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Token');
		expect(stdout).toContain('Usage:');
		expect(stdout).toContain('wave token [options]');
		expect(stdout).toContain(
			'build               Build design token output (default)',
		);
		expect(stdout).toContain('wcag                Check color contrast');
		expect(stdout).toContain('-f, --file <path>');
		expect(stdout).toContain('-o, --output <path>');
		expect(stdout).not.toContain('Usage: wave token build');
		expect(stdout).not.toContain('--profile');
		expect(stdout).not.toContain('--platform');
	});

	test('token build help exposes supported profile mode and removes legacy options', async () => {
		const result = await runWave(['token', 'build', '--help']);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('--profiles <mode>');
		expect(result.stdout).toContain('--night');
		expect(result.stdout).toContain('-f, --file <path>');
		expect(result.stdout).toContain('-o, --output <path>');
		expect(result.stdout).not.toContain('--profile <name>');
		expect(result.stdout).not.toContain('--platform');
		expect(result.stdout).not.toContain('--variant');
		expect(result.stdout).not.toContain('--variants');
		expect(result.stdout).not.toContain('--no-variants');
		expect(result.stdout).not.toContain('--no-night');
	});

	test('token build rejects removed variant and output flags', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		for (const removedFlag of ['--variant', '--platform', '--out']) {
			const result = await runWave([
				'token',
				'build',
				'-f',
				path.join(fixtureDir, 'main.yaml'),
				removedFlag,
				removedFlag === '--variant' ? 'dark' : 'json',
			]);

			expect(result.exitCode, removedFlag).not.toBe(0);
			expect(`${result.stdout}\n${result.stderr}`, removedFlag).toContain(
				'unknown option',
			);
		}
	});

	test('token build uses the platform declared in main.yaml', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/md-yml-orca',
		);
		const dir = fixture.dir;
		const outputDir = path.join(dir, 'out');
		try {
			const result = await runWave(
				[
					'token',
					'build',
					'-f',
					path.join(dir, 'main.yaml'),
					'--output',
					outputDir,
				],
				dir,
				fixture.env,
			);
			expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
			expect(await fs.readdir(outputDir)).toEqual(['orca-doc2md.yml']);
			const payload = yaml.load(
				await fs.readFile(path.join(outputDir, 'orca-doc2md.yml'), 'utf8'),
			);
			expect(payload).toMatchObject({
				color: { 'primary-main': '#1a72f0' },
			});
			expect(
				await Bun.file(path.join(dir, 'css', 'orca-doc.css')).exists(),
			).toBe(false);
			expect(
				await Bun.file(
					path.join(dir, 'sketch', 'orca-doc2sketch.json'),
				).exists(),
			).toBe(false);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('token build no longer auto-discovers variants directory', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/config-group-variants',
		);
		const fixtureDir = fixture.dir;
		const outputDir = path.join(fixtureDir, 'theme');

		try {
			const { exitCode, stdout } = await runWave(
				['token', 'build'],
				fixtureDir,
				fixture.env,
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('config-group-variants.css');
			expect(stdout).not.toContain('config-group-variants-dark.css');
			expect(
				await Bun.file(
					path.join(outputDir, 'css', 'config-group-variants.css'),
				).exists(),
			).toBe(true);
			expect(
				await Bun.file(
					path.join(outputDir, 'css', 'config-group-variants-dark.css'),
				).exists(),
			).toBe(false);
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token build selects a profile by -f and skips invalid profile night without failing', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/profile-model',
		);
		const fixtureDir = fixture.dir;
		try {
			const { exitCode, stdout } = await runWave(
				[
					'token',
					'build',
					'--night',
					'-f',
					path.join(fixtureDir, 'profiles', 'mobile.yaml'),
				],
				rootDir,
				fixture.env,
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('Night Mode unavailable/invalid and skipped');
			expect(stdout).toContain('profile-model-mobile.json');
			expect(stdout).not.toContain('profile-model-mobile-night.json');
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token wcag selects a profile directly through -f', async () => {
		const fixture = path.join(
			rootDir,
			'tests/fixtures/themes/profile-model/profiles/mobile.yaml',
		);
		const { exitCode, stdout, stderr } = await runWave([
			'token',
			'wcag',
			'-f',
			fixture,
		]);

		expect(`${stdout}\n${stderr}`).not.toContain('unknown option');
		expect(exitCode).toBe(0);
		expect(stdout).toContain('profile-model-mobile');
		expect(stdout).toContain('primary');
		expect(stdout).toMatch(/\d+\.\d{2}:1/);
	});

	test('token wcag applies the same forbidden workspace entry matrix', async () => {
		const fixture = await makeRejectedWorkspace();
		const marker = path.join(fixture.dir, 'existing-output.txt');
		await fs.writeFile(marker, 'preserve-me');

		try {
			const cases = [
				...Object.values(fixture.paths).map((rejectedPath) => ({
					rejectedPath,
					exitCode: 5,
				})),
				{
					rejectedPath: path.join(fixture.dir, 'missing/main.yaml'),
					exitCode: 10,
				},
			];
			for (const { rejectedPath, exitCode } of cases) {
				const result = await runWave(
					['token', 'wcag', '-f', rejectedPath],
					fixture.dir,
				);
				const message = `${result.stdout}\n${result.stderr}`;
				expect(result.exitCode, rejectedPath).toBe(exitCode);
				expect(message, rejectedPath).toContain(rejectedPath);
				expect(message, rejectedPath).toContain('main.yaml');
				expect(message, rejectedPath).toContain('wave token new');
				expect(await fs.readFile(marker, 'utf8')).toBe('preserve-me');
			}
		} finally {
			await fs.rm(fixture.dir, { recursive: true, force: true });
		}
	});

	test('token doctor rejects WCAG and variant options', async () => {
		const result = await runWave([
			'token',
			'doctor',
			'--contrast',
			'--variants',
			'dark',
			'-f',
			'tests/fixtures/themes/profile-model/main.yaml',
		]);

		expect(result.exitCode).not.toBe(0);
		expect(`${result.stdout}\n${result.stderr}`).toContain(
			'Invalid token doctor option',
		);
	});

	test('token doctor reports dimension migration guidance', async () => {
		const { exitCode, stdout } = await runWave([
			'token',
			'doctor',
			'-f',
			'tests/fixtures/themes/standard/main.yaml',
		]);

		expect(exitCode).not.toBe(0);
		expect(stdout).toContain(
			'theme.dimension is no longer a public output root',
		);
		expect(stdout).toContain('theme.dimension.alpha');
		expect(stdout).not.toContain('theme.dimension.$type');
		expect(stdout).toContain('theme.dimension.interaction.* -> theme.state.*');
	});

	test('token subcommand help renders without running subcommand actions', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-token-help-'),
		);

		try {
			const removedInit = await runWave(['init'], tempDir);
			const init = await runWave(['token', 'init'], tempDir);
			const newCommand = await runWave(['token', 'new', '--help'], tempDir);
			const build = await runWave(['token', 'build', '--help'], tempDir);
			const status = await runWave(['token', 'status', '--help'], tempDir);
			const wcag = await runWave(['token', 'wcag', '--help'], tempDir);

			expect(removedInit.exitCode).not.toBe(0);
			expect(`${removedInit.stdout}\n${removedInit.stderr}`).toContain(
				"unknown command 'init'",
			);
			expect(init.exitCode).not.toBe(0);
			expect(`${init.stdout}\n${init.stderr}`).toContain('too many arguments');
			expect(newCommand.exitCode).toBe(0);
			expect(newCommand.stdout).toContain('wave token new [options]');
			expect(newCommand.stdout).not.toContain('Theme template initialized');
			expect(await Bun.file(path.join(tempDir, 'themefile')).exists()).toBe(
				false,
			);
			expect(await Bun.file(path.join(tempDir, 'main.yaml')).exists()).toBe(
				false,
			);

			await fs.writeFile(
				path.join(tempDir, 'main.yaml'),
				'theme:\n  color:\n    $type: color\n    primary:\n      $value: "#0066cc"\n',
				'utf-8',
			);
			const unknown = await runWave(['token', 'unknown'], tempDir);

			expect(unknown.exitCode).not.toBe(0);
			expect(`${unknown.stdout}\n${unknown.stderr}`).toContain(
				'too many arguments',
			);

			expect(build.exitCode).toBe(0);
			expect(build.stdout).toContain('Usage: wave token build');
			expect(build.stderr).not.toContain('No main.yaml found');

			expect(status.exitCode).toBe(0);
			expect(status.stdout).toContain('Usage: wave token status');
			expect(status.stdout).not.toContain('Wave Resource Status');

			expect(wcag.exitCode).toBe(0);
			expect(wcag.stdout).toContain('Usage: wave token wcag');
			expect(wcag.stdout).not.toContain('File not found');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('token build generates design token output through the module entry', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		const outputDir = path.join(rootDir, '.temp-test-dt-build');
		const env = isolatedResourceEnv(outputDir);

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode } = await runWave(
			[
				'token',
				'build',
				'-f',
				path.join(fixtureDir, 'main.yaml'),
				'--output',
				outputDir,
			],
			rootDir,
			env,
		);

		expect(exitCode).toBe(0);

		const output = JSON.parse(
			await fs.readFile(path.join(outputDir, 'test-standard.json'), 'utf-8'),
		);
		expect(output['theme-color-primary']).toBeDefined();

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('token build accepts DTCG color object with referenced color and alpha', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-dtcg-color-'),
		);
		const outputDir = path.join(tempDir, 'dist');

		try {
			await fs.writeFile(
				path.join(tempDir, 'main.yaml'),
				[
					'$config:',
					'  theme: dtcg-color-object',
					'  resource:',
					'    palette: tailwindcss',
					'    dimension: wave',
					'  parameter:',
					'    platform: [json]',
					'    colorSpace: hex',
					'theme:',
					'  color:',
					'    inverse:',
					'      surface:',
					'        $description: 反色背景(通常是深色), 比如 Snackbar, Toast',
					'        $value:',
					'          color: "{tailwindcss.color.slate.900}"',
					'          alpha: "{wave.dimension.alpha.800}"',
					'',
				].join('\n'),
			);

			const { exitCode, stderr } = await runWave(
				[
					'token',
					'build',
					'-f',
					path.join(tempDir, 'main.yaml'),
					'--output',
					outputDir,
				],
				rootDir,
				isolatedResourceEnv(tempDir),
			);

			expect(stderr).not.toContain('Theme schema validation failed');
			expect(exitCode).toBe(0);

			const output = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'dtcg-color-object.json'),
					'utf-8',
				),
			);
			expect(output['theme-color-inverse-surface']).toMatch(/^#[0-9a-f]{8}$/i);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('token without subcommand defaults to build', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		const outputDir = path.join(rootDir, '.temp-test-dt-default-build');
		const env = isolatedResourceEnv(outputDir);

		await fs.rm(outputDir, { recursive: true, force: true });

		const { exitCode } = await runWave(
			[
				'token',
				'-f',
				path.join(fixtureDir, 'main.yaml'),
				'--output',
				outputDir,
			],
			rootDir,
			env,
		);

		expect(exitCode).toBe(0);
		expect(
			await Bun.file(path.join(outputDir, 'test-standard.json')).exists(),
		).toBe(true);

		await fs.rm(outputDir, { recursive: true, force: true });
	});

	test('design-token is rejected as a removed legacy alias', async () => {
		const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/standard');
		const result = await runWave([
			'design-token',
			'-f',
			path.join(fixtureDir, 'main.yaml'),
		]);
		expect(result.exitCode).not.toBe(0);
		expect(`${result.stdout}\n${result.stderr}`).toContain(
			"unknown command 'design-token'",
		);
	});

	test('token build accepts main.yaml with $config as the design-token entry', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/config-main',
		);
		const fixtureDir = fixture.dir;
		const outputDir = path.join(fixtureDir, 'theme');

		try {
			const { exitCode, stdout } = await runWave(
				['token', 'build', '-f', path.join(fixtureDir, 'main.yaml')],
				rootDir,
				fixture.env,
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('config-main.css');
			expect(stdout).toContain('config-main2sketch.json');
			expect(
				await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
			).toBe(true);
			expect(
				await Bun.file(
					path.join(outputDir, 'config-main2sketch.json'),
				).exists(),
			).toBe(true);
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token without explicit input defaults to current directory main.yaml', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/config-main',
		);
		const fixtureDir = fixture.dir;
		const outputDir = path.join(fixtureDir, 'theme');

		try {
			const { exitCode, stdout } = await runWave(
				['token'],
				fixtureDir,
				fixture.env,
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('config-main.css');
			expect(stdout).not.toContain('No themefile found');
			expect(
				await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
			).toBe(true);
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token build accepts -f main.yaml and rejects positional input', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/config-main',
		);
		const fixtureDir = fixture.dir;
		const outputDir = path.join(fixtureDir, 'theme');
		const mainYaml = path.join(fixtureDir, 'main.yaml');

		try {
			const fileFlag = await runWave(
				['token', 'build', '-f', mainYaml],
				rootDir,
				fixture.env,
			);
			expect(fileFlag.exitCode).toBe(0);
			expect(
				await Bun.file(path.join(outputDir, 'config-main.css')).exists(),
			).toBe(true);

			await fs.rm(outputDir, { recursive: true, force: true });

			const positional = await runWave(
				['token', 'build', mainYaml],
				rootDir,
				fixture.env,
			);
			expect(positional.exitCode).not.toBe(0);
			expect(`${positional.stderr}\n${positional.stdout}`).toContain(
				'too many arguments',
			);
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token --ids sugar is rejected', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/config-main',
		);
		const fixtureDir = fixture.dir;
		const mainYaml = path.join(fixtureDir, 'main.yaml');
		try {
			const { exitCode, stdout, stderr } = await runWave(
				['token', '-f', mainYaml, '--ids'],
				rootDir,
				fixture.env,
			);
			expect(exitCode).not.toBe(0);
			expect(`${stdout}\n${stderr}`).toContain("unknown option '--ids'");
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token --build sugar is rejected', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/config-main',
		);
		const fixtureDir = fixture.dir;
		const mainYaml = path.join(fixtureDir, 'main.yaml');
		try {
			const result = await runWave(
				['token', '-f', mainYaml, '--build'],
				rootDir,
				fixture.env,
			);
			expect(result.exitCode).not.toBe(0);
			expect(`${result.stdout}\n${result.stderr}`).toContain(
				"unknown option '--build'",
			);
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token build emits sketch extension path and property mappings', async () => {
		const fixture = await copyFixtureWorkspace(
			'tests/fixtures/themes/sketch-extensions',
		);
		const fixtureDir = fixture.dir;
		const outputDir = path.join(fixtureDir, 'theme');

		try {
			const { exitCode, stdout } = await runWave(
				['token', 'build'],
				fixtureDir,
				fixture.env,
			);

			expect(exitCode).toBe(0);
			expect(stdout).toContain('RESOURCES');
			expect(stdout).toContain('tailwindcss');
			expect(stdout).toContain('dimension');
			expect(stdout).toContain('sketch-extensions2sketch.json');
			expect(stdout).toContain('Night mode');
			expect(stdout).toContain('disabled');
			expect(stdout).toContain('Profiles');

			const sketchOutput = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'sketch', 'sketch-extensions2sketch.json'),
					'utf-8',
				),
			) as SketchPayloadV2;
			const assetNames = sketchOutput.assets.map((asset) => asset.name);

			// meta 随 v2 落地；未登记 `$id` 时用 `$config.theme` stem 作为系列键。
			expect(sketchOutput.meta).toEqual({
				themeId: 'sketch-extensions',
				baseId: 'sketch-extensions',
				mode: 'day',
				version: 2,
			});
			expect(assetNames).toContain('foundation/color/color-primary-main');
			expect(assetNames).toContain('color-shadow');
			expect(
				assetNames.some((name) => name.startsWith('foundation/interaction')),
			).toBe(false);
			expect(
				assetNames.some((name) => name.startsWith('foundation/radius')),
			).toBe(false);
			const shadowAsset = sketchOutput.assets.find(
				(asset) => asset.name === 'aaa/bbb/shadow-1',
			);
			expect(shadowAsset).toMatchObject({ kind: 'layer' });
			const shadows =
				shadowAsset && 'shadows' in shadowAsset
					? shadowAsset.shadows
					: undefined;
			expect(shadows).toHaveLength(4);
			expect(shadows?.[0]).toMatchObject({
				color: '#0f172b0f',
				y: 4,
				blur: 8,
				spread: -2,
			});
			expect(assetNames).not.toContain('aaa/bbb');
			expect(assetNames.some((name) => name.startsWith('component'))).toBe(
				false,
			);

			const jsonOutput = JSON.parse(
				await fs.readFile(
					path.join(outputDir, 'json', 'sketch-extensions.json'),
					'utf-8',
				),
			);
			expect(jsonOutput['color-primary-main']).toBe('#1872f0');
			expect(jsonOutput['foundation/color/primary/main']).toBeUndefined();
			expect(JSON.stringify(jsonOutput)).not.toContain('_sketch');

			const cssOutput = await fs.readFile(
				path.join(outputDir, 'css', 'sketch-extensions.css'),
				'utf-8',
			);
			expect(cssOutput).toContain('--primary-main: #1872f0;');
			expect(cssOutput).not.toContain('foundation/color/primary/main');
			expect(cssOutput).not.toContain('_sketch');
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
		}
	});

	test('token build main.yaml fails clearly when $config is missing', async () => {
		const fixtureDir = path.join(
			rootDir,
			'tests/fixtures/themes/config-main-missing',
		);

		const { exitCode, stdout } = await runWave([
			'token',
			'build',
			'-f',
			path.join(fixtureDir, 'main.yaml'),
		]);

		expect(exitCode).toBe(12);
		expect(stdout).toContain('missing required $config');
		expect(stdout).not.toContain('themefile load');
	});

	async function writeInvalidDtcgColorTheme(
		tempDir: string,
		valueLines: string[],
	): Promise<void> {
		await fs.writeFile(
			path.join(tempDir, 'main.yaml'),
			[
				'$config:',
				'  theme: invalid-dtcg-color',
				'  resource:',
				'    palette: tailwindcss',
				'    dimension: wave',
				'  parameter:',
				'    platform: [css]',
				'theme:',
				'  color:',
				'    $type: color',
				'    bad:',
				'      $value:',
				...valueLines.map((line) => `        ${line}`),
				'',
			].join('\n'),
			'utf-8',
		);
	}

	async function expectInvalidDtcgColorBuildFailure(
		valueLines: string[],
		expectedMessage: string,
	): Promise<void> {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-invalid-dtcg-'),
		);
		try {
			await writeInvalidDtcgColorTheme(tempDir, valueLines);
			const result = await runWave(
				[
					'token',
					'build',
					'-f',
					path.join(tempDir, 'main.yaml'),
					'--output',
					path.join(tempDir, 'dist'),
				],
				rootDir,
				isolatedResourceEnv(tempDir),
			);

			expect(result.exitCode).not.toBe(0);
			expect(`${result.stdout}\n${result.stderr}`).toContain(expectedMessage);
			expect(
				await Bun.file(
					path.join(tempDir, 'dist', 'invalid-dtcg-color.css'),
				).exists(),
			).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	}

	async function expectDtcgColorCssBuildSuccess(
		valueLines: string[],
		expectedCss: string,
	): Promise<void> {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-valid-dtcg-css-'),
		);
		try {
			await writeInvalidDtcgColorTheme(tempDir, valueLines);
			const outputDir = path.join(tempDir, 'dist');
			const result = await runWave(
				[
					'token',
					'build',
					'-f',
					path.join(tempDir, 'main.yaml'),
					'--output',
					outputDir,
				],
				rootDir,
				isolatedResourceEnv(tempDir),
			);

			expect(result.exitCode).toBe(0);
			const css = await fs.readFile(
				path.join(outputDir, 'invalid-dtcg-color.css'),
				'utf8',
			);
			expect(css).toContain(expectedCss);
			expect(css).not.toContain('[object Object]');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	}

	test('token build rejects standalone hex object as color syntax', async () => {
		await expectInvalidDtcgColorBuildFailure(
			['hex: "#0052f5"'],
			'[theme.color.bad.$value] color must be a legacy string or DTCG color object with colorSpace and components',
		);
	});

	test('token build CSS platform emits none components as CSS Color 4', async () => {
		await expectDtcgColorCssBuildSuccess(
			['colorSpace: hsl', 'components: ["none", 0, 0]'],
			'--theme-color-bad: hsl(none 0% 0%);',
		);
	});

	test('token build rejects DTCG hex fallback with alpha channel', async () => {
		await expectInvalidDtcgColorBuildFailure(
			['colorSpace: oklch', 'components: ["none", 0, 0]', 'hex: "#0052f5ff"'],
			'[theme.color.bad.$value.hex] color hex must be a 6 digit hex value',
		);
	});

	test('token build rejects invalid hex fallback even when components are computable', async () => {
		await expectInvalidDtcgColorBuildFailure(
			[
				'colorSpace: oklch',
				'components: [0.518, 0.251, 262.6]',
				'hex: "#0052f5ff"',
			],
			'[theme.color.bad.$value.hex] color hex must be a 6 digit hex value',
		);
	});

	test('token build CSS platform emits display-p3 without hex fallback', async () => {
		await expectDtcgColorCssBuildSuccess(
			['colorSpace: display-p3', 'components: [1, 0, 1]'],
			'--theme-color-bad: color(display-p3 1 0 1);',
		);
	});

	test('token wcag runs contrast checks as a dedicated command', async () => {
		const { exitCode, stdout } = await runWave([
			'token',
			'wcag',
			'-f',
			'tests/fixtures/themes/doctor-contrast-pass/main.yaml',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Contrast Check');
		expect(stdout).toContain('doctor-contrast-pass');
		expect(stdout).toMatch(/\d+\.\d{2}:1/);
		expect(stdout).toContain('🟢 Normal Text   (AAA)');
	});

	test('token wcag supports night scope with partial overlay', async () => {
		const fixture = path.join(
			rootDir,
			'tests/fixtures/themes/profile-model/main.yaml',
		);
		const { exitCode, stdout } = await runWave([
			'token',
			'wcag',
			'--night',
			'-f',
			fixture,
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('profile-model-night');
		expect(stdout).toContain('primary');
		expect(stdout).toMatch(/\d+\.\d{2}:1/);
	});

	test('token new creates a design-token workspace template', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-token-new-'));

		try {
			const proc = Bun.spawn(
				['bun', 'run', path.join(rootDir, 'src/index.ts'), 'token', 'new'],
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
				false,
			);
			expect(await Bun.file(path.join(tempDir, 'main.yaml')).exists()).toBe(
				true,
			);
			expect(await Bun.file(path.join(tempDir, 'manual.md')).exists()).toBe(
				false,
			);
			expect(stdout).toContain('See MANUAL.md for detailed usage');
			expect(stdout).toContain('Replace {TOKEN} placeholders');
			expect(stdout).toContain('Run wave token build -f');

			const mainYamlPath = path.join(tempDir, 'main.yaml');
			const mainYaml = await fs.readFile(mainYamlPath, 'utf-8');
			const fixtureYaml = await fs.readFile(
				path.join(rootDir, 'tests/fixtures/themes/profile-model/main.yaml'),
				'utf-8',
			);
			type InitTemplate = {
				$config: { theme: string; resource: unknown };
				theme: Record<string, unknown> & {
					font: {
						$type: string;
						$extensions: { typography: Record<string, unknown> };
						'base-size': { $type: string; $value: number };
						heading: { h1: { $value: Record<string, unknown> } };
					};
				};
			};
			const parsed = yaml.load(mainYaml) as InitTemplate;
			const fixture = yaml.load(fixtureYaml) as InitTemplate;
			const font = parsed.theme.font;
			const typography = font.$extensions.typography;

			expect(font.$type).toBe('typography');
			expect(typography).not.toHaveProperty('defaults');
			expect(typography).toEqual({
				baseFontSize: '{theme.font.base-size}',
				fontFamily: '{TOKEN}',
				fontSize: { value: 14, unit: 'px' },
				fontWeight: 400,
				lineHeight: 1.5,
				letterSpacing: 0,
			});
			expect(font['base-size']).toEqual({ $type: 'number', $value: 14 });
			expect(font.heading.h1.$value).toMatchObject({
				fontFamily: '{TOKEN}',
				fontWeight: 700,
				lineHeight: 1.2,
				letterSpacing: 0,
			});

			expect(mainYaml.startsWith('$schema:')).toBe(true);
			expect(parsed.$config.theme).toBe('example');
			expect(parsed.$config.resource).toEqual(fixture.$config.resource);
			expect(Object.keys(parsed.theme)).toEqual(Object.keys(fixture.theme));
			expect(mainYaml).toContain('$value: "{TOKEN}"');
			expect(mainYaml).toContain('offset: "{TOKEN}"');
			expect(mainYaml).toContain('fontFamily: "{TOKEN}"');
			expect(mainYaml).not.toContain('{tailwindcss.color.blue.600}');
			expect(mainYaml).not.toContain('{wave.dimension.alpha.100}');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('token show lists built-in design-token resources', async () => {
		const { exitCode, stdout } = await runWave(['token', 'show']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Palettes:');
		expect(stdout).toContain('Dimensions:');
		expect(stdout).toContain('tailwindcss');
		expect(stdout).toContain('wave');
	});

	test('token update help documents public options without running update', async () => {
		const { exitCode, stdout, stderr } = await runWave([
			'token',
			'update',
			'--help',
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Usage: wave token update');
		expect(stdout).toContain('--version <version>');
		expect(stdout).not.toContain('--tailwind-version');
		expect(stderr).toBe('');
	});

	test('token update tailwindcss --version 3 writes cache and state', async () => {
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
				['token', 'update', 'tailwindcss', '--version', '3'],
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

	test('token update tailwindcss --version 4 writes OKLCH cache', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const result = await runWave(
				['token', 'update', 'tailwindcss', '--version', '4'],
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

	test('token update leonardo writes light and dark generated resources', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const configDir = path.join(tempHome, '.config/wave/resources');
			await fs.mkdir(configDir, { recursive: true });
			await fs.writeFile(
				path.join(configDir, 'leonardo.yaml'),
				'colors:\n  brand: "#3366ff"\nratios:\n  values: [1, 2, 3]\n',
				'utf-8',
			);

			const result = await runWave(['token', 'update', 'leonardo'], rootDir, {
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

	test('token status shows cache and state locations', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			const result = await runWave(['token', 'status'], rootDir, {
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
