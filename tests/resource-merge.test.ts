import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	buildDependencyDictionary,
	collectDependencyDictionary,
} from '../src/core/pipeline/theme-pipeline.ts';
import type { ParsedThemefile } from '../src/types/index.ts';

const rootDir = path.resolve(__dirname, '..');

function makeParsed(
	resources: ParsedThemefile['resources'] = [],
): ParsedThemefile {
	return { THEME: 'test', PARAMETER: {}, groups: [], resources };
}

describe('collectDependencyDictionary', () => {
	test('collects an empty dictionary without issues', async () => {
		const result = await collectDependencyDictionary(makeParsed(), rootDir);

		expect(result.dict).toEqual({});
		expect(result.loaded).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	test('records a missing declaration without failing collection', async () => {
		const result = await collectDependencyDictionary(
			makeParsed([{ kind: 'custom', ref: './missing.yaml' }]),
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
			const parsed = makeParsed(
				['first', 'second', 'third'].map((name) => ({
					kind: 'custom',
					ref: `./${name}.yaml`,
				})),
			);

			const result = await collectDependencyDictionary(parsed, tempDir);

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
				makeParsed([
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
				makeParsed([{ kind: 'custom', ref: resourcePath }]),
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

describe('buildDependencyDictionary', () => {
	test('accepts empty declarations and a single valid kind', async () => {
		const empty = await buildDependencyDictionary(makeParsed(), rootDir);
		expect('error' in empty).toBe(false);

		const paletteOnly = await buildDependencyDictionary(
			makeParsed([{ kind: 'palette', ref: 'leonardo' }]),
			rootDir,
		);
		expect('error' in paletteOnly).toBe(false);
		if (!('error' in paletteOnly)) {
			expect(paletteOnly.dict.leonardo).toBeDefined();
			expect(paletteOnly.loaded[0]?.namespace).toBe('leonardo');
		}
	});

	test('builds a strict dictionary from palette and dimension declarations', async () => {
		const result = await buildDependencyDictionary(
			makeParsed([
				{ kind: 'palette', ref: 'leonardo' },
				{ kind: 'dimension', ref: 'wave' },
			]),
			rootDir,
		);

		expect('error' in result).toBe(false);
		if ('error' in result) return;
		expect(result.dict.leonardo).toBeDefined();
		expect(result.dict.wave).toBeDefined();
	});

	test('strict validation rejects a declaration load issue', async () => {
		const result = await buildDependencyDictionary(
			makeParsed([{ kind: 'custom', ref: './missing.yaml' }]),
			rootDir,
		);

		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.message).toContain('Resource not found');
		}
	});

	test('strict validation rejects an unknown kind before loading', async () => {
		const result = await buildDependencyDictionary(
			makeParsed([
				{ kind: 'custom', ref: './missing.yaml' },
				{ kind: 'future', ref: './also-missing.yaml' },
			]),
			rootDir,
		);

		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.message).toBe('Unsupported resource kind: future');
		}
	});

	test('strict validation rejects an invalid custom extension before loading', async () => {
		const result = await buildDependencyDictionary(
			makeParsed([
				{ kind: 'custom', ref: './missing.yaml' },
				{ kind: 'custom', ref: './tokens.txt' },
			]),
			rootDir,
		);

		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.message).toContain(
				'Unsupported custom resource format',
			);
		}
	});

	test('strict validation rejects a third declaration of an ambiguous namespace', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-strict-dup-'),
		);
		try {
			const resources = [] as ParsedThemefile['resources'];
			for (const name of ['first', 'second', 'third']) {
				const ref = `./${name}.yaml`;
				await fs.writeFile(
					path.join(tempDir, `${name}.yaml`),
					'shared:\n  token:\n    $value: value\n',
				);
				resources.push({ kind: 'custom', ref });
			}

			const result = await buildDependencyDictionary(
				makeParsed(resources),
				tempDir,
			);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error.message).toContain('Duplicate namespace "shared"');
			}
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('strict validation rejects an invalid palette schema after loading', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-invalid-palette-'),
		);
		try {
			const resourcePath = path.join(tempDir, 'palette.yaml');
			await fs.writeFile(resourcePath, 'invalid:\n  token: value\n');

			const result = await buildDependencyDictionary(
				makeParsed([{ kind: 'palette', ref: resourcePath }]),
				tempDir,
			);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error.message).toContain('Palette schema error:');
			}
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('strict validation reports load issues before kind schema issues', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-strict-order-'),
		);
		try {
			const resourcePath = path.join(tempDir, 'palette.yaml');
			await fs.writeFile(resourcePath, 'invalid:\n  token: value\n');

			const result = await buildDependencyDictionary(
				makeParsed([
					{ kind: 'palette', ref: resourcePath },
					{ kind: 'custom', ref: './missing.yaml' },
				]),
				tempDir,
			);

			expect('error' in result).toBe(true);
			if ('error' in result) {
				expect(result.error.message).toContain('Resource not found');
			}
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
