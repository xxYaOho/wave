import { Command } from 'commander';
import {
	runToolchainDoctor,
	type ToolchainDoctorResult,
} from '../../core/doctor/toolchain.ts';
import type { ToolModule } from '../../core/tools/index.ts';
import { ExitCode } from '../../types/index.ts';
import { createInstallCommand } from './install.ts';

interface ToolDoctorOptions {
	json?: boolean;
	verbose?: boolean;
	status?: boolean;
}

export function createToolModuleCommand(
	name: 'compress' | 'motion',
	alias?: string,
): Command {
	const command = new Command(name).description(`${name} tools`);
	if (alias) command.alias(alias);
	command
		.addCommand(createToolDoctorCommand(name))
		.addCommand(createInstallCommand('install', name));
	return command;
}

export function createToolDoctorCommand(module: ToolModule): Command {
	return new Command('doctor')
		.description(`Check ${module} toolchain`)
		.option('--json', 'Output structured JSON only')
		.option('--verbose', 'Show detailed tool status')
		.option('--status', 'Show compact health status')
		.action(async (options: ToolDoctorOptions) => {
			const result = await runToolchainDoctor({ module });
			if (options.json) {
				console.log(JSON.stringify(result, null, 2));
			} else if (options.status) {
				renderStatus(result);
			} else if (options.verbose) {
				renderVerbose(result);
			} else {
				renderDefault(result);
			}
			process.exitCode = result.ok ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR;
		});
}

function renderDefault(result: ToolchainDoctorResult): void {
	if (result.issues.length === 0) {
		console.log(`OK: wave ${result.module} toolchain is ready.`);
		return;
	}
	for (const issue of result.issues) {
		console.log(`${issue.code} ${issue.title}`);
		console.log(issue.description);
		if (issue.fix) console.log(`Fix: ${issue.fix}`);
	}
}

function renderStatus(result: ToolchainDoctorResult): void {
	const failed = result.checks.filter(
		(check) => check.status === 'fail',
	).length;
	const warned = result.checks.filter(
		(check) => check.status === 'warn',
	).length;
	const passed = result.checks.filter(
		(check) => check.status === 'pass',
	).length;
	console.log(
		`${result.module}: ${result.ok ? 'ok' : 'needs attention'} (${passed} pass, ${warned} warn, ${failed} fail)`,
	);
}

function renderVerbose(result: ToolchainDoctorResult): void {
	renderStatus(result);
	for (const check of result.checks) {
		console.log('');
		console.log(`${check.status.toUpperCase()} ${check.name}`);
		console.log(check.message);
		for (const detail of check.details ?? []) {
			console.log(`  ${detail}`);
		}
	}
	if (result.issues.length > 0) {
		console.log('');
		renderDefault(result);
	}
}
