import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { loadResource } from '../src/core/resolver/resource-loader.ts';
import {
	updateLeonardo,
	updateTailwind,
} from '../src/core/resources/manager.ts';

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

	test('builtin leonardo generation preserves existing light and dark values', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		try {
			await withEnv({ HOME: tempHome }, async () => {
				await updateLeonardo();
				const builtin = yaml.load(
					await fs.readFile(
						path.join(rootDir, 'src/resources/palettes/leonardo.yaml'),
						'utf-8',
					),
				) as {
					leonardo: {
						color: Record<
							string,
							{
								light?: Record<string, unknown>;
								dark?: Record<string, unknown>;
							}
						>;
					};
				};
				const light = await loadResource('palette', 'leonardo-light', rootDir);
				const dark = await loadResource('palette', 'leonardo-dark', rootDir);
				expect('line' in light).toBe(false);
				expect('line' in dark).toBe(false);
				if (!('line' in light) && !('line' in dark)) {
					const lightData = (light.data as { color: Record<string, unknown> })
						.color as Record<string, Record<string, unknown>>;
					const darkData = (dark.data as { color: Record<string, unknown> })
						.color as Record<string, Record<string, unknown>>;
					expect(Object.keys(lightData)).toContain('deepGray');
					expect(Object.keys(lightData)).toContain('lightBlue');
					expect(lightData.red?.['600']).toEqual(
						builtin.leonardo.color.red?.light?.['600'],
					);
					expect(darkData.red?.['600']).toEqual(
						builtin.leonardo.color.red?.dark?.['600'],
					);
					expect(lightData.gray?.['600']).toEqual(
						builtin.leonardo.color.gray?.light?.['600'],
					);
				}
			});
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
		}
	});

	test('tailwind v4 OKLCH cache builds to hex when colorSpace is hex', async () => {
		const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-resource-'));
		const tempTheme = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-theme-'));
		const outputDir = path.join(tempTheme, 'out');
		try {
			await withEnv(
				{
					HOME: tempHome,
					WAVE_TAILWIND_FIXTURE_DIR: fixtureDir,
				},
				async () => {
					await updateTailwind('4');
				},
			);
			const cachePath = path.join(
				tempHome,
				'.cache/wave/resources/tailwindcss.yaml',
			);
			const cachedResource = yaml.load(
				await fs.readFile(cachePath, 'utf-8'),
			) as {
				tailwindcss: {
					color: {
						red: {
							'500': {
								$value: unknown;
							};
						};
					};
				};
			};
			expect(cachedResource.tailwindcss.color.red['500'].$value).toEqual({
				colorSpace: 'oklch',
				components: [0.637, 0.237, 25.331],
			});
			await fs.writeFile(
				path.join(tempTheme, 'themefile'),
				'THEME tailwind-v4\nRESOURCE palette tailwindcss\nRESOURCE dimension wave\n',
				'utf-8',
			);
			await fs.writeFile(
				path.join(tempTheme, 'main.yaml'),
				[
					'$config:',
					'  theme: tailwind-v4',
					'  resource:',
					'    palette: tailwindcss',
					'    dimension: wave',
					'  parameter:',
					'    platform: [json]',
					'    colorSpace: hex',
					'theme:',
					'  color:',
					'    $type: color',
					'    primary:',
					'      $value: "{tailwindcss.color.red.500}"',
					'',
				].join('\n'),
				'utf-8',
			);
			const proc = Bun.spawn(
				[
					'bun',
					'run',
					path.join(rootDir, 'src/index.ts'),
					'dt',
					'build',
					'-f',
					path.join(tempTheme, 'themefile'),
					'-o',
					outputDir,
					'--no-night',
				],
				{
					cwd: rootDir,
					env: { ...process.env, HOME: tempHome },
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);
			expect(await proc.exited).toBe(0);
			const output = JSON.parse(
				await fs.readFile(path.join(outputDir, 'tailwind-v4.json'), 'utf-8'),
			);
			expect(output['theme-color-primary']).toBe('#fb2c36');
		} finally {
			await fs.rm(tempHome, { recursive: true, force: true });
			await fs.rm(tempTheme, { recursive: true, force: true });
		}
	});
});
