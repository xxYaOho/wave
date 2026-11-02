import * as path from 'node:path';
import { Command } from 'commander';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../file-input.ts';
import {
	type ExtensionsMigrationReport,
	MigrationEntryError,
	migrateExtensionsWorkspace,
} from '../../core/migrate/extensions.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

export function createMigrateExtensionsCommand(
	name = 'migrate-extensions',
): Command {
	return new Command(name)
		.description(
			'One-shot migration of legacy $extensions sketch family to platform.sketch',
		)
		.argument('[file]', 'main.yaml path or workspace dir. Default: ./main.yaml')
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.option(
			'--write',
			'Apply the migration to main.yaml and profiles/*.yaml (default: dry-run report)',
		)
		.action(
			async (
				positionalFile: string | undefined,
				options: { file?: string; write?: boolean },
			) => {
			const fileInput = resolveExclusiveFileInput(
				positionalFile,
				options.file,
				{ label: 'migrate-extensions input', hint: 'Use one main.yaml path.' },
			);
			if (!fileInput.ok) {
				logger.error(fileInput.message);
				process.exitCode = ExitCode.INVALID_PARAMETER;
				return;
			}
			const entry =
				(await expandMainYamlEntry(fileInput.path)) ??
				path.join(process.cwd(), 'main.yaml');
			const write = options.write === true;

			let report: ExtensionsMigrationReport;
			try {
				report = await migrateExtensionsWorkspace(entry, write);
			} catch (error) {
				if (error instanceof MigrationEntryError) {
					logger.error(error.message);
					process.exitCode =
						error.code === 'ENTRY_NOT_MAIN'
							? ExitCode.INVALID_PARAMETER
							: ExitCode.FILE_NOT_FOUND;
					return;
				}
				logger.error(
					`Migration failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exitCode = ExitCode.GENERAL_ERROR;
				return;
			}

			for (const file of report.files) {
				switch (file.status) {
					case 'migrated':
						logger.success(
							`${file.file}: ${file.sketchRenamed} sketch, ${file.outlineRenamed} outline -> platform.sketch${write ? ' (written)' : ' (dry-run)'}`,
						);
						break;
					case 'clean':
						logger.info(`${file.file}: up to date`);
						break;
					case 'mixed':
						logger.error(`${file.file}: ${file.message ?? 'mixed form'}`);
						break;
					case 'unsupported':
						logger.error(
							`${file.file}: ${file.message ?? 'unsupported format'}`,
						);
						break;
				}
			}

			const blocked = report.mixed + report.unsupported;
			if (blocked > 0) {
				logger.error(
					`${blocked} file(s) need manual attention; nothing else was written`,
				);
				process.exitCode = ExitCode.GENERAL_ERROR;
				return;
			}

			if (!write && report.migrated > 0) {
				logger.info('Dry run only. Re-run with --write to apply.');
			}
			logger.success(
				write
					? `Migration complete: ${report.migrated} file(s) updated, ${report.clean} up to date.`
					: `Migration report: ${report.migrated} file(s) to update, ${report.clean} up to date.`,
			);
		});
}
