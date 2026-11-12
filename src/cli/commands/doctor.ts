import { Command, CommanderError } from 'commander';
import { ExitCode } from '../../types/index.ts';
import type { CreateDoctorCommandOptions } from './doctor-action.ts';
import { lazyAction } from './lazy-action.ts';

export type {
	CreateDoctorCommandOptions,
	DoctorCommandOptions,
} from './doctor-action.ts';

export function createDoctorCommand(
	name = 'doctor',
	commandOptions: CreateDoctorCommandOptions = {},
): Command {
	const command = new Command(name).description(
		commandOptions.coreOnly
			? 'Check local Wave environment and tools'
			: 'Run token workspace health diagnostics',
	);
	if (!commandOptions.coreOnly) {
		command
			.option('-f, --file <path>', 'Day source YAML or workspace directory')
			.option('-o, --output <dir>', 'Output directory to check');
	}
	command
		.option('--json', 'Output structured JSON for core diagnostics')
		.option('--verbose', 'Show detailed core diagnostics')
		.option('--status', 'Show compact core health status')
		.action(
			lazyAction(
				commandOptions.coreOnly ? 'doctor' : 'token doctor',
				async () =>
					commandOptions.coreOnly
						? (await import('./doctor-core-action.ts')).runCoreDoctor
						: (await import('./doctor-action.ts')).createDoctorCommandAction(
								commandOptions,
							),
			),
		);
	command.exitOverride((error) => {
		if (
			error instanceof CommanderError &&
			error.code === 'commander.helpDisplayed'
		) {
			process.exitCode = ExitCode.SUCCESS;
			return;
		}
		if (
			error instanceof CommanderError &&
			(error.code === 'commander.unknownOption' ||
				error.code === 'commander.excessArguments')
		) {
			console.error(
				commandOptions.coreOnly
					? 'Invalid doctor option. Use wave token doctor -f <main.yaml> for workspace checks or wave token wcag --night for contrast checks.'
					: 'Invalid token doctor option. Use wave token wcag --night for contrast checks.',
			);
			process.exitCode = ExitCode.INVALID_PARAMETER;
			return;
		}
		throw error;
	});
	return command;
}

export const doctorCommand = createDoctorCommand('doctor', { coreOnly: true });
