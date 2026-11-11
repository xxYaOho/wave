import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BenchmarkCaseResult, EnvironmentMetadata } from './types.ts';

export interface BenchmarkSuiteReport {
	schemaVersion: 1 | 2;
	name: string;
	runId: string;
	mode: string;
	createdAt: string;
	node: string;
	bun: string;
	environment?: EnvironmentMetadata;
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
	const parsed: unknown = JSON.parse(content);
	if (!isRecord(parsed)) {
		throw new Error(`Invalid benchmark report: ${filePath}`);
	}
	const schemaVersion = parsed.schemaVersion;
	if (schemaVersion !== 1 && schemaVersion !== 2) {
		throw new Error(
			`Unsupported benchmark report schemaVersion ${String(schemaVersion)}: ${filePath}`,
		);
	}
	if (!Array.isArray(parsed.cases)) {
		throw new Error(`Invalid benchmark report cases: ${filePath}`);
	}
	return parsed as unknown as BenchmarkSuiteReport;
}

export const readBenchmarkReport = readSuiteReport;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
