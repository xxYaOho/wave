#!/usr/bin/env bun
import * as path from 'node:path';
import { createQualityRunId, runQualitySuite } from './domains/suite.ts';
import type { BenchmarkDomain } from './shared/types.ts';

interface CliOptions {
	iterations: number;
	warmup: number;
	runId: string;
	tmpRoot?: string;
	resultsDir?: string;
	domains?: BenchmarkDomain[];
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		iterations: 3,
		warmup: 1,
		runId: createQualityRunId(),
	};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === '--iterations' && next) {
			options.iterations = parsePositiveInteger(next, '--iterations');
			index += 1;
		} else if (arg === '--warmup' && next) {
			options.warmup = parseNonNegativeInteger(next, '--warmup');
			index += 1;
		} else if (arg === '--run-id' && next) {
			options.runId = next;
			index += 1;
		} else if (arg === '--tmp-root' && next) {
			options.tmpRoot = path.resolve(next);
			index += 1;
		} else if (arg === '--results-dir' && next) {
			options.resultsDir = path.resolve(next);
			index += 1;
		} else if (arg === '--domain' && next) {
			options.domains = [...(options.domains ?? []), parseDomain(next)];
			index += 1;
		} else if (arg === '--help' || arg === '-h') {
			console.log(USAGE);
			process.exit(0);
		}
	}
	return options;
}

const USAGE = `Usage: bun benchmarks/run.ts [options]

Options:
  --iterations <n>  measured samples per domain (default: 3)
  --warmup <n>      warmup samples per domain (default: 1)
  --run-id <id>     stable run identifier
  --domain <name>   run one domain; repeatable
  --tmp-root <dir>  isolated benchmark workspace
  --results-dir <dir> report output directory
  -h, --help        show this help`;

try {
	const options = parseArgs(process.argv.slice(2));
	const run = await runQualitySuite(options);
	console.log(`Quality Harness report: ${run.reportPath}`);
	for (const testCase of run.report.cases) {
		const mean = testCase.stats?.meanMs;
		const label = mean === undefined ? 'n/a' : `${mean.toFixed(2)}ms`;
		console.log(
			`${testCase.status === 'success' ? 'ok' : 'fail'} ${testCase.id} mean=${label}`,
		);
	}
	if (run.report.cases.some((testCase) => testCase.status !== 'success')) {
		process.exitCode = 1;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 2;
}

function parsePositiveInteger(value: string, label: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`${label} must be a positive integer`);
	}
	return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`${label} must be a non-negative integer`);
	}
	return parsed;
}

function parseDomain(value: string): BenchmarkDomain {
	const domains: BenchmarkDomain[] = [
		'cold-start',
		'token-single-profile',
		'token-multi-profile',
		'night',
		'compress',
		'manual',
	];
	if (!domains.includes(value as BenchmarkDomain)) {
		throw new Error(`Unknown quality benchmark domain: ${value}`);
	}
	return value as BenchmarkDomain;
}
