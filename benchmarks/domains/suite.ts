import * as path from 'node:path';
import { collectEnvironmentMetadata } from '../shared/environment.ts';
import {
	type BenchmarkSuiteReport,
	writeSuiteReport,
} from '../shared/report.ts';
import type {
	BenchmarkCaseResult,
	BenchmarkDomain,
	QualityHarnessMode,
} from '../shared/types.ts';
import { runColdStartDomain } from './cold-start.ts';
import { runCompressDomain } from './compress.ts';
import { runManualDomain } from './manual.ts';
import { runTokenDomain } from './token.ts';

export interface RunQualitySuiteOptions {
	repoRoot?: string;
	tmpRoot?: string;
	resultsDir?: string;
	runId?: string;
	iterations?: number;
	warmup?: number;
	mode?: QualityHarnessMode;
	domains?: BenchmarkDomain[];
}

export interface QualitySuiteRun {
	report: BenchmarkSuiteReport;
	reportPath: string;
}

export function createQualityRunId(prefix = 'quality') {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return `${prefix}-${timestamp}`;
}

export async function runQualitySuite(
	options: RunQualitySuiteOptions = {},
): Promise<QualitySuiteRun> {
	const repoRoot = options.repoRoot ?? process.cwd();
	const tmpRoot = options.tmpRoot ?? path.join(repoRoot, 'benchmarks/.tmp');
	const resultsDir =
		options.resultsDir ?? path.join(repoRoot, 'benchmarks/.results');
	const runId = options.runId ?? createQualityRunId();
	const iterations = options.iterations ?? 3;
	const warmup = options.warmup ?? 1;
	const mode = options.mode ?? 'default';
	const requested = new Set(options.domains);
	const include = (domain: BenchmarkDomain) =>
		requested.size === 0 || requested.has(domain);
	const results: BenchmarkCaseResult[] = [];

	if (include('cold-start')) {
		results.push(
			await runSafely(() =>
				runColdStartDomain({
					repoRoot,
					tmpRoot,
					runId,
					iterations,
					warmup,
					mode,
				}),
			),
		);
	}
	if (include('token-single-profile')) {
		results.push(
			await runSafely(() =>
				runTokenDomain('token-single-profile', {
					repoRoot,
					tmpRoot,
					runId,
					iterations,
					warmup,
					mode,
				}),
			),
		);
	}
	if (include('token-multi-profile')) {
		results.push(
			await runSafely(() =>
				runTokenDomain('token-multi-profile', {
					repoRoot,
					tmpRoot,
					runId,
					iterations,
					warmup,
					mode,
				}),
			),
		);
	}
	if (include('night')) {
		results.push(
			await runSafely(() =>
				runTokenDomain('night', {
					repoRoot,
					tmpRoot,
					runId,
					iterations,
					warmup,
					mode,
				}),
			),
		);
	}
	if (include('compress')) {
		results.push(
			await runSafely(() =>
				runCompressDomain({
					repoRoot,
					tmpRoot,
					runId,
					iterations,
					warmup,
					mode,
				}),
			),
		);
	}
	if (include('manual')) {
		results.push(
			await runSafely(() =>
				runManualDomain({
					repoRoot,
					tmpRoot,
					runId,
					iterations,
					warmup,
					mode,
				}),
			),
		);
	}

	const report: BenchmarkSuiteReport = {
		schemaVersion: 2,
		name: 'quality',
		runId,
		mode,
		createdAt: new Date().toISOString(),
		node: process.version,
		bun: Bun.version,
		environment: collectEnvironmentMetadata(repoRoot),
		cases: results,
	};
	const reportPath = await writeSuiteReport(report, resultsDir);
	return { report, reportPath };
}

async function runSafely(
	run: () => Promise<BenchmarkCaseResult>,
): Promise<BenchmarkCaseResult> {
	try {
		return await run();
	} catch (error) {
		return {
			id: 'unknown',
			caseVersion: 1,
			mode: 'default',
			entryKind: 'fixture',
			status: 'failure',
			error: error instanceof Error ? error.message : String(error),
			iterations: 0,
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
		};
	}
}
