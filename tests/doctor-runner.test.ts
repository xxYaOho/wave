import { describe, expect, test } from 'bun:test';
import { type DoctorCheck, runDoctor } from '../src/core/doctor/runner.ts';
import type { DoctorRunResult } from '../src/types/index.ts';

describe('doctor runner', () => {
	test('returns ok=true when all checks pass with no blocking errors', async () => {
		const checks: DoctorCheck[] = [
			{
				name: 'Check A',
				run: async () => ({ ok: true, blockingErrors: [], reports: [] }),
			},
			{
				name: 'Check B',
				run: async () => ({ ok: true, blockingErrors: [], reports: [] }),
			},
		];

		const result = await runDoctor(checks);
		expect(result.ok).toBe(true);
		expect(result.blockingErrors).toHaveLength(0);
		expect(result.reports).toHaveLength(0);
		expect(result.checks).toHaveLength(2);
		expect(result.checks.every((c) => c.ok)).toBe(true);
	});

	test('returns ok=false when a check has blocking errors', async () => {
		const checks: DoctorCheck[] = [
			{
				name: 'Check A',
				run: async () => ({ ok: true, blockingErrors: [], reports: [] }),
			},
			{
				name: 'Check B',
				run: async () => ({
					ok: false,
					blockingErrors: [{ level: 'error', message: 'Something failed' }],
					reports: [],
				}),
			},
		];

		const result = await runDoctor(checks);
		expect(result.ok).toBe(false);
		expect(result.blockingErrors).toHaveLength(1);
		expect(result.blockingErrors[0]!.message).toBe('Something failed');
		expect(result.checks[1]!.ok).toBe(false);
		expect(result.checks[1]!.firstError).toBe('Something failed');
	});

	test('report-only findings do not force ok=false', async () => {
		const checks: DoctorCheck[] = [
			{
				name: 'Theme Contrast',
				run: async () => ({
					ok: true,
					blockingErrors: [],
					reports: [
						{
							pair: {
								name: 'bg-fg',
								backgroundPath: 'theme.color.bg',
								foregroundPath: 'theme.color.fg',
							},
							ratio: 2.0,
							scores: [
								{ dimension: 'Normal Text', level: 'AA', pass: false },
								{ dimension: 'Normal Text', level: 'AAA', pass: false },
							],
							findings: [],
						},
					],
				}),
			},
		];

		const result = await runDoctor(checks);
		expect(result.ok).toBe(true);
		expect(result.reports).toHaveLength(1);
	});

	test('aggregates multiple check results', async () => {
		const checks: DoctorCheck[] = [
			{
				name: 'Check A',
				run: async () => ({
					ok: false,
					blockingErrors: [{ level: 'error', message: 'A failed' }],
					reports: [],
				}),
			},
			{
				name: 'Check B',
				run: async () => ({
					ok: true,
					blockingErrors: [],
					reports: [
						{
							pair: {
								name: 'bg-fg',
								backgroundPath: 'bg',
								foregroundPath: 'fg',
							},
							ratio: 4.5,
							scores: [],
							findings: [],
						},
					],
				}),
			},
		];

		const result = await runDoctor(checks);
		expect(result.ok).toBe(false);
		expect(result.blockingErrors).toHaveLength(1);
		expect(result.reports).toHaveLength(1);
		expect(result.checks).toHaveLength(2);
	});
});
