import { Command, CommanderError } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { addOutputOption, addQualityOption } from '../options.ts';
import { createInstallCommand } from './install-command.ts';
import { lazyAction } from './lazy-action.ts';

export type {
	MotionCommandOptions,
	MotionDoctorOptions,
} from './motion-action.ts';

export function createMotionCommand(name = 'motion'): Command {
	const command = new Command(name).description(
		'Create animated assets from PNG frames',
	);

	addEncodeOptions(command);
	command.addCommand(createMotionDoctorCommand());
	command.addCommand(createInstallCommand('install', 'motion'));
	command.action(
		lazyAction('motion', async () =>
			(await import('./motion-action.ts')).createMotionCommandAction(name),
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
			(error.code === 'commander.unknownCommand' ||
				error.code === 'commander.excessArguments')
		) {
			process.exitCode = ExitCode.INVALID_COMMAND;
			return;
		}
		throw error;
	});

	return command;
}

function addEncodeOptions(command: Command): Command {
	command
		.option('-f, --file <path>', 'PNG frame directory')
		.option('--fps <n>', 'Frames per second. Default: 24', '24')
		.option('--loop <mode>', 'forever or once. Default: forever', 'forever')
		.option('--format <format>', 'Output format: gif or apng')
		.option('--dry-run', 'Show plan only, no write')
		.option('--force', 'Allow overwriting existing output file');
	addQualityOption(command, 'Encoder quality, 1-100. Default: 80', '80');
	addOutputOption(command, 'Output file path');
	return command;
}

function createMotionDoctorCommand(): Command {
	return new Command('doctor')
		.description('Check motion tools and optional PNG frame directory')
		.option('-f, --file <path>', 'Directory containing PNG frames')
		.option('--json', 'Output structured JSON')
		.option('--verbose', 'Show details even when there are no issues')
		.option('--status', 'Show compact health status')
		.action(
			lazyAction('motion doctor', async () =>
				(await import('./motion-action.ts')).createMotionDoctorCommandAction(),
			),
		);
}

export const motionCommand = createMotionCommand('motion');
