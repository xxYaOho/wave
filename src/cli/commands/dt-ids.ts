import * as path from 'node:path';
import { Command } from 'commander';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../file-input.ts';
import {
	IdsEntryError,
	type IdsWorkspaceReport,
	runIdsWorkspace,
} from '../../core/ids/ids.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

/**
 * The ids core lists at most 40 changes (`MAX_LISTED_CHANGES`); the full
 * plan size is `added + synced`, so a longer plan collapses its tail into an
 * "… and N more" hint line (same style as the doctor report truncation).
 */

/**
 * `wave token ids` — token identity command (Milestone-3). Default is a dry-run
 * report; only an explicit `--write` touches files, and only on a clean git
 * working tree unless `--allow-dirty` is given.
 */
export function createIdsCommand(name = 'ids'): Command {
	return new Command(name)
		.description(
			'Fill, generate and sync token $id identities across the workspace',
		)
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.option(
			'--write',
			'Write $id changes back to main.yaml and profiles/*.yaml (default: dry-run report)',
		)
		.option(
			'--allow-dirty',
			'Allow --write even when the git working tree is not clean',
		)
		.action(
			async (
				_options: {
					file?: string;
					write?: boolean;
					allowDirty?: boolean;
				},
				command: Command,
			) => {
				const options = command.optsWithGlobals<{
					file?: string;
					write?: boolean;
					allowDirty?: boolean;
				}>();
				const fileInput = resolveExclusiveFileInput(undefined, options.file, {
					label: 'ids input',
					hint: 'Use one main.yaml path.',
				});
				if (!fileInput.ok) {
					logger.error(fileInput.message);
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}
				const entry =
					(await expandMainYamlEntry(fileInput.path)) ??
					path.join(process.cwd(), 'main.yaml');

				let report: IdsWorkspaceReport;
				try {
					report = await runIdsWorkspace(entry, {
						write: options.write === true,
						allowDirty: options.allowDirty === true,
					});
				} catch (error) {
					if (error instanceof IdsEntryError) {
						logger.error(error.message);
						process.exitCode =
							error.code === 'ENTRY_NOT_MAIN'
								? ExitCode.INVALID_PARAMETER
								: ExitCode.FILE_NOT_FOUND;
						return;
					}
					logger.error(
						`ids failed: ${error instanceof Error ? error.message : String(error)}`,
					);
					process.exitCode = ExitCode.GENERAL_ERROR;
					return;
				}

				for (const problem of report.problems) {
					logger.error(problem.message);
				}
				if (report.problems.length > 0) {
					logger.error(
						`${report.problems.length} problem(s) found; nothing was written`,
					);
					process.exitCode = ExitCode.GENERAL_ERROR;
					return;
				}

				if (report.refusal === 'dirty-worktree') {
					logger.error(
						'git working tree is not clean; refusing --write (re-run with --allow-dirty to override)',
					);
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}

				for (const change of report.changes) {
					if (change.kind === 'sync') {
						logger.info(
							`~ ${change.file}: ${change.tokenPath} (synced from ${change.source ?? 'authority'})`,
						);
						continue;
					}
					switch (change.mode) {
						case 'insert':
							logger.info(
								`+ ${change.file}: ${change.tokenPath} (new id ${change.id})`,
							);
							break;
						case 'fill':
							logger.info(
								`+ ${change.file}: ${change.tokenPath} (empty slot filled with ${change.id})`,
							);
							break;
						case 'reissue':
							logger.info(
								`~ ${change.file}: ${change.tokenPath} (duplicate id reissued as ${change.id})`,
							);
							break;
					}
				}
				if (report.added + report.synced > report.changes.length) {
					logger.info(
						`… and ${report.added + report.synced - report.changes.length} more`,
					);
				}
				for (const warning of report.warnings) {
					const where =
						warning.file || warning.tokenPath
							? `${warning.file ?? ''}${warning.file && warning.tokenPath ? ':' : ''}${warning.tokenPath ?? ''} — `
							: '';
					logger.warn(`${where}${warning.message}`);
				}

				if (report.added === 0 && report.synced === 0) {
					logger.success('Token IDs up to date.');
					return;
				}

				if (report.write && report.written) {
					logger.success(
						`Token IDs written: ${report.added} added, ${report.synced} synced, ${report.warnings.length} warning(s).`,
					);
					return;
				}

				logger.success(
					`Token IDs report: ${report.added} to add, ${report.synced} to sync, ${report.warnings.length} warning(s)${report.write ? '' : ' (dry-run)'}.`,
				);
				if (!report.write) {
					logger.info('Dry run only. Re-run with --write to apply.');
				}
			},
		);
}
