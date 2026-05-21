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
							module,
							willInstall: false,
							tools: plan.tools,
							command: plan.command,
						},
						null,
						2,
					),
				);
			} else if (!options.json) {
				renderInstallPlan(module, plan.tools);
			}

			if (options.check || !options.yes) {
				process.exitCode = ExitCode.SUCCESS;
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

			const result = await runner.run({ command: 'mise', args: ['install'] });
			if (options.json) {
				console.log(
					JSON.stringify(
						{
							kind: 'install-result',
							module,
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

function createInstallPlan(module: InstallModule): {
	tools: string[];
	command: string[];
} {
	return {
		tools: TOOL_INSTALL_GROUPS[module],
		command: ['mise', 'install'],
	};
}

function renderInstallPlan(module: InstallModule, tools: string[]): void {
	const label = module === 'core' ? 'wave' : `wave ${module}`;
	console.log(`${label} install plan`);
	console.log('Tools:');
	for (const tool of tools) {
		console.log(`  - ${tool}`);
	}
	console.log('Command: mise install');
}

export const installCommand = createInstallCommand('install');
