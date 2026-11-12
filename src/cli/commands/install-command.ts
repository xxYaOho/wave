import { Command } from 'commander';
import type { InstallModule } from './install.ts';
import { lazyAction } from './lazy-action.ts';

export type {
	InstallCommandOptions,
	InstallModule,
	InstallPlan,
} from './install.ts';

export function createInstallCommand(
	name = 'install',
	module: InstallModule = 'core',
): Command {
	const command = new Command(name)
		.description('Install recommended Wave toolchain through mise')
		.option('--check', 'Show install plan without installing')
		.option('--yes', 'Run mise install without confirmation');
	if (module !== 'compress')
		command.option('--json', 'Output JSON and do not prompt');
	return command.action(
		lazyAction(module === 'core' ? 'install' : `${module} install`, async () =>
			(await import('./install.ts')).createInstallCommandAction(module),
		),
	);
}

export const installCommand = createInstallCommand('install');
