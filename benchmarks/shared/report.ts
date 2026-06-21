import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BenchmarkCaseResult } from './types.ts';

export interface BenchmarkSuiteReport {
	schemaVersion: 1;
	name: string;
	runId: string;
	mode: string;
	createdAt: string;
	node: string;
	bun: string;
	cases: BenchmarkCaseResult[];
}

export async function writeSuiteReport(
	report: BenchmarkSuiteReport,
	resultsDir: string,
): Promise<string> {
	await fs.mkdir(resultsDir, { recursive: true });
	const filePath = path.join(resultsDir, `${report.runId}.json`);
	await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
	return filePath;
}

export async function readSuiteReport(
	filePath: string,
): Promise<BenchmarkSuiteReport> {
	const content = await fs.readFile(filePath, 'utf-8');
	return JSON.parse(content) as BenchmarkSuiteReport;
}
