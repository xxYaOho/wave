import type { BenchmarkSuiteReport } from './report.ts';
import type { BenchmarkCaseResult } from './types.ts';

export interface BenchmarkComparisonCase {
	id: string;
	status: 'ok' | 'missing' | 'new' | 'regressed' | 'improved' | 'changed';
	baseMeanMs?: number;
	currentMeanMs?: number;
	deltaMs?: number;
	deltaPercent?: number;
	notes: string[];
}

export interface BenchmarkComparisonReport {
	ok: boolean;
	baseRunId: string;
	currentRunId: string;
	thresholdPercent: number;
	cases: BenchmarkComparisonCase[];
}

function percentDelta(base: number, current: number): number {
	if (base === 0) return current === 0 ? 0 : Number.POSITIVE_INFINITY;
	return ((current - base) / base) * 100;
}

function artifactHashes(testCase: BenchmarkCaseResult): Map<string, string> {
	return new Map(
		testCase.files.map((file) => [
			file.relativePath,
			`${file.sha256}:${file.bytes}`,
		]),
	);
}

function compareArtifacts(
	baseCase: BenchmarkCaseResult,
	currentCase: BenchmarkCaseResult,
): string[] {
	const notes: string[] = [];
	const baseNames = [...baseCase.outputFileNames].sort();
	const currentNames = [...currentCase.outputFileNames].sort();
	if (baseNames.join('\n') !== currentNames.join('\n')) {
		notes.push(
			`output file names changed: ${baseNames.join(',')} -> ${currentNames.join(',')}`,
		);
	}

	const baseArtifacts = artifactHashes(baseCase);
	const currentArtifacts = artifactHashes(currentCase);
	const artifactNames = [
		...new Set([...baseArtifacts.keys(), ...currentArtifacts.keys()]),
	].sort();
	for (const name of artifactNames) {
		const baseHash = baseArtifacts.get(name);
		const currentHash = currentArtifacts.get(name);
		if (baseHash !== currentHash) {
			notes.push(`artifact changed: ${name}`);
		}
	}

	return notes;
}

export function compareSuiteReports(
	base: BenchmarkSuiteReport,
	current: BenchmarkSuiteReport,
	thresholdPercent: number = 15,
): BenchmarkComparisonReport {
	const baseCases = new Map(
		base.cases.map((testCase) => [testCase.id, testCase]),
	);
	const currentCases = new Map(
		current.cases.map((testCase) => [testCase.id, testCase]),
	);
	const ids = [
		...new Set([...baseCases.keys(), ...currentCases.keys()]),
	].sort();
	const cases: BenchmarkComparisonCase[] = [];

	for (const id of ids) {
		const baseCase = baseCases.get(id);
		const currentCase = currentCases.get(id);
		if (!baseCase) {
			cases.push({
				id,
				status: 'new',
				notes: ['current report added this case'],
			});
			continue;
		}
		if (!currentCase) {
			cases.push({
				id,
				status: 'missing',
				notes: ['current report is missing this case'],
			});
			continue;
		}

		const notes: string[] = [];
		if (baseCase.status !== currentCase.status) {
			notes.push(`status changed: ${baseCase.status} -> ${currentCase.status}`);
		}
		if (baseCase.outputFiles !== currentCase.outputFiles) {
			notes.push(
				`output file count changed: ${baseCase.outputFiles} -> ${currentCase.outputFiles}`,
			);
		}
		if (baseCase.outputBytes !== currentCase.outputBytes) {
			notes.push(
				`output bytes changed: ${baseCase.outputBytes} -> ${currentCase.outputBytes}`,
			);
		}
		notes.push(...compareArtifacts(baseCase, currentCase));

		const baseMeanMs = baseCase.stats?.meanMs;
		const currentMeanMs = currentCase.stats?.meanMs;
		if (baseMeanMs === undefined || currentMeanMs === undefined) {
			cases.push({
				id,
				status: notes.length > 0 ? 'changed' : 'ok',
				notes,
			});
			continue;
		}

		const deltaMs = currentMeanMs - baseMeanMs;
		const deltaPercent = percentDelta(baseMeanMs, currentMeanMs);
		let status: BenchmarkComparisonCase['status'] = 'ok';
		if (deltaPercent >= thresholdPercent) {
			status = 'regressed';
			notes.push(
				`mean pipeline duration increased by ${deltaPercent.toFixed(1)}%`,
			);
		} else if (deltaPercent <= -thresholdPercent) {
			status = 'improved';
			notes.push(
				`mean pipeline duration decreased by ${Math.abs(deltaPercent).toFixed(1)}%`,
			);
		} else if (notes.length > 0) {
			status = 'changed';
		}

		cases.push({
			id,
			status,
			baseMeanMs,
			currentMeanMs,
			deltaMs,
			deltaPercent,
			notes,
		});
	}

	return {
		ok: cases.every(
			(testCase) =>
				testCase.status !== 'missing' &&
				testCase.status !== 'new' &&
				testCase.status !== 'regressed' &&
				testCase.status !== 'changed',
		),
		baseRunId: base.runId,
		currentRunId: current.runId,
		thresholdPercent,
		cases,
	};
}
