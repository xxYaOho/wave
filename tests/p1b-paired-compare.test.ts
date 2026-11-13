import { expect, test } from 'bun:test';
import { buildPairedComparisonContract } from '../benchmarks/shared/compare.ts';
import type { BenchmarkCaseResult } from '../benchmarks/shared/types.ts';

function benchmarkCase(samplesMs: number[]): BenchmarkCaseResult {
	return {
		id: 'token',
		caseVersion: 1,
		mode: 'default',
		entryKind: 'main-config',
		status: 'success',
		iterations: samplesMs.length,
		warmup: 0,
		tokensCount: 0,
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
			pipelineDurationMs: 0,
			totalWallMs: 0,
		},
		stats: {
			meanMs:
				samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length,
			minMs: Math.min(...samplesMs),
			maxMs: Math.max(...samplesMs),
			p50Ms: samplesMs[Math.floor(samplesMs.length / 2)] ?? null,
			p95Ms: Math.max(...samplesMs),
			samplesMs,
		},
	};
}

test('paired RI uses -delta/b and arithmetic median for even samples', () => {
	const result = buildPairedComparisonContract(
		'token',
		benchmarkCase([10, 20, 0, -1]),
		benchmarkCase([8, 15, 2, 1]),
	);
	expect(result.method).toBe('paired-index');
	expect(result.pairedDeltasMs).toEqual([-2, -5, 2, 2]);
	expect(result.winCount).toBe(2);
	expect(result.lossCount).toBe(2);
	expect(result.excludedNonPositiveBaseline).toBe(2);
	expect(result.medianRelativeImprovement).toBeCloseTo(0.225, 8);
});

test('non-finite or unpaired samples use the explicit fallback shape', () => {
	const result = buildPairedComparisonContract(
		'token',
		benchmarkCase([1, Number.NaN]),
		benchmarkCase([1, 2]),
	);
	expect(result).toMatchObject({
		method: 'aggregate-fallback',
		pairedDeltasMs: [],
		medianRelativeImprovement: null,
		p95RelativeRegression: null,
		positiveBaselineCount: 0,
		winCount: 0,
		lossCount: 0,
		tieCount: 0,
	});
});
