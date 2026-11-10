import { Command } from 'commander';
import {
	getResourceStatus,
	updateLeonardo,
	updateTailwind,
} from '../../core/resources/manager.ts';
import { ExitCode } from '../../types/index.ts';
import { TOKEN_HELP } from '../help.ts';
import { addManualOption } from '../options.ts';
import {
	addBuildOptions,
	createDesignTokenBuildCommand,
	type DesignTokenBuildOptions,
	runDesignTokenBuild,
} from './build.ts';
import { createDoctorCommand, runDesignTokenContrastCheck } from './doctor.ts';
import { createIdsCommand } from './dt-ids.ts';
import { createShowCommand } from './show.ts';
import { createTokenMigrateCommand } from './token-migrate.ts';
import { createTokenNewCommand } from './token-new.ts';

export function createWcagCommand(): Command {
	return new Command('wcag')
		.description('Run WCAG contrast checks')
		.option('-f, --file <path>', 'Day source YAML or workspace directory')
		.option('--night', 'Check Night overlay')
		.action(
			async (options: { file?: string; night?: boolean }, command: Command) => {
				const parentOptions = command.parent?.opts() as {
					file?: string;
					night?: boolean;
				};
				return runDesignTokenContrastCheck({ ...parentOptions, ...options });
			},
		);
}

function createUpdateCommand(): Command {
	return new Command('update')
		.description('Update local design-token resources')
		.argument('[name]', 'Resource name: tailwindcss or leonardo')
		.option('--version <version>', 'Tailwind CSS version: latest, 3, or 4')
		.action(async (name: string | undefined, options: { version?: string }) => {
			const target = name ?? 'all';
			const version = options.version;
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
		});
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

export function createTokenCommand(name = 'token'): Command {
	const command = new Command(name).description(
		'Build and maintain design tokens',
	);
	addManualOption(command);
	addBuildOptions(command);
	command
		.addCommand(createDesignTokenBuildCommand('build'))
		.addCommand(createTokenNewCommand())
		.addCommand(createDoctorCommand('doctor', { defaultMainYaml: true }))
		.addCommand(createWcagCommand())
		.addCommand(createIdsCommand())
		.addCommand(createTokenMigrateCommand())
		.addCommand(createShowCommand('show'))
		.addCommand(createUpdateCommand())
		.addCommand(createStatusCommand());
	command.configureHelp({ formatHelp: () => TOKEN_HELP });
	command.action(async (options: DesignTokenBuildOptions) => {
		if (options.manual) return;
		await runDesignTokenBuild(options);
	});
	return command;
}

export const tokenCommand = createTokenCommand('token');
