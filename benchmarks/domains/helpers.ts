import { collectEnvironmentMetadata } from '../shared/environment.ts';
import { calculateStats } from '../shared/stats.ts';
import type {
	BenchmarkCaseResult,
	BenchmarkOperationContract,
	EnvironmentMetadata,
	PhaseDurations,
	QualityHarnessMode,
} from '../shared/types.ts';

export interface MeasuredSample {
	durationMs: number;
	files?: BenchmarkCaseResult['files'];
	tokensCount?: number;
	outputFiles?: number;
	outputBytes?: number;
}

export interface MeasuredCaseOptions {
	id: string;
	caseVersion?: number;
	mode?: QualityHarnessMode;
	entryKind: BenchmarkCaseResult['entryKind'];
	operation: BenchmarkOperationContract;
	environment?: EnvironmentMetadata;
	iterations: number;
	warmup: number;
	measure: () => Promise<MeasuredSample>;
}

export interface SampledCase {
	result: BenchmarkCaseResult;
	samples: MeasuredSample[];
}

export function emptyPhases(): PhaseDurations {
	return {
		prepareMs: 0,
		loadMs: 0,
		resourceMs: 0,
		groupPassMs: 0,
		processMs: 0,
		generateMs: 0,
		pipelineDurationMs: 0,
		totalWallMs: 0,
	};
}

export async function runMeasuredCase(
	options: MeasuredCaseOptions,
): Promise<SampledCase> {
	const environment =
		options.environment ?? collectEnvironmentMetadata(process.cwd());
	for (let i = 0; i < options.warmup; i++) await options.measure();

	const samples: MeasuredSample[] = [];
	for (let i = 0; i < options.iterations; i++) {
		try {
			samples.push(await options.measure());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				result: {
					...emptyCase(options, environment),
					status: 'failure',
					error: message,
					stats: calculateStats(samples.map((sample) => sample.durationMs)),
				},
				samples,
			};
		}
	}

	const primary = samples.at(-1);
	const stats = calculateStats(samples.map((sample) => sample.durationMs));
	return {
		result: {
			...emptyCase(options, environment),
			status: 'success',
			files: primary?.files ?? [],
			tokensCount: primary?.tokensCount ?? 0,
			outputFiles: primary?.outputFiles ?? primary?.files?.length ?? 0,
			outputFileNames: primary?.files?.map((file) => file.relativePath) ?? [],
			outputBytes:
				primary?.outputBytes ??
				primary?.files?.reduce((sum, file) => sum + file.bytes, 0) ??
				0,
			phases: {
				...emptyPhases(),
				pipelineDurationMs: stats?.meanMs ?? 0,
				totalWallMs: stats?.meanMs ?? 0,
			},
			stats,
		},
		samples,
	};
}

function emptyCase(
	options: MeasuredCaseOptions,
	environment: EnvironmentMetadata,
): BenchmarkCaseResult {
	return {
		id: options.id,
		caseVersion: options.caseVersion ?? 1,
		mode: options.mode ?? 'default',
		entryKind: options.entryKind,
		domain: options.operation.domain,
		operation: options.operation,
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
		phases: emptyPhases(),
	};
}
