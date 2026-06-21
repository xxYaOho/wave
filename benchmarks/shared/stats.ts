import type { BenchmarkStats } from './types.ts';

export function calculateStats(values: number[]): BenchmarkStats | undefined {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const sum = sorted.reduce((total, value) => total + value, 0);
	const p95Index = Math.min(
		sorted.length - 1,
		Math.ceil(sorted.length * 0.95) - 1,
	);

	return {
		meanMs: sum / sorted.length,
		minMs: sorted[0] ?? 0,
		maxMs: sorted.at(-1) ?? 0,
		p95Ms: sorted[p95Index] ?? null,
	};
}
