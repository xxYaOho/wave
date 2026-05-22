import { Command } from 'commander';
import {
	BunCommandRunner,
	TOOL_INSTALL_GROUPS,
} from '../../core/tools/index.ts';
import { ExitCode } from '../../types/index.ts';

interface InstallCommandOptions {
	check?: boolean;
	yes?: boolean;
	json?: boolean;
}

type InstallModule = 'core' | 'compress' | 'motion';

interface InstallPlan {
	module: InstallModule;
	tools: string[];
	command: string[];
	canInstall: boolean;
	note?: string;
}

export function createInstallCommand(
	name = 'install',
	module: InstallModule = 'core',
): Command {
	return new Command(name)
		.description('Install recommended Wave toolchain through mise')
		.option('--check', 'Show install plan without installing')
		.option('--yes', 'Run mise install without confirmation')
		.option('--json', 'Output JSON and do not prompt')
		.action(async (options: InstallCommandOptions) => {
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
		});
}

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

export const installCommand = createInstallCommand('install');
