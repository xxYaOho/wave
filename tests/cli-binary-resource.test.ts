import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { $ } from 'bun';
import { createCliRunner } from './utils/cli-runner.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const distWave = path.join(rootDir, 'dist', 'wave');

let tempHome = '';
let tempOut = '';
let tempCacheDir = '';
let tempStatePath = '';
let tempConfigDir = '';

const runDist = createCliRunner((args: string[], cwd: string = rootDir) => ({
	command: [distWave, ...args],
	cwd,
	env: {
		...process.env,
		HOME: tempHome,
		WAVE_HOME: path.join(tempHome, '.wave-home'),
		WAVE_RESOURCE_CACHE_DIR: tempCacheDir,
		WAVE_RESOURCE_STATE_PATH: tempStatePath,
		WAVE_RESOURCE_CONFIG_DIR: tempConfigDir,
	},
}));

beforeAll(async () => {
	tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-bin-home-'));
	tempOut = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-bin-out-'));
	tempCacheDir = path.join(tempHome, 'resource-cache');
	tempStatePath = path.join(tempHome, 'resource-state', 'state.json');
	tempConfigDir = path.join(tempHome, 'resource-config');
	await $`pnpm build`;
});

afterAll(async () => {
	if (tempHome) await fs.rm(tempHome, { recursive: true, force: true });
	if (tempOut) await fs.rm(tempOut, { recursive: true, force: true });
});

describe('compiled wave built-in resources', () => {
	test('loads uncached built-in palette and dimension resources', async () => {
		const palette = await runDist(['token', 'show', 'palette', 'tailwindcss']);
		expect(palette.exitCode).toBe(0);
		expect(palette.stdout).toContain('tailwindcss');
		expect(
			await Bun.file(path.join(tempCacheDir, 'tailwindcss.yaml')).exists(),
		).toBe(false);

		const dimension = await runDist(['token', 'show', 'dimension', 'wave']);
		expect(dimension.exitCode).toBe(0);
		expect(dimension.stdout).toContain('dimension');
		expect(await Bun.file(path.join(tempCacheDir, 'wave.yaml')).exists()).toBe(
			false,
		);
	});

	test('builds a fixture with uncached built-in resources', async () => {
		const result = await runDist([
			'token',
			'build',
			'-f',
			'tests/fixtures/themes/standard/main.yaml',
			'--output',
			tempOut,
		]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Theme generation complete');
		expect(result.stdout).toContain('palette             tailwindcss');
		expect(result.stdout).toContain('(builtin)');
		expect(result.stdout).toContain('dimension           wave');
		expect(
			await Bun.file(path.join(tempOut, 'test-standard.css')).exists(),
		).toBe(true);
	});
});
