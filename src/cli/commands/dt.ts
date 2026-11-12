import { Command } from 'commander';
import { addManualOption } from '../options.ts';
import { addBuildOptions, createDesignTokenBuildCommand } from './build.ts';
import { createDoctorCommand } from './doctor.ts';
import { createIdsCommand } from './dt-ids.ts';
import { lazyAction } from './lazy-action.ts';
import { createShowCommand } from './show.ts';
import { createTokenMigrateCommand } from './token-migrate.ts';
import { createTokenNewCommand } from './token-new.ts';

export function createWcagCommand(): Command {
	return new Command('wcag')
		.description('Run WCAG contrast checks')
		.option('-f, --file <path>', 'Day source YAML or workspace directory')
		.option('--night', 'Check Night overlay')
		.action(
			lazyAction(
				'token wcag',
				async () => (await import('./doctor-action.ts')).runWcag,
			),
		);
}

function createUpdateCommand(): Command {
	return new Command('update')
		.description('Update local design-token resources')
		.argument('[name]', 'Resource name: tailwindcss or leonardo')
		.option('--version <version>', 'Tailwind CSS version: latest, 3, or 4')
		.action(
			lazyAction('token update', async () =>
				(await import('./dt-action.ts')).createUpdateCommandAction(),
			),
		);
}

export function createStatusCommand(): Command {
	return new Command('status')
		.description('Show local resource cache status')
		.helpOption('-h, --help', 'Show help')
		.action(
			lazyAction('token status', async () =>
				(await import('./dt-action.ts')).createStatusCommandAction(),
			),
		);
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
	command.action(
		lazyAction(
			'token',
			async () => (await import('./build-action.ts')).runDesignTokenBuild,
		),
	);
	return command;
}

export const tokenCommand = createTokenCommand('token');
