import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { deriveNightOverlay } from '../src/core/night/derive-overlay.ts';
import { emitNightOverlay } from '../src/core/night/emit.ts';
import { resolveNightParams } from '../src/core/night/params.ts';
import { sketchNightPassIds } from '../src/core/pipeline/sketch-identity.ts';
import { createCliRunner } from './utils/cli-runner.ts';

const rootDir = path.resolve(import.meta.dir, '..');

const runWave = createCliRunner((args: string[], cwd: string) => ({
	command: ['bun', 'run', path.join(rootDir, 'src/index.ts'), ...args],
	cwd,
	env: { ...process.env, ...isolatedResourceEnv(cwd) },
}));

async function snapshot(dir: string) {
	const result: Record<string, string> = {};
	for (const name of (await fs.readdir(dir, { recursive: true })).sort()) {
		const target = path.join(dir, name);
		const stats = await fs.lstat(target);
		result[name] = stats.isDirectory()
			? '<directory>'
			: stats.isSymbolicLink()
				? `<symlink:${await fs.readlink(target)}>`
				: await fs.readFile(target, 'utf8');
	}
	return result;
}

async function withDayProfile(
	run: (dir: string, profile: string) => Promise<void>,
) {
	const dir = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), 'wave-night-profile-')),
	);
	const profile = path.join(dir, 'themes/mobile/mobile.yaml');
	try {
		await fs.mkdir(path.dirname(profile), { recursive: true });
		await fs.writeFile(
			path.join(dir, 'base-palette.yaml'),
			'base:\n  color: { $type: color, $value: "#112233" }\n',
		);
		await fs.writeFile(
			path.join(dir, 'themes/mobile/brand.yaml'),
			'brand:\n  color: { $type: color, $value: "#cc3344" }\n',
		);
		await fs.writeFile(
			path.join(dir, 'main.yaml'),
			yaml.dump({
				$id: 'base-theme',
				$config: {
					theme: 'night-test',
					resource: { custom: './base-palette.yaml' },
					parameter: { platform: ['json', 'sketch'] },
					night: { scene: 'moon', 'luminance-ev': 'minimal' },
				},
				theme: {
					color: {
						$type: 'color',
						primary: { $id: 'primary-id', $value: '{base.color}' },
						alias: { $id: 'alias-id', $value: '{theme.color.primary}' },
						inherited: { $id: 'inherited-id', $value: '{base.color}' },
					},
					state: {
						hover: { $id: 'hover-id', $type: 'number', $value: 0.1 },
						alias: {
							$id: 'state-alias-id',
							$type: 'number',
							$value: '{theme.state.hover}',
						},
					},
				},
			}),
		);
		await fs.writeFile(
			profile,
			yaml.dump({
				$id: 'profile-theme',
				$config: { base: 'base-theme', resource: { custom: './brand.yaml' } },
				$override: {
					'primary-id': { $value: '{brand.color}' },
					'hover-id': { $value: 0.25 },
				},
			}),
		);
		await run(dir, profile);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

function isolatedResourceEnv(tempDir: string): Record<string, string> {
	return {
		WAVE_RESOURCE_CACHE_DIR: path.join(tempDir, '.wave-cache'),
		WAVE_RESOURCE_STATE_PATH: path.join(tempDir, '.wave-state.json'),
		WAVE_RESOURCE_CONFIG_DIR: path.join(tempDir, '.wave-config'),
	};
}

async function copyFixture(relativePath: string): Promise<{
	dir: string;
	mainPath: string;
	env: Record<string, string>;
}> {
	const sourceDir = path.join(rootDir, relativePath);
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-night-'));
	await fs.cp(sourceDir, dir, {
		recursive: true,
		filter: (source) => {
			const name = path.basename(source);
			return !['.DS_Store', '.tmp', 'theme', 'dist', 'build'].includes(name);
		},
	});
	return {
		dir,
		mainPath: path.join(dir, 'main.yaml'),
		env: isolatedResourceEnv(dir),
	};
}

describe('night emit path', () => {
	test('derives an arbitrary-directory profile after base merge, local resources and aliases, retaining Day identity', async () => {
		await withDayProfile(async (dir, profile) => {
			const before = await snapshot(dir);
			const result = await emitNightOverlay({
				themePath: profile,
				cwd: dir,
				cli: {},
			});
			expect(result.ok, JSON.stringify(result)).toBe(true);
			if (!result.ok) return;
			expect(result.outputPath).toBe(profile.replace('.yaml', '@night.yaml'));
			expect(result).toMatchObject({
				themeId: 'profile-theme',
				baseId: 'base-theme',
				mode: 'night',
			});
			expect(result.params).toMatchObject({
				scene: 'moon',
				luminance: 0.5,
				sceneSource: 'config',
				luminanceSource: 'config-luminance-ev',
			});
			const expected = deriveNightOverlay({
				resolvedTheme: {
					color: {
						primary: { $value: '#cc3344' },
						alias: { $value: '#cc3344' },
						inherited: { $value: '#112233' },
					},
					state: { hover: { $value: 0.25 }, alias: { $value: 0.25 } },
				},
				params: resolveNightParams(
					{},
					{ scene: 'moon', luminanceEv: 'minimal' },
				),
			}).overlay;
			expect(yaml.load(await fs.readFile(result.outputPath, 'utf8'))).toEqual(
				expected,
			);
			for (const [name, content] of Object.entries(before)) {
				if (content !== '<directory>')
					expect(await fs.readFile(path.join(dir, name), 'utf8')).toBe(content);
			}
			const built = await runWave(
				[
					'token',
					'build',
					'-f',
					profile,
					'--night',
					'--output',
					path.join(dir, 'out'),
				],
				dir,
			);
			expect(built.exitCode, `${built.stdout}\n${built.stderr}`).toBe(0);
			expect(
				await fs.exists(path.join(dir, 'out/night-test-mobile-night.json')),
			).toBe(true);
			const sketch = JSON.parse(
				await fs.readFile(
					path.join(dir, 'out/night-test-mobile-night2sketch.json'),
					'utf8',
				),
			);
			expect(sketch.meta).toMatchObject({
				themeId: 'profile-theme',
				baseId: 'base-theme',
				mode: 'night',
			});
		});
	});

	test('custom output preserves overlay and identity and explains the exact move/build steps', async () => {
		await withDayProfile(async (dir, profile) => {
			const output = path.join(dir, 'drafts', 'custom.yaml');
			const before = await snapshot(dir);
			const args = ['token', 'new', 'night', '-f', profile, '-o', output];
			const planned = await runWave([...args, '--dry-run'], dir);
			expect(planned.exitCode, planned.stderr).toBe(0);
			expect(planned.stdout).toContain('dry run');
			expect(planned.stdout).toContain('scene=moon luminance=0.5');
			expect(await snapshot(dir)).toEqual(before);
			const created = await runWave(args, dir);
			expect(created.exitCode, created.stderr).toBe(0);
			expect(created.stdout).toContain(
				`Move the overlay to ${profile.replace('.yaml', '@night.yaml')}`,
			);
			expect(created.stdout).toContain(
				`token build -f ${JSON.stringify(profile)} --night`,
			);
			expect(created.stdout).toContain('after moving it');
			expect(await fs.exists(profile.replace('.yaml', '@night.yaml'))).toBe(
				false,
			);
			const defaultResult = await emitNightOverlay({
				themePath: profile,
				cwd: dir,
				cli: {},
			});
			expect(defaultResult.ok).toBe(true);
			if (!defaultResult.ok) return;
			const custom = await fs.readFile(output, 'utf8');
			expect(yaml.load(custom)).toEqual(
				yaml.load(await fs.readFile(defaultResult.outputPath, 'utf8')),
			);
			expect(custom).toContain(
				'themeId=profile-theme baseId=base-theme mode=night',
			);
		});
	});

	test('default and custom targets refuse existing output, dry-run is inert, force only replaces that file', async () => {
		await withDayProfile(async (dir, profile) => {
			for (const output of [
				profile.replace('.yaml', '@night.yaml'),
				path.join(dir, 'custom.yaml'),
			]) {
				await fs.writeFile(output, 'sentinel');
				const args = ['token', 'new', 'night', '-f', profile, '-o', output];
				const before = await snapshot(dir);
				for (const extra of [[], ['--dry-run']]) {
					const rejected = await runWave([...args, ...extra], dir);
					expect(rejected.exitCode).not.toBe(0);
					expect(rejected.stderr).toContain('already exists');
					expect(await snapshot(dir)).toEqual(before);
				}
				const planned = await runWave([...args, '--force', '--dry-run'], dir);
				expect(planned.exitCode, planned.stderr).toBe(0);
				expect(planned.stdout).toContain('would overwrite');
				expect(await snapshot(dir)).toEqual(before);
				const forced = await runWave([...args, '--force'], dir);
				expect(forced.exitCode, forced.stderr).toBe(0);
				const after = await snapshot(dir);
				expect(Object.keys(after)).toEqual(Object.keys(before));
				for (const name of Object.keys(before)) {
					if (path.join(dir, name) !== output)
						expect(after[name]).toBe(before[name]!);
				}
				expect(after[path.relative(dir, output)]).not.toBe('sentinel');
			}
		});
	});

	test('rejects Night input, legacy CLI aliases, invalid params and protected outputs without writes', async () => {
		await withDayProfile(async (dir, profile) => {
			const night = profile.replace('.yaml', '@night.yaml');
			await fs.writeFile(night, 'theme: {}\n');
			const linked = path.join(dir, 'linked.yaml');
			await fs.symlink(profile, linked);
			const hard = path.join(dir, 'hard.yaml');
			await fs.link(profile, hard);
			await fs.mkdir(path.join(dir, 'directory.yaml'));
			const before = await snapshot(dir);
			const cases = [
				['-f', night],
				['-f', profile, '--chroma', '0.5'],
				['-f', profile, '--chroma-ev', 'low'],
				['-f', profile, '--scene', 'invalid'],
				['-f', profile, '--luminance', 'bad'],
				['-f', profile, '--luminance', '1.5'],
				...[
					'main.yaml',
					path.relative(dir, profile),
					'linked.yaml',
					'hard.yaml',
					'directory.yaml',
				].map((output) => ['-f', profile, '-o', path.join(dir, output)]),
			];
			for (const args of cases) {
				const rejected = await runWave(
					['token', 'new', 'night', ...args, '--force'],
					dir,
				);
				expect(rejected.exitCode, JSON.stringify(args)).not.toBe(0);
				expect(await snapshot(dir)).toEqual(before);
			}
		});
	});

	test('accepts main file, default main and workspace directory as the same Day source in dry-run', async () => {
		await withDayProfile(async (dir) => {
			const before = await snapshot(dir);
			for (const args of [
				[],
				['-f', dir],
				['-f', path.join(dir, 'main.yaml')],
			]) {
				const planned = await runWave(
					['token', 'new', 'night', ...args, '--dry-run'],
					dir,
				);
				expect(planned.exitCode, planned.stderr).toBe(0);
				expect(planned.stdout).toContain(path.join(dir, 'main@night.yaml'));
				expect(planned.stdout).toContain('scene=moon luminance=0.5');
				expect(await snapshot(dir)).toEqual(before);
			}
		});
	});

	test('main directory generation creates a consumable main Night overlay', async () => {
		await withDayProfile(async (dir) => {
			const created = await runWave(['token', 'new', 'night', '-f', dir], dir);
			expect(created.exitCode, created.stderr).toBe(0);
			const built = await runWave(
				[
					'token',
					'build',
					'-f',
					dir,
					'--night',
					'--output',
					path.join(dir, 'out'),
				],
				dir,
			);
			expect(built.exitCode, built.stderr).toBe(0);
			expect(await fs.exists(path.join(dir, 'out/night-test-night.json'))).toBe(
				true,
			);
		});
	});

	test('a profile without document identity keeps the same optional identity as Day', async () => {
		await withDayProfile(async (dir, profile) => {
			const doc = yaml.load(await fs.readFile(profile, 'utf8')) as Record<
				string,
				unknown
			>;
			delete doc.$id;
			await fs.writeFile(profile, yaml.dump(doc));
			const result = await emitNightOverlay({
				themePath: profile,
				cwd: dir,
				cli: {},
				dryRun: true,
			});
			expect(result).toMatchObject({
				ok: true,
				themeId: undefined,
				baseId: 'base-theme',
				mode: 'night',
			});
		});
	});

	test('missing/invalid resources and unresolved aliases fail before creating output directories', async () => {
		await withDayProfile(async (dir, profile) => {
			const palette = path.join(dir, 'themes/mobile/brand.yaml');
			for (const content of [
				'brand: invalid\n',
				'brand:\n  color: { $type: color, $value: "{brand.missing}" }\n',
				null,
			]) {
				if (content === null) await fs.unlink(palette);
				else await fs.writeFile(palette, content);
				const before = await snapshot(dir);
				for (const extra of [[], ['--dry-run']]) {
					const result = await runWave(
						[
							'token',
							'new',
							'night',
							'-f',
							profile,
							'-o',
							path.join(dir, 'new/output.yaml'),
							...extra,
						],
						dir,
					);
					expect(result.exitCode).not.toBe(0);
					expect(await snapshot(dir)).toEqual(before);
				}
			}
		});
	});

	test('planning and failed creation never restore missing resource caches', async () => {
		await withDayProfile(async (dir, profile) => {
			const main = path.join(dir, 'main.yaml');
			const doc = yaml.load(await fs.readFile(main, 'utf8')) as {
				$config: { resource: unknown };
			};
			doc.$config.resource = {
				custom: './base-palette.yaml',
				palette: ['leonardo-light'],
			};
			await fs.writeFile(main, yaml.dump(doc));
			await fs.writeFile(
				path.join(dir, '.wave-state.json'),
				JSON.stringify({ leonardo: { updatedBefore: true } }),
			);
			const before = await snapshot(dir);
			for (const extra of [[], ['--dry-run']]) {
				const result = await runWave(
					['token', 'new', 'night', '-f', profile, ...extra],
					dir,
				);
				expect(result.exitCode).not.toBe(0);
				expect(result.stderr).toContain('wave token update leonardo');
				expect(await snapshot(dir)).toEqual(before);
			}
		});
	});

	test('writes main@night.yaml beside theme with color leaves', async () => {
		const { dir, mainPath, env } = await copyFixture(
			'tests/fixtures/themes/config-main',
		);
		const previous = { ...process.env };
		Object.assign(process.env, env);
		try {
			const result = await emitNightOverlay({
				themePath: mainPath,
				cwd: dir,
				cli: { scene: 'night', luminanceEv: 'medium' },
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.outputPath).toBe(path.join(dir, 'main@night.yaml'));
			expect(result.themeId).toBe('config-main');
			expect(result.mode).toBe('night');
			expect(result.baseId).toBe('config-main');
			expect(result.params.luminance).toBe(0.7);
			expect(result.params.scene).toBe('night');

			const raw = await fs.readFile(result.outputPath, 'utf8');
			expect(raw).toContain('themeId=config-main');
			expect(raw).toContain('mode=night');
			const doc = yaml.load(
				raw
					.split('\n')
					.filter((l) => !l.startsWith('#'))
					.join('\n'),
			) as {
				theme: { color: Record<string, unknown> };
			};
			expect(doc.theme.color.primary).toEqual(
				expect.objectContaining({
					$value: expect.stringMatching(/^#[0-9a-f]{6,8}$/i),
				}),
			);
		} finally {
			process.env = previous;
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('CLI luminance overrides $config.night', async () => {
		const { dir, mainPath, env } = await copyFixture(
			'tests/fixtures/themes/config-main',
		);
		const previous = { ...process.env };
		Object.assign(process.env, env);
		try {
			const main = await fs.readFile(mainPath, 'utf8');
			const patched = main.replace(
				'$config:\n  theme: config-main\n',
				'$config:\n  theme: config-main\n  night:\n    scene: moon\n    luminance-ev: minimal\n',
			);
			await fs.writeFile(mainPath, patched, 'utf8');

			const fromConfig = await emitNightOverlay({
				themePath: mainPath,
				cwd: dir,
				cli: {},
			});
			expect(fromConfig.ok).toBe(true);
			if (!fromConfig.ok) return;
			expect(fromConfig.params.scene).toBe('moon');
			expect(fromConfig.params.luminance).toBe(0.5);
			expect(fromConfig.params.luminanceSource).toBe('config-luminance-ev');

			const fromCli = await emitNightOverlay({
				themePath: mainPath,
				cwd: dir,
				cli: { luminance: 0.8, scene: 'sunset' },
				force: true,
			});
			expect(fromCli.ok).toBe(true);
			if (!fromCli.ok) return;
			expect(fromCli.params.scene).toBe('sunset');
			expect(fromCli.params.luminance).toBe(0.8);
			expect(fromCli.params.luminanceSource).toBe('cli-luminance');
		} finally {
			process.env = previous;
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});

describe('sketchNightPassIds', () => {
	test('keeps day themeId/baseId and sets mode night', () => {
		expect(
			sketchNightPassIds({
				isDefault: true,
				documentThemeId: 'abc123',
				themeStem: 'orca',
			}),
		).toEqual({ themeId: 'abc123', baseId: 'abc123', mode: 'night' });

		expect(
			sketchNightPassIds({
				isDefault: true,
				themeStem: 'orca',
			}),
		).toEqual({ themeId: 'orca', baseId: 'orca', mode: 'night' });
	});
});
