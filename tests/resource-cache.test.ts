import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadResource } from '../src/core/resolver/resource-loader.ts';
import { updateTailwind } from '../src/core/resources/manager.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const fixtureDir = path.join(rootDir, 'tests/fixtures/resources');

function withEnv<T>(
	env: Record<string, string | undefined>,
	fn: () => Promise<T>,
): Promise<T> {
	const previous: Record<string, string | undefined> = {};
	for (const key of Object.keys(env)) {
		previous[key] = process.env[key];
		const value = env[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	return fn().finally(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
}

describe('resource cache and adapters', () => {
	test('explicit project resource wins over cache and builtin', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		const tempTheme = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-theme-'));
		try {
			await withEnv(
				{
					HOME: tempHome,
					WAVE_TAILWIND_FIXTURE_DIR: fixtureDir,
				},
				async () => {
					await updateTailwind('3');
					const customPath = path.join(tempTheme, 'custom-tailwind.yaml');
					await fs.writeFile(
						customPath,
						'tailwindcss:\n  color:\n    $type: color\n    custom:\n      $value: "#123456"\n',
						'utf-8',
					);
					const result = await loadResource(
						'palette',
						'./custom-tailwind.yaml',
						tempTheme,
					);
					expect('line' in result).toBe(false);
					if (!('line' in result)) {
						expect(result.path).toBe(customPath);
						expect(result.content).toContain('#123456');
					}
				},
			);
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
			await fs.rm(tempTheme, { recursive: true, force: true });
		}
	});

	test('bare resource reads cache before builtin', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			await withEnv(
				{
					HOME: tempHome,
					WAVE_TAILWIND_FIXTURE_DIR: fixtureDir,
				},
				async () => {
					await updateTailwind('3');
					const result = await loadResource('palette', 'tailwindcss', rootDir);
					expect('line' in result).toBe(false);
					if (!('line' in result)) {
						expect(result.path).toContain(
							'.cache/wave/resources/tailwindcss.yaml',
						);
						expect(result.content).toContain('#ef4444');
					}
				},
			);
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('updated cache missing restores from state', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			await withEnv(
				{
					HOME: tempHome,
					WAVE_TAILWIND_FIXTURE_DIR: fixtureDir,
				},
				async () => {
					await updateTailwind('3');
					const cachePath = path.join(
						tempHome,
						'.cache/wave/resources/tailwindcss.yaml',
					);
					await fs.rm(cachePath, { force: true });
					const result = await loadResource('palette', 'tailwindcss', rootDir);
					expect('line' in result).toBe(false);
					expect(await Bun.file(cachePath).exists()).toBe(true);
				},
			);
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('generated leonardo light and dark resources expose separate namespaces', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			await withEnv({ HOME: tempHome }, async () => {
				const { updateLeonardo } = await import(
					'../src/core/resources/manager.ts'
				);
				await updateLeonardo();
				const light = await loadResource('palette', 'leonardo-light', rootDir);
				const dark = await loadResource('palette', 'leonardo-dark', rootDir);
				expect('line' in light).toBe(false);
				expect('line' in dark).toBe(false);
				if (!('line' in light) && !('line' in dark)) {
					expect(light.namespace).toBe('leonardo-light');
					expect(dark.namespace).toBe('leonardo-dark');
					expect(light.content).toContain('leonardo-light:');
					expect(dark.content).toContain('leonardo-dark:');
				}
			});
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});
});
