import { expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTokenDomain } from '../benchmarks/domains/token.ts';

test('token attribution keeps warmup out of SUM aggregates', async () => {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), 'wave-p1b-attribution-'),
	);
	try {
		const result = await runTokenDomain('token-multi-profile', {
			repoRoot: process.cwd(),
			tmpRoot: path.join(root, 'tmp'),
			runId: 'p1b-attribution-test',
			iterations: 2,
			warmup: 1,
		});
		expect(result.status).toBe('success');
		expect(result.cacheAttribution).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					layer: 'loadResource',
					hits: expect.any(Number),
				}),
				expect.objectContaining({
					layer: 'dictionary',
					hits: expect.any(Number),
				}),
				expect.objectContaining({ layer: 'parse', hits: expect.any(Number) }),
				expect.objectContaining({ layer: 'color', hits: expect.any(Number) }),
			]),
		);
		expect(result.stats?.samplesMs).toHaveLength(2);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
