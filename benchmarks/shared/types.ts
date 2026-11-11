import type { FileArtifact } from './artifacts.ts';

export type QualityHarnessMode = 'smoke' | 'default' | 'stress';

export type BenchmarkDomain =
	| 'design-token'
	| 'cold-start'
	| 'token-single-profile'
	| 'token-multi-profile'
	| 'night'
	| 'compress'
	| 'manual';

export type BenchmarkParameterValue =
	| string
	| number
	| boolean
	| null
	| string[];

export interface BenchmarkTimingContract {
	start: 'operation-start' | 'process-spawn' | 'readiness-wait-start';
	end: 'operation-complete' | 'process-exit' | 'readiness-signal';
	metric: 'durationMs' | 'readyMs';
	completion: 'result-returned' | 'exit-zero' | 'ready-signal';
}

export interface BenchmarkComparisonContract {
	key: string;
	metric: 'meanMs' | 'p95Ms' | 'minMs' | 'maxMs';
	unit: 'ms';
	direction: 'lower-is-better' | 'higher-is-better' | 'informational';
}

export interface BenchmarkOperationContract {
	name: string;
	domain: BenchmarkDomain;
	action: string;
	parameters: Record<string, BenchmarkParameterValue>;
	timing: BenchmarkTimingContract;
	comparison: BenchmarkComparisonContract;
	successCondition: string;
}

export interface ResourceTrace {
	kind: 'palette' | 'dimension' | 'custom';
	ref: string;
	repoSourcePath: string;
	workspacePath: string;
	sha256: string;
	bytes: number;
}

export interface PhaseDurations {
	prepareMs: number;
	loadMs: number;
	resourceMs: number;
	groupPassMs: number;
	processMs: number;
	generateMs: number;
	pipelineDurationMs: number;
	totalWallMs: number;
}

export interface BenchmarkStats {
	meanMs: number;
	minMs: number;
	maxMs: number;
	p95Ms: number | null;
	samplesMs?: number[];
}

export interface BenchmarkMeasurement {
	id: string;
	status: 'success' | 'failure';
	samplesMs: number[];
	stats?: BenchmarkStats;
	error?: string;
}

export interface EnvironmentMetadata {
	runtime: 'bun';
	node: string;
	bun: string;
	platform: NodeJS.Platform;
	arch: string;
	cpuCount: number;
	memoryBytes: number;
	cwd: string;
}

export interface BenchmarkCaseResult {
	id: string;
	caseVersion: number;
	mode: QualityHarnessMode;
	entryKind: 'main-config' | 'fixture' | 'process' | 'server';
	domain?: BenchmarkDomain;
	operation?: BenchmarkOperationContract;
	environment?: EnvironmentMetadata;
	status: 'success' | 'failure';
	error?: string;
	iterations: number;
	warmup: number;
	tokensCount: number;
	outputFiles: number;
	outputBytes: number;
	outputFileNames: string[];
	files: FileArtifact[];
	resources: ResourceTrace[];
	phases: PhaseDurations;
	stats?: BenchmarkStats;
	measurements?: BenchmarkMeasurement[];
}
