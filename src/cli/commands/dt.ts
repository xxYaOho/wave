import { Command, Option } from 'commander';
import {
	getResourceStatus,
	updateLeonardo,
	updateTailwind,
} from '../../core/resources/manager.ts';
import { ExitCode } from '../../types/index.ts';
import { createDesignTokenBuildCommand } from './build.ts';
import { createDoctorCommand } from './doctor.ts';
import { createDesignTokenInitCommand } from './dt-init.ts';
import { createMigrateExtensionsCommand } from './dt-migrate-extensions.ts';
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
    migrate-extensions  One-shot $extensions legacy rename (sketch -> platform.sketch)

  Options:
    -f, --file <path>    main.yaml path. Default: ./main.yaml
    -o, --out <path>     Override output directory
    --platform <name>    Output platform. Repeatable: json, jsonc, css, sketch, md-yml
    --profile <name>     Build one named profile from profiles/<name>.yaml
    --profiles all       Build main and all named profiles
    --night              Include valid Night Mode overlays when available
    --json               Output JSON only where supported
    -h, --help           Show help

  For more help on a command:
    wave dt <command> --help`;

function showDesignTokenHelp(): void {
	console.log(DESIGN_TOKEN_HELP);
}

export function createWcagCommand(): Command {
	return new Command('wcag')
		.description('Run WCAG contrast checks')
		.argument('[scope]', 'Theme scope: main or profile name')
		.option('-f, --file <path>', 'main.yaml path to validate')
		.option('--night', 'Check night profile')
		.option('--profile <name>', 'Check specific profile by name')
		.action(
			async (
				scope: string | undefined,
				options: { file?: string; night?: boolean; profile?: string },
			) => {
				const args = ['--contrast'];
				if (options.file) {
					args.push('--file', options.file);
				}
				if (options.night) {
					args.push('--night');
				}
				const profile =
					options.profile ?? (scope === 'main' ? undefined : scope);
				if (profile) {
					args.push('--profile', profile);
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

export function createStatusCommand(): Command {
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
		.addCommand(createDesignTokenBuildCommand('build'))
		.addCommand(createDoctorCommand('doctor', { defaultMainYaml: true }))
		.addCommand(createWcagCommand())
		.addCommand(createShowCommand('show'))
		.addCommand(createUpdateCommand())
		.addCommand(createStatusCommand())
		.addCommand(createDesignTokenInitCommand('init'))
		.addCommand(createMigrateExtensionsCommand())
		.action(showDesignTokenHelp);
}

export const designTokenCommand = createDesignTokenCommand('design-token');
export const dtCommand = createDesignTokenCommand('dt');
