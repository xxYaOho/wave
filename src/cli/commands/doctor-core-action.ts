import type { Command } from 'commander';
import { runToolchainDoctor } from '../../core/doctor/toolchain.ts';
import { ExitCode } from '../../types/index.ts';
import type { DoctorCommandOptions } from './doctor-action.ts';

function renderToolchainStatus(
	result: Awaited<ReturnType<typeof runToolchainDoctor>>,
): void {
	const counts = result.checks.reduce(
		(acc, check) => {
			if (
				check.status === 'pass' ||
				check.status === 'warn' ||
				check.status === 'fail'
			) {
				acc[check.status] += 1;
			}
			return acc;
		},
		{ pass: 0, warn: 0, fail: 0 },
	);
	console.log(
		`toolchain: ${result.ok ? 'ok' : 'needs attention'} (${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail)`,
	);
}

function renderToolchainVerbose(
	result: Awaited<ReturnType<typeof runToolchainDoctor>>,
): void {
	for (const check of result.checks) {
		console.log(`${check.status.toUpperCase()} ${check.name}`);
		console.log(check.message);
	}
}

export async function runCoreDoctor(
	_options: DoctorCommandOptions,
	command: Command,
): Promise<void> {
	const options = command.optsWithGlobals<DoctorCommandOptions>();
	const result = await runToolchainDoctor({ module: 'core' });
	if (options.json) console.log(JSON.stringify(result, null, 2));
	else if (options.status) renderToolchainStatus(result);
	else renderToolchainVerbose(result);
	process.exitCode = result.ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR;
}
