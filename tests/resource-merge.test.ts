import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectDependencyDictionary } from '../src/core/pipeline/theme-pipeline.ts';
import type { DesignTokenBuildConfig } from '../src/types/index.ts';

const rootDir = path.resolve(__dirname, '..');

function makeConfig(
	resources: DesignTokenBuildConfig['resources'] = [],
): Pick<DesignTokenBuildConfig, 'resources'> {
	return { resources };
}

describe('collectDependencyDictionary', () => {
	test('collects an empty dictionary without issues', async () => {
		const result = await collectDependencyDictionary(makeConfig(), rootDir);

		expect(result.dict).toEqual({});
		expect(result.loaded).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	test('records a missing declaration without failing collection', async () => {
		const result = await collectDependencyDictionary(
			makeConfig([{ kind: 'custom', ref: './missing.yaml' }]),
			rootDir,
		);

		expect(result.dict).toEqual({});
		expect(result.loaded).toEqual([]);
		expect(result.issues[0]?.message).toContain('Resource not found');
	});

	test('removes duplicate namespaces and records every later duplicate', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-dup-'));
		try {
			for (const name of ['first', 'second', 'third']) {
				await fs.writeFile(
					path.join(tempDir, `${name}.yaml`),
					'shared:\n  token:\n    $value: value\n',
				);
			}
			const config = makeConfig(
				['first', 'second', 'third'].map((name) => ({
					kind: 'custom',
					ref: `./${name}.yaml`,
				})),
			);

			const result = await collectDependencyDictionary(config, tempDir);

			expect(result.dict.shared).toBeUndefined();
			expect(result.loaded.some((entry) => entry.namespace === 'shared')).toBe(
				false,
			);
			expect(result.issues).toHaveLength(2);
			expect(result.issues[0]?.message).toContain(
				'Duplicate namespace "shared"',
			);
			expect(result.issues[1]).toMatchObject({
				kind: 'custom',
				ref: './third.yaml',
				namespace: 'shared',
			});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('permits unknown kinds and invalid kind schemas after generic loading', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-tolerant-'));
		try {
			const unknownPath = path.join(tempDir, 'unknown.yaml');
			const invalidPalettePath = path.join(tempDir, 'invalid-palette.yaml');
			await fs.writeFile(unknownPath, 'unknown:\n  token: value\n');
			await fs.writeFile(invalidPalettePath, 'invalid:\n  token: value\n');

			const result = await collectDependencyDictionary(
				makeConfig([
					{ kind: 'future', ref: unknownPath },
					{ kind: 'palette', ref: invalidPalettePath },
				]),
				tempDir,
			);

			expect(result.issues).toEqual([]);
			expect(Object.keys(result.dict)).toEqual(['unknown', 'invalid']);
			expect(result.loaded).toHaveLength(2);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('loads namespaces that match inherited object property names', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-object-key-'),
		);
		try {
			const resourcePath = path.join(tempDir, 'constructor.yaml');
			await fs.writeFile(
				resourcePath,
				'constructor:\n  token:\n    $value: value\n',
			);

			const result = await collectDependencyDictionary(
				makeConfig([{ kind: 'custom', ref: resourcePath }]),
				tempDir,
			);

			expect(result.issues).toEqual([]);
			expect(Object.hasOwn(result.dict, 'constructor')).toBe(true);
			const constructorEntry = Object.entries(result.dict).find(
				([namespace]) => namespace === 'constructor',
			)?.[1];
			expect(constructorEntry?.data.token).toEqual({ $value: 'value' });
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
