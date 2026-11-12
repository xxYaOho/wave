import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseThemeYaml } from '../src/core/parser/theme-yaml.ts';
import { collectDependencyDictionary } from '../src/core/pipeline/theme-pipeline.ts';
import {
	canonicalSerialize,
	createTokenCache,
	makeTokenCacheKey,
	TOKEN_CACHE_CAPACITY,
} from '../src/core/pipeline/token-cache.ts';
import { loadResource } from '../src/core/resolver/resource-loader.ts';
import { convertColorSpace } from '../src/core/transformer/color-space.ts';

async function withEnv<T>(
	env: Record<string, string | undefined>,
	fn: () => Promise<T>,
): Promise<T> {
	const previous: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(env)) {
		previous[key] = process.env[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		return await fn();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

describe('P1a token cache policy', () => {
	test('canonical serialization is independent of object insertion order', () => {
		expect(canonicalSerialize({ b: 2, a: 1 })).toBe(
			canonicalSerialize({ a: 1, b: 2 }),
		);
		expect(canonicalSerialize({ value: undefined })).not.toBe(
			canonicalSerialize({ value: null }),
		);
		expect(canonicalSerialize(undefined)).not.toBe(
			canonicalSerialize(['$undefined']),
		);
		const sparse: unknown[] = [];
		sparse.length = 1;
		expect(canonicalSerialize(sparse)).not.toBe(
			canonicalSerialize([undefined]),
		);
	});

	test('capacity enters irreversible degraded mode at 1024 entries', () => {
		const cache = createTokenCache();
		for (let index = 0; index < TOKEN_CACHE_CAPACITY; index++) {
			const key = makeTokenCacheKey('color', { index });
			expect(cache.get('color', key)).toBeUndefined();
			cache.set('color', key, { index });
		}
		const firstKey = makeTokenCacheKey('color', { index: 0 });
		expect(cache.get('color', firstKey)).toBeUndefined();
		expect(cache.stats('color')).toEqual({
			hits: 0,
			misses: TOKEN_CACHE_CAPACITY,
			degraded: 1,
		});
		const secondKey = makeTokenCacheKey('color', {
			index: TOKEN_CACHE_CAPACITY,
		});
		cache.set('color', secondKey, { index: TOKEN_CACHE_CAPACITY });
		expect(cache.stats('color')).toEqual({
			hits: 0,
			misses: TOKEN_CACHE_CAPACITY,
			degraded: 1,
		});
	});

	test('resource, parse and color errors never enter their layers', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-p1a-cache-'));
		try {
			const resourcePath = path.join(root, 'palette.yaml');
			await fs.writeFile(resourcePath, 'broken: [\n', 'utf8');
			const cache = createTokenCache();
			const first = await loadResource(
				'palette',
				resourcePath,
				root,
				{},
				cache,
			);
			const second = await loadResource(
				'palette',
				resourcePath,
				root,
				{},
				cache,
			);
			expect('line' in first).toBe(true);
			expect('line' in second).toBe(true);
			expect(cache.stats('loadResource')).toMatchObject({ hits: 0, misses: 2 });

			const parsed = parseThemeYaml(
				'theme: [\n',
				cache,
				path.join(root, 'theme.yaml'),
			);
			expect('line' in parsed).toBe(true);
			expect(cache.stats('parse').hits).toBe(0);

			const invalidColor = convertColorSpace(
				{ colorSpace: 'srgb', components: [1, 2] } as never,
				'hex',
				'theme.color.first',
				cache,
			);
			const invalidColorAgain = convertColorSpace(
				{ colorSpace: 'srgb', components: [1, 2] } as never,
				'hex',
				'theme.color.second',
				cache,
			);
			expect(invalidColor.error).toContain('theme.color.first');
			expect(invalidColorAgain.error).toContain('theme.color.second');
			expect(cache.stats('color').hits).toBe(0);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('resource content SHA256 invalidates a same-path success snapshot', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-p1a-content-'));
		try {
			const resourcePath = path.join(root, 'palette.yaml');
			await fs.writeFile(
				resourcePath,
				'palette:\n  color:\n    primary:\n      $value: "#112233"\n',
				'utf8',
			);
			const cache = createTokenCache();
			const first = await loadResource(
				'palette',
				resourcePath,
				root,
				{},
				cache,
			);
			expect('line' in first).toBe(false);
			if ('line' in first) return;

			await fs.writeFile(
				resourcePath,
				'palette:\n  color:\n    primary:\n      $value: "#aabbcc"\n',
				'utf8',
			);
			const second = await loadResource(
				'palette',
				resourcePath,
				root,
				{},
				cache,
			);
			expect('line' in second).toBe(false);
			if ('line' in second) return;

			expect(first.content).toContain('#112233');
			expect(second.content).toContain('#aabbcc');
			expect(second.content).not.toContain('#112233');
			expect(cache.stats('loadResource')).toMatchObject({
				hits: 0,
				misses: 2,
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('readOnly missing-resource errors do not poison a later writable restore', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-p1a-readonly-'));
		const home = path.join(root, 'home');
		const cacheDir = path.join(home, '.cache', 'wave', 'resources');
		const statePath = path.join(
			home,
			'.local',
			'state',
			'wave',
			'resources',
			'state.json',
		);
		const fixtureDir = path.resolve(import.meta.dir, 'fixtures/resources');
		try {
			await fs.mkdir(path.dirname(statePath), { recursive: true });
			await fs.writeFile(
				statePath,
				JSON.stringify({
					tailwindcss: { updatedBefore: true, requestedVersion: '3' },
				}),
				'utf8',
			);

			await withEnv(
				{
					HOME: home,
					WAVE_RESOURCE_CACHE_DIR: cacheDir,
					WAVE_RESOURCE_STATE_PATH: statePath,
					WAVE_TAILWIND_FIXTURE_DIR: fixtureDir,
				},
				async () => {
					const cache = createTokenCache();
					const blocked = await loadResource(
						'palette',
						'tailwindcss',
						root,
						{ readOnly: true },
						cache,
					);
					expect('line' in blocked).toBe(true);
					if (!('line' in blocked)) return;
					expect(blocked.message).toContain('Resource cache missing');

					const restored = await loadResource(
						'palette',
						'tailwindcss',
						root,
						{ readOnly: false },
						cache,
					);
					expect('line' in restored).toBe(false);
					if ('line' in restored) return;
					expect(restored.namespace).toBe('tailwindcss');
					expect(
						await Bun.file(path.join(cacheDir, 'tailwindcss.yaml')).exists(),
					).toBe(true);

					const repeated = await loadResource(
						'palette',
						'tailwindcss',
						root,
						{ readOnly: false },
						cache,
					);
					expect(repeated).toBe(restored);
					expect(cache.stats('loadResource')).toMatchObject({
						hits: 1,
						misses: 1,
					});
				},
			);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('resource kind and source roles isolate same-file cache entries', async () => {
		const root = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-p1a-kind-source-'),
		);
		const cacheDir = path.join(root, '.cache');
		const cachePath = path.join(cacheDir, 'tailwindcss.yaml');
		try {
			await fs.mkdir(cacheDir, { recursive: true });
			await fs.writeFile(
				cachePath,
				'tailwindcss:\n  color:\n    primary:\n      $value: "#112233"\n',
				'utf8',
			);
			await withEnv({ WAVE_RESOURCE_CACHE_DIR: cacheDir }, async () => {
				const cache = createTokenCache();
				const custom = await loadResource('custom', cachePath, root, {}, cache);
				const paletteUser = await loadResource(
					'palette',
					cachePath,
					root,
					{},
					cache,
				);
				const paletteCache = await loadResource(
					'palette',
					'tailwindcss',
					root,
					{},
					cache,
				);
				expect('line' in custom).toBe(false);
				expect('line' in paletteUser).toBe(false);
				expect('line' in paletteCache).toBe(false);
				if ('line' in custom || 'line' in paletteUser || 'line' in paletteCache)
					return;
				expect(custom.source).toBe('user');
				expect(paletteUser.source).toBe('user');
				expect(paletteCache.source).toBe('cache');
				expect(custom.kind).toBe('custom');
				expect(paletteUser.kind).toBe('palette');
				expect(paletteCache.kind).toBe('palette');
				expect(custom.data).toEqual(paletteUser.data);
				expect(paletteUser.data).toEqual(paletteCache.data);

				const customAgain = await loadResource(
					'custom',
					cachePath,
					root,
					{},
					cache,
				);
				const paletteUserAgain = await loadResource(
					'palette',
					cachePath,
					root,
					{},
					cache,
				);
				const paletteCacheAgain = await loadResource(
					'palette',
					'tailwindcss',
					root,
					{},
					cache,
				);
				expect(customAgain).toBe(custom);
				expect(paletteUserAgain).toBe(paletteUser);
				expect(paletteCacheAgain).toBe(paletteCache);
				expect(cache.stats('loadResource')).toMatchObject({
					hits: 3,
					misses: 3,
				});
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('successful snapshots are frozen and dictionary cache includes declaration order', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-p1a-dict-'));
		try {
			const resourcePath = path.join(root, 'palette.yaml');
			await fs.writeFile(
				resourcePath,
				'sample:\n  color:\n    red:\n      $value: "#ff0000"\n',
				'utf8',
			);
			const cache = createTokenCache();
			const config = { resources: [{ kind: 'palette', ref: resourcePath }] };
			const first = await collectDependencyDictionary(config, root, {}, cache);
			const second = await collectDependencyDictionary(config, root, {}, cache);
			expect(first).toBe(second);
			expect(cache.stats('dictionary')).toEqual({
				hits: 1,
				misses: 1,
				degraded: 0,
			});
			expect(Object.isFrozen(second)).toBe(true);
			expect(Object.isFrozen(second.dict)).toBe(true);
			expect(Object.isFrozen(second.loaded[0])).toBe(true);
			expect(() => {
				(second.dict.sample!.data as Record<string, unknown>).changed = true;
			}).toThrow();

			const reversed = await collectDependencyDictionary(
				{
					resources: [
						{ kind: 'palette', ref: resourcePath },
						{ kind: 'palette', ref: resourcePath },
					],
				},
				root,
				{},
				cache,
			);
			expect(reversed.issues.length).toBeGreaterThan(0);
			expect(cache.stats('dictionary').hits).toBe(1);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
