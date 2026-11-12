import { performance } from 'node:perf_hooks';
import { getDesignTokenCases } from '../design-token/cases.ts';
import { runDesignTokenBenchmarkCase } from '../design-token/runner.ts';
import { collectEnvironmentMetadata } from '../shared/environment.ts';
import { calculateStats } from '../shared/stats.ts';
import type {
	BenchmarkCaseResult,
	BenchmarkOperationContract,
	QualityHarnessMode,
} from '../shared/types.ts';

export interface TokenDomainOptions {
	repoRoot: string;
	tmpRoot: string;
	runId: string;
	iterations: number;
	warmup: number;
	mode?: QualityHarnessMode;
}

export type TokenDomain =
	| 'token-single-profile'
	| 'token-multi-profile'
	| 'night';

export async function runTokenDomain(
	domain: TokenDomain,
	options: TokenDomainOptions,
): Promise<BenchmarkCaseResult> {
	const testCase = tokenCaseForDomain(domain);
	const operation = tokenOperation(domain, testCase.id);
	const environment = collectEnvironmentMetadata(options.repoRoot);
	let sequence = 0;
	let primary: BenchmarkCaseResult | undefined;
	const samples: number[] = [];
	const traceSums = new Map<string, { hits: number; misses: number; degraded: number }>();

	const runOnce = async (): Promise<void> => {
		const started = performance.now();
		const result = await runDesignTokenBenchmarkCase(testCase, {
			mode: options.mode ?? 'default',
			runId: `${options.runId}-${domain}-${sequence}`,
			iteration: sequence,
			tmpRoot: options.tmpRoot,
			repoRoot: options.repoRoot,
		});
		sequence += 1;
		if (result.status !== 'success') {
			throw new Error(result.error ?? `${domain} benchmark failed`);
		}
		primary = result;
		samples.push(performance.now() - started);
		if (result.cacheAttribution) {
			for (const trace of result.cacheAttribution) {
				const sum = traceSums.get(trace.layer) ?? { hits: 0, misses: 0, degraded: 0 };
				sum.hits += trace.hits;
				sum.misses += trace.misses;
				sum.degraded += trace.degraded;
				traceSums.set(trace.layer, sum);
			}
		}
	};

	try {
		for (let i = 0; i < options.warmup; i++) await runOnce();
		samples.length = 0;
		traceSums.clear();
		primary = undefined;
		for (let i = 0; i < options.iterations; i++) await runOnce();
	} catch (error) {
		return failureResult(
			{
				id: domain,
				caseVersion: 1,
				mode: options.mode ?? 'default',
				entryKind: 'main-config',
				domain,
				operation,
				environment,
				status: 'failure',
				iterations: options.iterations,
				warmup: options.warmup,
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
				stats: calculateStats(samples),
			},
			error,
		);
	}

	const result =
		primary ??
		failureResult({
			id: domain,
			caseVersion: 1,
			mode: options.mode ?? 'default',
			entryKind: 'main-config',
			domain,
			operation,
			environment,
			status: 'failure',
			iterations: options.iterations,
			warmup: options.warmup,
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
		});
	result.id = domain;
	result.domain = domain;
	result.operation = operation;
	result.environment = environment;
	result.iterations = options.iterations;
	result.warmup = options.warmup;
	result.stats = calculateStats(samples);
	result.phases.totalWallMs = result.stats?.meanMs ?? 0;
	result.cacheAttribution = [...traceSums.entries()].map(([layer, sums]) => ({
		layer: layer as 'loadResource' | 'dictionary' | 'parse' | 'color',
		...sums,
	}));
	return result;
}

function tokenCaseForDomain(domain: TokenDomain) {
	const sourceId =
		domain === 'token-single-profile' ? 'standard' : 'config-group-profiles';
	const source = getDesignTokenCases('default').find(
		(testCase) => testCase.id === sourceId,
	);
	if (!source) throw new Error(`Missing fixed token fixture: ${sourceId}`);
	if (domain === 'token-single-profile') return source;
	return {
		...source,
		includeProfiles: domain === 'token-multi-profile',
		includeNight: domain === 'night',
	};
}

function tokenOperation(
	domain: TokenDomain,
	fixtureId: string,
): BenchmarkOperationContract {
	const parameters = {
		fixture: fixtureId,
		profiles: domain === 'token-multi-profile' ? 'all' : 'single',
		night: domain === 'night',
	};
	return {
		name: domain,
		domain,
		action: 'token-build',
		parameters,
		timing: {
			start: 'operation-start',
			end: 'operation-complete',
			metric: 'durationMs',
			completion: 'result-returned',
		},
		comparison: {
			key: domain,
			metric: 'meanMs',
			unit: 'ms',
			direction: 'lower-is-better',
		},
		successCondition: 'token output files are generated from the fixed fixture',
	};
}

function failureResult(
	result: BenchmarkCaseResult,
	error?: unknown,
): BenchmarkCaseResult {
	result.status = 'failure';
	result.error = error instanceof Error ? error.message : String(error ?? '');
	return result;
}
