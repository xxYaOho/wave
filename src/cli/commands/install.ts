import type { Command } from 'commander';
import {
	BunCommandRunner,
	TOOL_INSTALL_GROUPS,
} from '../../core/tools/index.ts';
import { ExitCode } from '../../types/index.ts';

export function createInstallPlan(module: InstallModule): InstallPlan {
	const taskName = module === 'core' ? 'install:wave' : `install:${module}`;
	return {
		module,
		tools: TOOL_INSTALL_GROUPS[module],
		command: ['mise', 'run', taskName],
		canInstall: true,
		note:
			module === 'core'
				? 'Runs mise install and installs the full recommended Wave toolchain.'
				: `Runs the ${taskName} task for this module tool group.`,
	};
}

function renderInstallPlan(module: InstallModule, plan: InstallPlan): void {
	const label = module === 'core' ? 'wave' : `wave ${module}`;
	console.log(`${label} install plan`);
	console.log('Tools:');
	for (const tool of plan.tools) {
		console.log(`  - ${tool}`);
	}
	console.log(`Command: ${plan.command.join(' ')}`);
	if (plan.note) console.log(`Note: ${plan.note}`);
}

export interface InstallCommandOptions {
	check?: boolean;
	yes?: boolean;
	json?: boolean;
}

export type InstallModule = 'core' | 'compress' | 'motion';

export interface InstallPlan {
	module: InstallModule;
	tools: string[];
	command: string[];
	canInstall: boolean;
	note?: string;
}

export function createInstallCommandAction(module: InstallModule) {
	return async (options: InstallCommandOptions, current: Command) => {
		const parentOptions = current.parent?.opts() as
			| InstallCommandOptions
			| undefined;
		options = { ...parentOptions, ...options };
		const plan = createInstallPlan(module);

		if (options.json && !options.yes) {
			console.log(
				JSON.stringify(
					{
						kind: 'install-plan',
						module: plan.module,
						willInstall: false,
						tools: plan.tools,
						command: plan.command,
						canInstall: plan.canInstall,
						note: plan.note,
					},
					null,
					2,
				),
			);
		} else if (!options.json) {
			renderInstallPlan(module, plan);
		}

		if (options.check || !options.yes) {
			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		if (!plan.canInstall) {
			const message =
				plan.note ?? 'Module-only install is not available in this version.';
			if (options.json) {
				console.log(
					JSON.stringify(
						{
							kind: 'install-result',
							module: plan.module,
							ok: false,
							error: message,
						},
						null,
						2,
					),
				);
			} else {
				console.error(`✗ ${message}`);
			}
			process.exitCode = ExitCode.INVALID_COMMAND;
			return;
		}

		const runner = new BunCommandRunner();
		const miseCheck = await runner.run({
			command: 'mise',
			args: ['--version'],
		});
		if (miseCheck.exitCode !== 0) {
			const message = 'mise is required. Install mise first, then run again.';
			if (options.json) {
				console.log(JSON.stringify({ ok: false, error: message }, null, 2));
			} else {
				console.error(`✗ ${message}`);
			}
			process.exitCode = ExitCode.GENERAL_ERROR;
			return;
		}

		const [command, ...args] = plan.command;
		const result = await runner.run({ command: command!, args });
		if (options.json) {
			console.log(
				JSON.stringify(
					{
						kind: 'install-result',
						module: plan.module,
						ok: result.exitCode === 0,
						exitCode: result.exitCode,
						stdout: result.stdout,
						stderr: result.stderr,
					},
					null,
					2,
				),
			);
		} else {
			if (result.stdout.trim()) console.log(result.stdout.trim());
			if (result.stderr.trim()) console.error(result.stderr.trim());
		}
		process.exitCode =
			result.exitCode === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR;
	};
}

export { createInstallCommand, installCommand } from './install-command.ts';
