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
