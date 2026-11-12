import { Command } from 'commander';
import {
	addOutputOption,
	addQualityOption,
	addRepeatableOption,
} from '../options.ts';
import { createInstallCommand } from './install-command.ts';
import { lazyAction } from './lazy-action.ts';
import { createToolDoctorCommand } from './tool-module.ts';

export type { CompressCommandOptions } from './compress-action.ts';

function createCompressActionCommand(name = 'compress'): Command {
	const command = new Command(name)
		.description('Preview and optionally write compressed assets')
		.option('-f, --file <path>', 'File or directory to compress')
		.option('--recursive', 'Scan directories recursively');
	addRepeatableOption(
		command,
		'--type <type>',
		'Limit file type: png, jpg, svg, gif',
	);
	addQualityOption(command, 'Enable quality mode with lossy quality 1-100');
	addOutputOption(command, 'Output directory');
	return command
		.option('--dry-run', 'Preview compression without writing output')
		.option('--yes', 'Write previewed output without prompting')
		.option('--force', 'Allow overwriting existing output files')
		.option('--icon', 'Clean SVG icon colors for CSS styling')
		.option('--json', 'Output JSON and do not prompt')
		.action(
			lazyAction('compress', async () =>
				(
					await import('./compress-action.ts')
				).createCompressActionCommandAction(),
			),
		);
}

export const compressCommand = createCompressActionCommand('compress')
	.addCommand(createToolDoctorCommand('compress'))
	.addCommand(createInstallCommand('install', 'compress'));
