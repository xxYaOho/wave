import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

describe('resource update security', () => {
	test('Tailwind adapter does not execute downloaded source text', async () => {
		const source = await fs.readFile(
			path.join(rootDir, 'src/core/resources/tailwind.ts'),
			'utf-8',
		);

		expect(source).not.toContain('new Function');
		expect(source).not.toContain('eval(');
	});
});
