import * as path from 'node:path';
import {
	type BenchmarkSuiteReport,
	writeSuiteReport,
} from '../shared/report.ts';
import { calculateStats } from '../shared/stats.ts';
import type { QualityHarnessMode } from '../shared/types.ts';
import { getDesignTokenCases } from './cases.ts';
import { checkDesignTokenGenerateThemeEquivalence } from './equivalence.ts';
import { runDesignTokenBenchmarkCase } from './runner.ts';

export interface RunDesignTokenSuiteOptions {
	mode: QualityHarnessMode;
	runId: string;
	iterations: number;
	warmup: number;
	tmpRoot?: string;
	resultsDir?: string;
	repoRoot?: string;
	equivalence?: boolean;
}

export interface DesignTokenSuiteRun {
	report: BenchmarkSuiteReport;
	reportPath: string;
}

export function createRunId(prefix: string = 'design-token'): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return `${prefix}-${timestamp}`;
}

export async function runDesignTokenSuite(
	options: RunDesignTokenSuiteOptions,
): Promise<DesignTokenSuiteRun> {
	const repoRoot = options.repoRoot ?? process.cwd();
	const tmpRoot = options.tmpRoot ?? path.join(repoRoot, 'benchmarks/.tmp');
	const resultsDir =
		options.resultsDir ?? path.join(repoRoot, 'benchmarks/.results');
	const cases = getDesignTokenCases(options.mode);
	const results = [];

	for (const testCase of cases) {
		for (let i = 0; i < options.warmup; i++) {
			await runDesignTokenBenchmarkCase(testCase, {
				mode: options.mode,
				runId: `${options.runId}-warmup`,
				iteration: i,
				tmpRoot,
				repoRoot,
			});
		}

		const iterations = [];
		for (let i = 0; i < options.iterations; i++) {
			const result = await runDesignTokenBenchmarkCase(testCase, {
				mode: options.mode,
				runId: options.runId,
				iteration: i,
				tmpRoot,
				repoRoot,
			});
			iterations.push(result);
		}

		const primary = iterations.at(-1);
		if (!primary) continue;
		const caseResult = {
			...primary,
			iterations: options.iterations,
			warmup: options.warmup,
			stats: calculateStats(
				iterations
					.filter((result) => result.status === 'success')
					.map((result) => result.phases.pipelineDurationMs),
			),
		};

		if (options.equivalence) {
			const equivalence = await checkDesignTokenGenerateThemeEquivalence(
				testCase,
				`${options.runId}-equivalence-${testCase.id}`,
				repoRoot,
			);
			if (!equivalence.ok) {
				caseResult.status = 'failure';
				caseResult.error = `generateTheme equivalence failed: ${JSON.stringify(equivalence.issues)}`;
			}
		}

		results.push(caseResult);
	}

	const report: BenchmarkSuiteReport = {
		schemaVersion: 1,
		name: 'design-token',
		runId: options.runId,
		mode: options.mode,
		createdAt: new Date().toISOString(),
		node: process.version,
		bun: Bun.version,
		cases: results,
	};
	const reportPath = await writeSuiteReport(report, resultsDir);
	return { report, reportPath };
}
