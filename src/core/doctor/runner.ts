import type { DoctorRunResult } from '../../types/index.ts';

export interface DoctorCheckResult {
	name: string;
	ok: boolean;
	firstError?: string;
}

export interface DoctorCheck {
	name: string;
	run: () => Promise<DoctorRunResult>;
}

export interface DoctorRunnerResult extends DoctorRunResult {
	checks: DoctorCheckResult[];
}

export async function runDoctor(
	checks: DoctorCheck[],
): Promise<DoctorRunnerResult> {
	const result: DoctorRunnerResult = {
		ok: true,
		blockingErrors: [],
		reports: [],
		checks: [],
	};

	for (const check of checks) {
		const checkResult = await check.run();
		if (!checkResult.ok) {
			result.ok = false;
		}
		result.blockingErrors.push(...checkResult.blockingErrors);
		result.reports.push(...checkResult.reports);
		const firstError = checkResult.blockingErrors[0];
		result.checks.push({
			name: check.name,
			ok: checkResult.ok,
			firstError: firstError?.message,
		});
	}

	return result;
}
