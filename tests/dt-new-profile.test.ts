import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ExitCode } from '../src/types/index.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');
const baseId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const colorId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const aliasId = 'cccccccccccccccccccccccccccccccc';
const radiusId = 'dddddddddddddddddddddddddddddddd';
const borderId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const familyId = 'ffffffffffffffffffffffffffffffff';
const zeroId = '11111111111111111111111111111111';

function baseDocument(): Record<string, unknown> {
	return {
		$id: baseId,
		$config: {
			theme: 'snapshot',
			parameter: { outputDir: './dist', platform: ['json'] },
		},
		$helper: { example: { $value: 'not a token' } },
		theme: {
			color: {
				$type: 'color',
				primary: { $id: colorId, $value: '#123456' },
				alias: { $id: aliasId, $value: '{theme.color.primary}' },
			},
			radius: {
				small: {
					$id: radiusId,
					$type: 'dimension',
					$value: { value: 4, unit: 'px' },
				},
			},
			border: {
				control: {
					$id: borderId,
					$type: 'border',
					$value: {
						color: { $ref: '#/theme/color/primary/$value' },
						width: '{theme.radius.small}',
						style: 'solid',
					},
				},
			},
			font: {
				family: {
					$id: familyId,
					$type: 'fontFamily',
					$value: ['Inter', 'sans-serif'],
				},
			},
			state: { zero: { $id: zeroId, $type: 'number', $value: 0 } },
		},
		doctor: { wcagPairs: {} },
	};
}

async function runWave(args: string[], cwd: string) {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd,
		env: {
			...process.env,
			WAVE_RESOURCE_CACHE_DIR: path.join(cwd, '.wave-cache'),
			WAVE_RESOURCE_STATE_PATH: path.join(cwd, '.wave-state.json'),
			WAVE_RESOURCE_CONFIG_DIR: path.join(cwd, '.wave-config'),
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	return { exitCode: await proc.exited, stdout, stderr };
}

async function withWorkspace(
	document: Record<string, unknown>,
	run: (dir: string) => Promise<void>,
) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-new-profile-'));
	try {
		await fs.writeFile(path.join(dir, 'main.yaml'), yaml.dump(document));
		await run(dir);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
		expect(await fs.exists(dir)).toBe(false);
	}
}

async function workspaceSnapshot(dir: string) {
	const entries = await fs.readdir(dir, { recursive: true });
	const files: Record<string, string> = {};
	for (const entry of entries.sort()) {
		const target = path.join(dir, entry);
		files[entry] = (await fs.lstat(target)).isDirectory()
			? '<directory>'
			: await fs.readFile(target, 'utf8');
	}
	return files;
}

describe('wave dt new-profile', () => {
	test('registers module and subcommand help for both aliases', async () => {
		for (const module of ['dt', 'design-token']) {
			const help = await runWave([module, '--help'], rootDir);
			expect(help.exitCode).toBe(0);
			expect(help.stdout).toContain('new-profile');
			const commandHelp = await runWave(
				[module, 'new-profile', '--help'],
				rootDir,
			);
			expect(commandHelp.exitCode).toBe(0);
			expect(commandHelp.stdout).toContain(
				`wave ${module} new-profile [options] <name>`,
			);
			expect(commandHelp.stdout).toContain('-f, --file <path>');
		}
	});

	test('creates a normalized full source-value snapshot without changing base', async () => {
		const document = {
			...baseDocument(),
			$value: 'reserved root metadata, not a token',
		};
		await withWorkspace(document, async (dir) => {
			const mainPath = path.join(dir, 'main.yaml');
			const source = await fs.readFile(mainPath, 'utf8');
			const result = await runWave(
				['dt', 'new-profile', '  Demo Profile  ', '-f', mainPath],
				dir,
			);
			expect(result.exitCode, result.stderr).toBe(0);
			const profilePath = path.join(dir, 'profiles/demo_profile.yaml');
			const profile = yaml.load(await fs.readFile(profilePath, 'utf8')) as {
				$id: string;
				$config: { base: string };
				$override: Record<string, { $value: unknown }>;
			};
			expect(Object.keys(profile)).toEqual(['$id', '$config', '$override']);
			expect(profile.$id).toMatch(/^[0-9a-f]{32}$/);
			expect(profile.$id).not.toBe(baseId);
			expect(profile.$config).toEqual({ base: baseId });
			expect(profile.$override).toEqual({
				[colorId]: { $value: '#123456' },
				[aliasId]: { $value: '{theme.color.primary}' },
				[radiusId]: { $value: { value: 4, unit: 'px' } },
				[borderId]: {
					$value: {
						color: { $ref: '#/theme/color/primary/$value' },
						width: '{theme.radius.small}',
						style: 'solid',
					},
				},
				[familyId]: { $value: ['Inter', 'sans-serif'] },
				[zeroId]: { $value: 0 },
			});
			expect(await fs.readFile(mainPath, 'utf8')).toBe(source);
			expect(result.stdout).toContain(profilePath);
			expect(result.stdout).toContain('Edit');
			expect(result.stdout).toContain('redundant');
			expect(result.stdout).toContain('dt build --profile demo_profile');
		});
	});

	test('generated profile builds directly and matches base output', async () => {
		await withWorkspace(baseDocument(), async (dir) => {
			const created = await runWave(
				['design-token', 'new-profile', 'Demo'],
				dir,
			);
			expect(created.exitCode, created.stderr).toBe(0);
			const main = await runWave(
				['dt', 'build', '--out', './main-output'],
				dir,
			);
			expect(main.exitCode, main.stderr).toBe(0);
			const built = await runWave(
				['dt', 'build', '--profile', 'demo', '--out', './profile-output'],
				dir,
			);
			expect(built.exitCode, built.stderr).toBe(0);
			const baseOutput = JSON.parse(
				await fs.readFile(path.join(dir, 'main-output/snapshot.json'), 'utf8'),
			);
			const profileOutput = JSON.parse(
				await fs.readFile(
					path.join(dir, 'profile-output/snapshot-demo.json'),
					'utf8',
				),
			);
			expect(profileOutput).toEqual(baseOutput);
		});
	});

	for (const slot of ['missing', null, '', '   ', 42] as const) {
		test(`rejects unregistered base root (${JSON.stringify(slot)}) with ids guidance and zero writes`, async () => {
			const document = baseDocument();
			if (slot === 'missing') delete document.$id;
			else document.$id = slot;
			await withWorkspace(document, async (dir) => {
				const before = await workspaceSnapshot(dir);
				const result = await runWave(['dt', 'new-profile', 'demo'], dir);
				expect(result.exitCode).toBe(ExitCode.FORMAT_ERROR);
				expect(result.stderr).toContain('wave dt ids --write');
				expect(result.stderr).toContain(path.join(dir, 'main.yaml'));
				expect(await workspaceSnapshot(dir)).toEqual(before);
			});
		});
	}

	for (const slot of ['missing', null, '', '   ', 42] as const) {
		test(`rejects unregistered token (${JSON.stringify(slot)}) with ids guidance and zero writes`, async () => {
			const document = baseDocument();
			const theme = document.theme as Record<string, Record<string, unknown>>;
			const primary = theme.color!.primary as Record<string, unknown>;
			if (slot === 'missing') delete primary.$id;
			else primary.$id = slot;
			await withWorkspace(document, async (dir) => {
				const before = await workspaceSnapshot(dir);
				const result = await runWave(['dt', 'new-profile', 'demo'], dir);
				expect(result.exitCode).toBe(ExitCode.FORMAT_ERROR);
				expect(result.stderr).toContain('wave dt ids --write');
				expect(result.stderr).toContain('theme.color.primary');
				expect(await workspaceSnapshot(dir)).toEqual(before);
			});
		});
	}

	test('rejects duplicate base token ids with ids guidance and zero writes', async () => {
		const document = baseDocument();
		const theme = document.theme as Record<string, Record<string, unknown>>;
		(theme.color!.alias as Record<string, unknown>).$id = colorId;
		await withWorkspace(document, async (dir) => {
			const before = await workspaceSnapshot(dir);
			const result = await runWave(['dt', 'new-profile', 'demo'], dir);
			expect(result.exitCode).toBe(ExitCode.FORMAT_ERROR);
			expect(result.stderr).toContain('Duplicate');
			expect(result.stderr).toContain(colorId);
			expect(result.stderr).toContain('wave dt ids --write');
			expect(await workspaceSnapshot(dir)).toEqual(before);
		});
	});

	test('rejects normalized name collisions, including main, without overwriting', async () => {
		await withWorkspace(baseDocument(), async (dir) => {
			await fs.mkdir(path.join(dir, 'profiles'));
			await fs.writeFile(
				path.join(dir, 'profiles/Demo Profile.yaml'),
				'sentinel',
			);
			const before = await workspaceSnapshot(dir);
			for (const name of ['demo_profile', 'DEMO PROFILE', 'Main']) {
				const result = await runWave(['dt', 'new-profile', name], dir);
				expect(result.exitCode).toBe(ExitCode.INVALID_PARAMETER);
				expect(result.stderr).toContain('already exists');
				expect(await workspaceSnapshot(dir)).toEqual(before);
			}
		});
	});

	for (const name of ['', '   ', '../escape', 'demo.yaml', 'demo@night']) {
		test(`rejects invalid profile name ${JSON.stringify(name)} without writes`, async () => {
			await withWorkspace(baseDocument(), async (dir) => {
				const before = await workspaceSnapshot(dir);
				const result = await runWave(['dt', 'new-profile', name], dir);
				expect(result.exitCode).toBe(ExitCode.INVALID_PARAMETER);
				expect(result.stderr).toContain('Invalid profile name');
				expect(await workspaceSnapshot(dir)).toEqual(before);
			});
		});
	}

	test('keeps the main-only entry contract and rejects invalid config without writes', async () => {
		await withWorkspace(baseDocument(), async (dir) => {
			const tokensPath = path.join(dir, 'tokens.yaml');
			await fs.copyFile(path.join(dir, 'main.yaml'), tokensPath);
			const before = await workspaceSnapshot(dir);
			const invalidEntry = await runWave(
				['dt', 'new-profile', 'demo', '--file', tokensPath],
				dir,
			);
			expect(invalidEntry.exitCode).toBe(ExitCode.INVALID_PARAMETER);
			expect(await workspaceSnapshot(dir)).toEqual(before);
		});
		await withWorkspace({ ...baseDocument(), $config: {} }, async (dir) => {
			const before = await workspaceSnapshot(dir);
			const invalidConfig = await runWave(['dt', 'new-profile', 'demo'], dir);
			expect(invalidConfig.exitCode).toBe(ExitCode.FORMAT_ERROR);
			expect(await workspaceSnapshot(dir)).toEqual(before);
		});
	});
});
