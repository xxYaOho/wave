import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runQualitySuite } from '../benchmarks/domains/suite.ts';
import { compareSuiteReports } from '../benchmarks/shared/compare.ts';
import {
	type BenchmarkSuiteReport,
	readSuiteReport,
} from '../benchmarks/shared/report.ts';

describe('Quality Harness observation contract', () => {
	test('reads schemaVersion 1 reports and aligns new reports by comparison key', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-qh-contract-'),
		);
		const legacyPath = path.join(tempDir, 'legacy.json');
		const legacy: BenchmarkSuiteReport = {
			schemaVersion: 1,
			name: 'design-token',
			runId: 'legacy',
			mode: 'smoke',
			createdAt: '2026-11-11T00:00:00.000Z',
			node: 'v26.0.0',
			bun: '1.4.0',
			cases: [
				{
					id: 'legacy-case',
					caseVersion: 1,
					mode: 'smoke',
					entryKind: 'main-config',
					status: 'success',
					iterations: 1,
					warmup: 0,
					tokensCount: 1,
					outputFiles: 0,
					outputBytes: 0,
					outputFileNames: [],
					files: [],
					resources: [],
					phases: {
						prepareMs: 0,
						loadMs: 0,
						resourceMs: 0,
						groupPassMs: 0,
						processMs: 0,
						generateMs: 0,
						pipelineDurationMs: 2,
						totalWallMs: 2,
					},
					stats: { meanMs: 2, minMs: 2, maxMs: 2, p95Ms: 2 },
				},
			],
		};
		await fs.writeFile(legacyPath, `${JSON.stringify(legacy)}\n`, 'utf-8');
		await expect(readSuiteReport(legacyPath)).resolves.toMatchObject({
			schemaVersion: 1,
			name: 'design-token',
		});

		const makeCase = (id: string, key: string) => ({
			...legacy.cases[0]!,
			id,
			operation: {
				name: key,
				domain: 'compress' as const,
				action: 'fixture',
				parameters: {},
				timing: {
					start: 'operation-start' as const,
					end: 'operation-complete' as const,
					metric: 'durationMs' as const,
					completion: 'result-returned' as const,
				},
				comparison: {
					key,
					metric: 'meanMs' as const,
					unit: 'ms' as const,
					direction: 'lower-is-better' as const,
				},
				successCondition: 'fixture completes',
			},
		});
		const base = {
			...legacy,
			schemaVersion: 1 as const,
			cases: [makeCase('base-id', 'compress')],
		};
		const current = {
			...legacy,
			schemaVersion: 2 as const,
			cases: [makeCase('current-id', 'compress')],
		};
		const comparison = compareSuiteReports(base, current);
		expect(comparison.ok).toBe(true);
		expect(comparison.cases).toHaveLength(1);
		expect(comparison.cases[0]?.comparisonKey).toBe('compress');
	});

	test('runs all six domains with distribution, environment, and timing contracts', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-qh-six-'));
		try {
			const run = await runQualitySuite({
				runId: 'contract-six',
				tmpRoot: path.join(tempDir, 'tmp'),
				resultsDir: path.join(tempDir, 'results'),
				iterations: 1,
				warmup: 0,
			});
			expect(run.report.schemaVersion).toBe(2);
			expect(run.report.cases.map((item) => item.domain)).toEqual([
				'cold-start',
				'token-single-profile',
				'token-multi-profile',
				'night',
				'compress',
				'manual',
			]);
			expect(run.report.cases.every((item) => item.status === 'success')).toBe(
				true,
			);
			expect(
				run.report.cases.every(
					(item) =>
						item.operation?.comparison.key &&
						item.operation.timing.end &&
						(item.stats?.samplesMs?.length ?? 0) > 0 &&
						item.environment?.bun,
				),
			).toBe(true);
			expect(
				run.report.cases.find((item) => item.domain === 'manual')?.operation
					?.timing.end,
			).toBe('readiness-signal');
			expect(
				run.report.cases.find((item) => item.domain === 'cold-start')
					?.measurements,
			).toHaveLength(2);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});
