import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { emitNightOverlay } from '../src/core/night/emit.ts';
import { sketchNightPassIds } from '../src/core/pipeline/sketch-identity.ts';

const rootDir = path.resolve(import.meta.dir, '..');

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
				cli: { scene: 'night', chromaEv: 'medium' },
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.outputPath).toBe(path.join(dir, 'main@night.yaml'));
			expect(result.themeId).toBe('config-main');
			expect(result.mode).toBe('night');
			expect(result.baseId).toBe('config-main');
			expect(result.params.chroma).toBe(0.7);
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

	test('CLI chroma overrides $config.night', async () => {
		const { dir, mainPath, env } = await copyFixture(
			'tests/fixtures/themes/config-main',
		);
		const previous = { ...process.env };
		Object.assign(process.env, env);
		try {
			const main = await fs.readFile(mainPath, 'utf8');
			const patched = main.replace(
				'$config:\n  theme: config-main\n',
				'$config:\n  theme: config-main\n  night:\n    scene: moon\n    chroma-ev: minimal\n',
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
			expect(fromConfig.params.chroma).toBe(0.5);
			expect(fromConfig.params.chromaSource).toBe('config-chroma-ev');

			const fromCli = await emitNightOverlay({
				themePath: mainPath,
				cwd: dir,
				cli: { chroma: 0.8, scene: 'sunset' },
			});
			expect(fromCli.ok).toBe(true);
			if (!fromCli.ok) return;
			expect(fromCli.params.scene).toBe('sunset');
			expect(fromCli.params.chroma).toBe(0.8);
			expect(fromCli.params.chromaSource).toBe('cli-chroma');
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
