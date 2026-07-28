import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateDeclaredResources } from '../src/core/doctor/resource-validator.ts';
import type { DesignTokenBuildConfig } from '../src/types/index.ts';

const rootDir = path.resolve(__dirname, '..');

function makeConfig(
	resources: DesignTokenBuildConfig['resources'] = [],
): Pick<DesignTokenBuildConfig, 'resources'> {
	return { resources };
}

describe('validateDeclaredResources', () => {
	test('accepts empty declarations and valid palette and dimension resources', async () => {
		const empty = await validateDeclaredResources(makeConfig(), rootDir);
		expect(empty).toMatchObject({ ok: true });

		const result = await validateDeclaredResources(
			makeConfig([
				{ kind: 'palette', ref: 'leonardo' },
				{ kind: 'dimension', ref: 'wave' },
			]),
			rootDir,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.dictionary.dict.leonardo).toBeDefined();
		expect(result.dictionary.dict.wave).toBeDefined();
	});

	test('rejects an unknown kind before loading any declaration', async () => {
		const result = await validateDeclaredResources(
			makeConfig([
				{ kind: 'custom', ref: './missing.yaml' },
				{ kind: 'future', ref: './also-missing.yaml' },
			]),
			rootDir,
		);

		expect(result).toEqual({
			ok: false,
			message: 'Unsupported resource kind: future',
		});
	});

	test('rejects an invalid custom extension before loading any declaration', async () => {
		const result = await validateDeclaredResources(
			makeConfig([
				{ kind: 'custom', ref: './missing.yaml' },
				{ kind: 'custom', ref: './tokens.txt' },
			]),
			rootDir,
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain('Unsupported custom resource format');
	});

	test('rejects a declaration load issue', async () => {
		const result = await validateDeclaredResources(
			makeConfig([{ kind: 'custom', ref: './missing.yaml' }]),
			rootDir,
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain('Resource not found');
	});

	test('rejects duplicate namespaces', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-doctor-dup-'),
		);
		try {
			const resources: DesignTokenBuildConfig['resources'] = [];
			for (const name of ['first', 'second', 'third']) {
				const ref = `./${name}.yaml`;
				await fs.writeFile(
					path.join(tempDir, `${name}.yaml`),
					'shared:\n  token:\n    $value: value\n',
				);
				resources.push({ kind: 'custom', ref });
			}

			const result = await validateDeclaredResources(
				makeConfig(resources),
				tempDir,
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.message).toContain('Duplicate namespace "shared"');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test.each([
		['palette', 'Palette'],
		['dimension', 'Dimension'],
	] as const)('rejects an invalid %s schema after loading', async (kind, label) => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), `wave-doctor-${kind}-`),
		);
		try {
			const resourcePath = path.join(tempDir, `${kind}.yaml`);
			await fs.writeFile(resourcePath, 'invalid:\n  token: value\n');

			const result = await validateDeclaredResources(
				makeConfig([{ kind, ref: resourcePath }]),
				tempDir,
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.message).toContain(`${label} schema error:`);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('reports load issues before loaded resource schema issues', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-doctor-order-'),
		);
		try {
			const resourcePath = path.join(tempDir, 'palette.yaml');
			await fs.writeFile(resourcePath, 'invalid:\n  token: value\n');

			const result = await validateDeclaredResources(
				makeConfig([
					{ kind: 'palette', ref: resourcePath },
					{ kind: 'custom', ref: './missing.yaml' },
				]),
				tempDir,
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.message).toContain('Resource not found');
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
