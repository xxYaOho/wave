#!/usr/bin/env bun
import { compareSuiteReports } from './shared/compare.ts';
import { readSuiteReport } from './shared/report.ts';

const [basePath, currentPath, thresholdRaw] = process.argv
	.slice(2)
	.filter((arg) => arg !== '--');
if (!basePath || !currentPath) {
	console.error(
		'Usage: bun benchmarks/compare.ts <base-report.json> <current-report.json> [thresholdPercent]',
	);
	process.exit(2);
}

const threshold = thresholdRaw ? Number.parseFloat(thresholdRaw) : 15;
const base = await readSuiteReport(basePath);
const current = await readSuiteReport(currentPath);
const comparison = compareSuiteReports(base, current, threshold);

console.log(JSON.stringify(comparison, null, 2));
if (!comparison.ok) {
	process.exit(1);
}
