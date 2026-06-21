import type { FileArtifact } from './artifacts.ts';

export type QualityHarnessMode = 'smoke' | 'default' | 'stress' | 'legacy';

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
}

export interface BenchmarkCaseResult {
	id: string;
	caseVersion: number;
	mode: QualityHarnessMode;
	entryKind: string;
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
}
