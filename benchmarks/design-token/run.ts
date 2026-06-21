#!/usr/bin/env bun
import type { QualityHarnessMode } from '../shared/types.ts';
import { createRunId, runDesignTokenSuite } from './suite.ts';

interface CliOptions {
	mode: QualityHarnessMode;
	iterations: number;
	warmup: number;
	runId: string;
	equivalence: boolean;
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		mode: 'smoke',
		iterations: 1,
		warmup: 0,
		runId: createRunId(),
		equivalence: true,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === '--mode' && next) {
			options.mode = next as QualityHarnessMode;
			i += 1;
		} else if (arg === '--iterations' && next) {
			options.iterations = Number.parseInt(next, 10);
			i += 1;
		} else if (arg === '--warmup' && next) {
			options.warmup = Number.parseInt(next, 10);
			i += 1;
		} else if (arg === '--run-id' && next) {
			options.runId = next;
			i += 1;
		} else if (arg === '--no-equivalence') {
			options.equivalence = false;
		}
	}

	return options;
}

const options = parseArgs(process.argv.slice(2));
const result = await runDesignTokenSuite(options);
const failed = result.report.cases.filter(
	(testCase) => testCase.status !== 'success',
);

console.log(`Quality Harness report: ${result.reportPath}`);
for (const testCase of result.report.cases) {
	const mean = testCase.stats?.meanMs;
	const meanLabel = mean === undefined ? 'n/a' : `${mean.toFixed(2)}ms`;
	console.log(
		`${testCase.status === 'success' ? 'ok' : 'fail'} ${testCase.id} mean=${meanLabel} files=${testCase.outputFiles} bytes=${testCase.outputBytes}`,
	);
}

if (failed.length > 0) {
	console.error(`${failed.length} benchmark case(s) failed`);
	process.exit(1);
}
