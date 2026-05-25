import { Command } from 'commander';
import { createBuildCommand } from './create.ts';
import { createDoctorCommand } from './doctor.ts';
import { createInitCommand } from './init.ts';
import { createShowCommand } from './show.ts';

const DESIGN_TOKEN_HELP = `Wave Design Token
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Usage:
    wave dt [options]
    wave dt <command> [options]

  Commands:
    build           Build design token output
    doctor          Check design-token workspace health
    wcag            Check color contrast
    show            Browse built-in resources
    init            Create a starter workspace

  Options:
    -f, --file <path>    main.yaml path. Default: ./main.yaml
    -o, --out <path>     Override output directory
    --platform <name>    Output platform. Repeatable: json, jsonc, css, sketch
    --variant <name>     Build selected variant. Repeatable
    --night              Include night output
    --no-night           Disable night output
    --no-variants        Disable variants
    --json               Output JSON only where supported
    -h, --help           Show help

  For more help on a command:
    wave dt <command> --help`;

const DT_BUILD_CONFIG = {
	defaultFile: 'main.yaml',
	fileHelp: 'main.yaml path. Default: ./main.yaml',
	missingFileHelp: [
		'Error: No main.yaml found in current directory',
		'Usage: wave dt [./main.yaml] or wave dt -f ./main.yaml',
		'Run "wave dt init" to create a design-token workspace',
	],
};

function showDesignTokenHelp(): void {
	console.log(DESIGN_TOKEN_HELP);
}

function createWcagCommand(): Command {
	return new Command('wcag')
		.description('Run WCAG contrast checks')
		.argument('[scope]', 'Theme scope: main or variant name')
		.option('-f, --file <path>', 'Themefile or main.yaml path to validate')
		.option('--night', 'Check night variant')
		.option('--variants <name>', 'Check specific variant by name')
		.action(
			async (
				scope: string | undefined,
				options: { file?: string; night?: boolean; variants?: string },
			) => {
				const args = ['--contrast'];
				if (options.file) {
					args.push('--file', options.file);
				}
				if (options.night) {
					args.push('--night');
				}
				const variant =
					options.variants ?? (scope === 'main' ? undefined : scope);
				if (variant) {
					args.push('--variants', variant);
				}
				const doctor = createDoctorCommand('doctor');
				await doctor.parseAsync(['bun', 'wave dt wcag', ...args], {
					from: 'node',
				});
			},
		);
}

export function createDesignTokenCommand(name = 'design-token'): Command {
	return new Command(name)
		.description('Build and inspect design tokens')
		.helpOption(false)
		.addHelpCommand(false)
		.option('-h, --help', 'Show help')
		.addCommand(createBuildCommand('build', DT_BUILD_CONFIG))
		.addCommand(createDoctorCommand('doctor'))
		.addCommand(createWcagCommand())
		.addCommand(createShowCommand('show'))
		.addCommand(createInitCommand('init'))
		.action(showDesignTokenHelp);
}

export const designTokenCommand = createDesignTokenCommand('design-token');
export const dtCommand = createDesignTokenCommand('dt');
