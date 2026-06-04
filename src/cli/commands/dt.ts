import { Command, Option } from 'commander';
import {
	getResourceStatus,
	updateLeonardo,
	updateTailwind,
} from '../../core/resources/manager.ts';
import { ExitCode } from '../../types/index.ts';
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
    update          Update local design-token resources
    status          Show local resource cache status
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

function createUpdateCommand(): Command {
	return new Command('update')
		.description('Update local design-token resources')
		.argument('[name]', 'Resource name: tailwindcss or leonardo')
		.option('--version <version>', 'Tailwind CSS version: latest, 3, or 4')
		.addOption(
			new Option(
				'--tailwind-version <version>',
				'Tailwind CSS version: latest, 3, or 4',
			).hideHelp(),
		)
		.action(
			async (
				name: string | undefined,
				options: { version?: string; tailwindVersion?: string },
			) => {
				const target = name ?? 'all';
				const version = options.version ?? options.tailwindVersion;
				try {
					if (target === 'tailwindcss' || target === 'all') {
						const result = await updateTailwind(version);
						console.log(
							`Updated tailwindcss ${result.resolvedVersion} (v${result.activeMajor})`,
						);
						for (const file of result.files) console.log(`  ${file}`);
					}
					if (target === 'leonardo' || target === 'all') {
						const result = await updateLeonardo();
						console.log(`Updated leonardo (${result.recipeSource} recipe)`);
						for (const file of result.files) console.log(`  ${file}`);
					}
					if (
						target !== 'tailwindcss' &&
						target !== 'leonardo' &&
						target !== 'all'
					) {
						console.error(
							`Unknown resource: ${target}. Supported: tailwindcss, leonardo`,
						);
						process.exitCode = ExitCode.INVALID_PARAMETER;
					}
				} catch (error) {
					console.error(
						`Resource update failed: ${error instanceof Error ? error.message : String(error)}`,
					);
					process.exitCode = ExitCode.GENERAL_ERROR;
				}
			},
		);
}

function createStatusCommand(): Command {
	return new Command('status')
		.description('Show local resource cache status')
		.helpOption('-h, --help', 'Show help')
		.action(async () => {
			const status = await getResourceStatus();
			console.log('Wave Resource Status');
			console.log(`Cache:  ${status.cacheDir}`);
			console.log(`State:  ${status.statePath}`);
			console.log(`Config: ${status.configDir}`);
			console.log('');
			console.log('tailwindcss');
			console.log(
				`  updated: ${status.tailwindcss.updatedBefore ? 'yes' : 'no'}`,
			);
			console.log(
				`  cache:   ${status.tailwindcss.cacheExists ? 'present' : 'missing'}`,
			);
			console.log(
				`  version: ${status.tailwindcss.resolvedVersion ?? 'builtin fallback'}`,
			);
			console.log(
				`  request: ${status.tailwindcss.requestedVersion ?? 'not requested'}`,
			);
			console.log('');
			console.log('leonardo');
			console.log(`  updated: ${status.leonardo.updatedBefore ? 'yes' : 'no'}`);
			console.log(
				`  cache:   light=${status.leonardo.lightCacheExists ? 'present' : 'missing'}, dark=${status.leonardo.darkCacheExists ? 'present' : 'missing'}`,
			);
			console.log(`  recipe:  ${status.leonardo.recipe ?? 'builtin fallback'}`);
			console.log(`  recipe path: ${status.leonardoRecipePath}`);
		});
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
		.addCommand(createUpdateCommand())
		.addCommand(createStatusCommand())
		.addCommand(createInitCommand('init'))
		.action(showDesignTokenHelp);
}

export const designTokenCommand = createDesignTokenCommand('design-token');
export const dtCommand = createDesignTokenCommand('dt');
