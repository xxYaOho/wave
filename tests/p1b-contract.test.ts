import { describe, expect, test } from 'bun:test';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { calculateStats } from '../benchmarks/shared/stats.ts';
import {
	type ComposeP1bOptions,
	composeP1bStatistics,
} from '../scripts/compose-p1b-statistics.ts';

const domains = [
	'token-single-profile',
	'token-multi-profile',
	'night',
] as const;
const nodeVersion = process.version;
const bunVersion = Bun.version;
const lockfileHash = crypto
	.createHash('sha256')
	.update('lockfile')
	.digest('hex');

function paired(key: string, ri = 0.2) {
	return {
		key,
		metric: 'p50Ms' as const,
		unit: 'ms' as const,
		pairedDeltasMs: [-2, -2],
		medianRelativeImprovement: ri,
		p95RelativeRegression: 0,
		baselineSampleCount: 30,
		currentSampleCount: 30,
		positiveBaselineCount: 30,
		winCount: 2,
		lossCount: 0,
		tieCount: 0,
		excludedNonPositiveBaseline: 0,
		method: 'paired-index' as const,
	};
}

function report(runId: string, includeFailure = false) {
	return {
		schemaVersion: 2,
		name: 'quality',
		runId,
		mode: 'default',
		createdAt: '2026-11-13T00:00:00.000Z',
		node: nodeVersion,
		bun: bunVersion,
		environment: {
			runtime: 'bun',
			node: nodeVersion,
			bun: bunVersion,
			platform: process.platform,
			arch: process.arch,
			cpuCount: 1,
			memoryBytes: 1,
			cwd: process.cwd(),
		},
		cases: domains.map((domain) => ({
			id: domain,
			caseVersion: 1,
			mode: 'default',
			entryKind: 'main-config',
			domain,
			status: includeFailure && domain === 'night' ? 'failure' : 'success',
			iterations: 30,
			warmup: 3,
			tokensCount: 1,
			outputFiles: 1,
			outputBytes: 1,
			outputFileNames: ['tokens.json'],
			files: [],
			resources: [],
			phases: {
				prepareMs: 0,
				loadMs: 0,
				resourceMs: 0,
				groupPassMs: 0,
				processMs: 0,
				generateMs: 0,
				pipelineDurationMs: 1,
				totalWallMs: 1,
			},
			stats: {
				meanMs: 2,
				minMs: 1,
				maxMs: 3,
				p50Ms: 2,
				p95Ms: 3,
				samplesMs: Array.from({ length: 30 }, (_, index) => index + 1),
			},
			cacheAttribution:
				domain === 'token-multi-profile'
					? [
							{ layer: 'dictionary', hits: 1, misses: 1, degraded: 0 },
							{ layer: 'loadResource', hits: 1, misses: 1, degraded: 0 },
						]
					: [],
		})),
	};
}

async function writeEvidence(
	root: string,
	failure = false,
): Promise<ComposeP1bOptions> {
	const preReport = report('pre-run');
	const postReport = report('post-run', failure);
	const comparison = {
		ok: true,
		baseRunId: 'pre-run',
		currentRunId: 'post-run',
		thresholdPercent: 15,
		cases: domains.map((domain) => ({
			id: domain,
			comparisonKey: domain,
			domain,
			status: 'improved',
			paired: paired(domain, domain === 'token-single-profile' ? 0 : 0.2),
			notes: [],
		})),
	};
	await fs.writeFile(
		path.join(root, 'pre.json'),
		`${JSON.stringify(preReport)}\n`,
	);
	await fs.writeFile(
		path.join(root, 'post.json'),
		`${JSON.stringify(postReport)}\n`,
	);
	await fs.writeFile(
		path.join(root, 'comparison.json'),
		`${JSON.stringify(comparison)}\n`,
	);
	for (const [runId, anchor] of [
		['pre-run', 'a'.repeat(40)],
		['post-run', 'b'.repeat(40)],
	] as const) {
		await fs.writeFile(
			path.join(root, `${runId}.capture-manifest.json`),
			JSON.stringify({
				runId,
				anchorArg: runId === 'pre-run' ? '432453f' : 'HEAD',
				anchorCommit: anchor,
				headCommit: anchor,
				iterations: 30,
				warmup: 3,
				lockfileHash,
				sourceDir: root,
				runtime: {
					bun: bunVersion,
					node: nodeVersion,
					platform: process.platform,
					arch: process.arch,
				},
				hostLoad: { load1mStart: '1.0', load1mEnd: '1.0', note: 'test' },
				report: `${runId === 'pre-run' ? 'pre' : 'post'}.json`,
			}),
		);
	}
	return {
		evidenceDir: root,
		preReport: 'pre.json',
		postReport: 'post.json',
		comparison: 'comparison.json',
		out: 'statistics.json',
	};
}

describe('P1b contract', () => {
	test('calculates nearest-rank p50 while preserving empty semantics', () => {
		expect(calculateStats([])).toBeUndefined();
		expect(calculateStats([3, 1, 2])?.p50Ms).toBe(2);
		expect(calculateStats([4, 1, 3, 2])?.p50Ms).toBe(2);
		expect(calculateStats([2, 2, 8, 9, 10])?.p50Ms).toBe(8);
	});

	test('assembles a retained statistics document with fixed rule rows', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-p1b-contract-'));
		try {
			const options = await writeEvidence(root);
			const statistics = await composeP1bStatistics(options);
			expect(statistics.verdict).toBe('retained');
			expect(statistics.cases).toHaveLength(3);
			expect(
				statistics.cases.find((item) => item.domain === 'token-multi-profile')
					?.ruleChecks,
			).toHaveLength(4);
			expect(statistics.globalRuleChecks.map((item) => item.rule)).toEqual([
				'RI-non-null',
				'safety-floor',
			]);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('invalid status wins over rule evaluation', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-p1b-invalid-'));
		try {
			const options = await writeEvidence(root, true);
			const statistics = await composeP1bStatistics(options);
			expect(statistics.verdict).toBe('invalid');
			expect(statistics.validity.sampleCountsExact).toBe(false);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
