import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Command } from 'commander';
import * as yaml from 'js-yaml';
import {
	findDimensionMigrationFindings,
	renderDimensionMigrationAdvice,
} from '../../core/doctor/dimension-migration.ts';
import {
	describeIdentityConflict,
	type ThemeIdentityReport,
} from '../../core/doctor/identity.ts';
import { inspectWorkspaceHealth } from '../../core/doctor/profile-health.ts';
import { runThemeContrastCheck } from '../../core/doctor/registry.ts';
import { validateDeclaredResources } from '../../core/doctor/resource-validator.ts';
import { createThemeDoctorContextFromContent } from '../../core/doctor/theme-context.ts';
import {
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
} from '../../core/pipeline/profile-resolver.ts';
import { collectDependencyDictionary } from '../../core/pipeline/theme-pipeline.ts';
import { loadDesignTokenSource } from '../../core/pipeline/workspace-loader.ts';
import type { DoctorFinding, DoctorThemeReport } from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';
import {
	expandMainYamlEntry,
	resolveExclusiveFileInput,
} from '../file-input.ts';

const SEPARATOR = '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~';

async function inspectRawDimensionMigration(
	filePath: string | undefined,
): Promise<ReturnType<typeof findDimensionMigrationFindings>> {
	if (!filePath) return [];
	try {
		const content = await Bun.file(filePath).text();
		return findDimensionMigrationFindings(yaml.load(content), {
			includeDependencies: true,
		});
	} catch {
		return [];
	}
}

function renderScoreLines(report: DoctorThemeReport): string[] {
	const lines: string[] = [];
	const scores = report.scores;

	const normalAA = scores.find(
		(s) => s.dimension === 'Normal Text' && s.level === 'AA',
	)?.pass;
	const normalAAA = scores.find(
		(s) => s.dimension === 'Normal Text' && s.level === 'AAA',
	)?.pass;
	if (normalAAA) {
		lines.push(`🟢 Normal Text   (AAA)`);
	} else if (normalAA) {
		lines.push(`🟢 Normal Text   (AA)`);
	} else {
		lines.push(`🔴 Normal Text`);
	}

	const largeAA = scores.find(
		(s) => s.dimension === 'Large Text' && s.level === 'AA',
	)?.pass;
	const largeAAA = scores.find(
		(s) => s.dimension === 'Large Text' && s.level === 'AAA',
	)?.pass;
	if (largeAAA) {
		lines.push(`🟢 Large Text    (AAA)`);
	} else if (largeAA) {
		lines.push(`🟢 Large Text    (AA)`);
	} else {
		lines.push(`🔴 Large Text`);
	}

	const uiAA = scores.find(
		(s) => s.dimension === 'UI Components' && s.level === 'AA',
	)?.pass;
	if (uiAA) {
		lines.push(`🟢 UI Components (AA)`);
	} else {
		lines.push(`🔴 UI Components`);
	}

	return lines;
}

async function inspectOutputDirectory(
	output: string,
): Promise<{ path?: string; finding?: DoctorFinding }> {
	const resolved = path.resolve(output);
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(resolved);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return {
				finding: {
					level: 'error',
					message: `Output directory does not exist: ${resolved}`,
				},
			};
		}
		return {
			finding: {
				level: 'error',
				message: `Output directory could not be inspected: ${resolved}`,
			},
		};
	}
	if (!stat.isDirectory()) {
		return {
			finding: {
				level: 'error',
				message: `Output path is not a directory: ${resolved}`,
			},
		};
	}
	return { path: resolved };
}

function optionValueAfterCommand(
	commandName: string,
	flags: string[],
): string | undefined {
	const argv = process.argv.slice(2);
	const commandIndex = argv.lastIndexOf(commandName);
	if (commandIndex < 0) return undefined;
	for (let index = commandIndex + 1; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === undefined) continue;
		for (const flag of flags) {
			if (argument === flag) return argv[index + 1];
			if (argument.startsWith(`${flag}=`))
				return argument.slice(flag.length + 1);
		}
	}
	return undefined;
}

function renderWorkspaceLoadFailure(
	result: Extract<
		Awaited<ReturnType<typeof loadDesignTokenSource>>,
		{ ok: false }
	>,
): void {
	console.log(`✗ ${result.message}`);
	process.exitCode = result.exitCode;
}

function renderThemeIdentityReport(
	report: ThemeIdentityReport,
	verbose = false,
): void {
	console.log('Document Identity');
	for (const document of report.documents) {
		console.log(
			`  · ${document.file}:${document.path}: ${document.state}${document.id ? ` "${document.id}"` : ''}`,
		);
	}

	console.log('Token Identity');
	console.log(
		`  registered ${report.registered} · unregistered ${report.unregistered.length} · empty slots ${report.emptySlots.length}`,
	);
	const detailLimit = verbose ? Number.POSITIVE_INFINITY : 20;
	const printOccurrences = (
		header: string,
		items: Array<{ file: string; path: string; id?: string }>,
		render: (item: { file: string; path: string; id?: string }) => string,
	): void => {
		if (items.length === 0) return;
		for (const item of items.slice(0, detailLimit)) {
			console.log(`  · ${header}: ${render(item)}`);
		}
		if (items.length > detailLimit) {
			console.log(
				`  · ${header}: … and ${items.length - detailLimit} more (use --verbose)`,
			);
		}
	};
	printOccurrences(
		'unregistered',
		report.unregistered,
		(item) => `${item.path} (${item.file})`,
	);
	printOccurrences(
		'empty $id slot',
		report.emptySlots,
		(item) => `${item.path} (${item.file})`,
	);
	printOccurrences(
		'non-canonical id form (hint)',
		report.nonCanonical,
		(item) => `${item.path} "${item.id}" (${item.file})`,
	);
	for (const occurrence of report.undecidableTypes.slice(0, detailLimit)) {
		console.log(
			`  ✗ type cannot be determined (DTCG §5.2.2): ${occurrence.path} (${occurrence.file})`,
		);
	}
	if (report.undecidableTypes.length > detailLimit) {
		console.log(
			`  ✗ type cannot be determined (DTCG §5.2.2): … and ${report.undecidableTypes.length - detailLimit} more (use --verbose)`,
		);
	}
	printOccurrences(
		'suspected typo empty node (no $value, no children)',
		report.typoEmptyNodes,
		(item) => `${item.path} (${item.file})`,
	);
	for (const conflict of report.conflicts) {
		const prefix = conflict.crossFile ? '✗' : '·';
		const label = conflict.crossFile ? 'cross-file' : 'within-file';
		console.log(`  ${prefix} ${label} ${describeIdentityConflict(conflict)}`);
	}
}

export async function runDesignTokenContrastCheck(options: {
	file?: string;
	night?: boolean;
}): Promise<void> {
	const fileInput = resolveExclusiveFileInput(undefined, options.file, {
		label: 'WCAG source input',
		hint: 'Use one Day source YAML or workspace directory.',
	});
	if (!fileInput.ok) {
		console.error(fileInput.message);
		process.exitCode = ExitCode.INVALID_PARAMETER;
		return;
	}
	const sourcePath = await expandMainYamlEntry(fileInput.path);
	const loadResult = await loadDesignTokenSource(sourcePath);
	if (!loadResult.ok) {
		renderWorkspaceLoadFailure(loadResult);
		return;
	}

	const { source } = loadResult;
	const { workspace, entry } = source;
	const document = source.document;
	const profileDictResult = await collectDependencyDictionary(
		document.config,
		document.buildDir,
	);

	let contextPath = entry.path;
	let contextContent = document.tokenContent;
	let displayThemeName = entry.isDefault
		? workspace.config.theme
		: `${workspace.config.theme}-${entry.name}`;
	if (options.night) {
		if (!entry.nightPath) {
			console.log(NIGHT_SKIP_MESSAGE);
			process.exitCode = ExitCode.SUCCESS;
			return;
		}
		const dayRaw = yaml.load(document.tokenContent);
		const nightRaw = yaml.load(await Bun.file(entry.nightPath).text());
		const merged =
			typeof dayRaw === 'object' &&
			dayRaw !== null &&
			!Array.isArray(dayRaw) &&
			typeof nightRaw === 'object' &&
			nightRaw !== null &&
			!Array.isArray(nightRaw)
				? mergeNightOverlay(
						dayRaw as Record<string, unknown>,
						nightRaw as Record<string, unknown>,
					)
				: { ok: false as const, message: NIGHT_SKIP_MESSAGE };
		if (!merged.ok) {
			if ('error' in merged) {
				console.log(`✗ ${merged.error}`);
				process.exitCode = ExitCode.FORMAT_ERROR;
				return;
			}
			console.log(NIGHT_SKIP_MESSAGE);
			process.exitCode = ExitCode.SUCCESS;
			return;
		}
		contextContent = yaml.dump(merged.tree, { lineWidth: -1 });
		contextPath = entry.nightPath;
		displayThemeName = `${displayThemeName}-night`;
	}

	const ctxResult = await createThemeDoctorContextFromContent(
		contextPath,
		contextContent,
		profileDictResult.dict,
	);
	if (!ctxResult.ok) {
		console.log(`✗ ${ctxResult.findings[0]!.message}`);
		process.exitCode = ctxResult.exitCode;
		return;
	}

	const checkResult = await runThemeContrastCheck(ctxResult.context);
	console.log('Contrast Check');
	console.log(SEPARATOR);
	console.log(displayThemeName);
	console.log(SEPARATOR);

	if (
		checkResult.reports.length === 0 &&
		checkResult.blockingErrors.length === 0
	) {
		console.log('No wcagPairs found to evaluate.');
		process.exitCode = ExitCode.SUCCESS;
		return;
	}

	for (let i = 0; i < checkResult.reports.length; i++) {
		const report = checkResult.reports[i];
		if (!report) continue;
		if (i > 0) console.log(SEPARATOR);
		console.log(report.pair.name);
		console.log(`  ${report.ratio.toFixed(2)}:1`);
		console.log('Score');
		for (const line of renderScoreLines(report)) console.log(line);
	}
	console.log(SEPARATOR);

	if (checkResult.blockingErrors.length > 0) {
		console.log('');
		for (const err of checkResult.blockingErrors)
			console.log(`✗ ${err.message}`);
		process.exitCode = ExitCode.GENERAL_ERROR;
	} else {
		process.exitCode = ExitCode.SUCCESS;
	}
}

export interface DoctorCommandOptions {
	file?: string;
	output?: string;
	json?: boolean;
	verbose?: boolean;
	status?: boolean;
}

export interface CreateDoctorCommandOptions {
	defaultMainYaml?: boolean;
	coreOnly?: boolean;
}

export function createDoctorCommandAction(
	commandOptions: CreateDoctorCommandOptions,
) {
	return async (options: DoctorCommandOptions, command: Command) => {
		const parentOptions = command.parent?.opts() as
			| {
					file?: string;
					night?: boolean;
					output?: string;
					profiles?: string;
			  }
			| undefined;
		// Commander merges duplicate parent/leaf options into optsWithGlobals.
		// Recover the flag position so token build output cannot leak into doctor.
		const localOutput = commandOptions.coreOnly
			? undefined
			: optionValueAfterCommand(command.name(), ['--output', '-o']);
		options = { ...command.optsWithGlobals<DoctorCommandOptions>() };
		if (localOutput === undefined) delete options.output;
		else options.output = localOutput;
		if (commandOptions.defaultMainYaml && parentOptions?.file && !options.file)
			options.file = parentOptions.file;
		if (
			commandOptions.defaultMainYaml &&
			(parentOptions?.night || parentOptions?.profiles)
		) {
			console.error(
				'Invalid token doctor options. Use wave token wcag --night for contrast checks; token doctor accepts a local --output directory for output checks.',
			);
			process.exitCode = ExitCode.INVALID_PARAMETER;
			return;
		}
		const fileInput = resolveExclusiveFileInput(undefined, options.file, {
			label: 'doctor input',
			hint: 'Use one main.yaml path.',
		});
		if (!fileInput.ok) {
			console.error(fileInput.message);
			process.exitCode = ExitCode.INVALID_PARAMETER;
			return;
		}
		options = {
			...options,
			file: await expandMainYamlEntry(fileInput.path),
		};

		{
			let workspaceTheme: string | undefined;
			const workspaceFindings: DoctorFinding[] = [];
			let identity: ThemeIdentityReport | undefined;
			let workspaceExitCode: number = ExitCode.SUCCESS;
			let resourcesChecked = false;
			let resourcesOk = true;
			let outputDirectory: string | undefined;
			const addFailures = (findings: DoctorFinding[], exitCode: number) => {
				workspaceFindings.push(...findings);
				if (
					workspaceExitCode === ExitCode.SUCCESS ||
					exitCode === ExitCode.FORMAT_ERROR
				)
					workspaceExitCode = exitCode;
			};
			if (
				commandOptions.defaultMainYaml === true ||
				options.file !== undefined
			) {
				const loadResult = await loadDesignTokenSource(options.file);
				if (!loadResult.ok) {
					renderWorkspaceLoadFailure(loadResult);
					return;
				}

				const health = await inspectWorkspaceHealth(
					loadResult.source.workspace,
					undefined,
					loadResult.source.kind === 'profile' ? loadResult.source : undefined,
				);
				workspaceFindings.push(...health.findings);
				identity = health.identity;
				workspaceExitCode = health.exitCode;
				const selected = health.selectedDocument;
				workspaceTheme = loadResult.source.workspace.config.theme;
				if (selected) {
					resourcesChecked = true;
					const resourceResult = await validateDeclaredResources(
						selected.config,
						selected.buildDir,
					);
					if (!resourceResult.ok) {
						resourcesOk = false;
						addFailures(
							[
								{
									level: 'error',
									message: `Resources: ${resourceResult.message}`,
								},
							],
							ExitCode.GENERAL_ERROR,
						);
						const migration = await inspectRawDimensionMigration(
							selected.entry.path,
						);
						if (migration.length > 0)
							addFailures(
								[
									{
										level: 'error',
										message: renderDimensionMigrationAdvice(migration),
									},
								],
								ExitCode.GENERAL_ERROR,
							);
					} else {
						const contextResult = await createThemeDoctorContextFromContent(
							selected.entry.path,
							selected.tokenContent,
							resourceResult.dictionary.dict,
						);
						if (!contextResult.ok) {
							addFailures(
								contextResult.findings.map((finding) => ({
									...finding,
									message: `${selected.entry.path}: Theme: ${finding.message}`,
								})),
								contextResult.exitCode,
							);
						} else {
							const migration = findDimensionMigrationFindings(
								contextResult.context.resolvedTree,
							);
							if (migration.length > 0)
								addFailures(
									[
										{
											level: 'error',
											message: renderDimensionMigrationAdvice(migration),
										},
									],
									ExitCode.GENERAL_ERROR,
								);
						}
					}
				}
			}
			if (options.output) {
				const outputResult = await inspectOutputDirectory(options.output);
				if (outputResult.finding) {
					addFailures([outputResult.finding], ExitCode.INVALID_PARAMETER);
				} else {
					outputDirectory = outputResult.path;
				}
			}

			const diagnostics = {
				ok: workspaceExitCode === ExitCode.SUCCESS,
				findings: workspaceFindings,
				...(outputDirectory ? { outputDirectory } : {}),
				...(identity ? { identity } : {}),
			};
			const failureExitCode =
				workspaceExitCode !== ExitCode.SUCCESS
					? workspaceExitCode
					: ExitCode.GENERAL_ERROR;
			if (options.json) {
				console.log(JSON.stringify(diagnostics, null, 2));
				process.exitCode = diagnostics.ok ? ExitCode.SUCCESS : failureExitCode;
				return;
			}
			if (options.status) {
				console.log(
					`token: ${diagnostics.ok ? 'ok' : 'needs attention'} (${workspaceFindings.filter((finding) => finding.level === 'error').length} errors, ${workspaceFindings.filter((finding) => finding.level === 'warning').length} warnings)`,
				);
				for (const finding of workspaceFindings)
					console.log(`  ${finding.level}: ${finding.message}`);
				if (outputDirectory)
					console.log(`  output directory: ${outputDirectory}`);
				process.exitCode = diagnostics.ok ? ExitCode.SUCCESS : failureExitCode;
				return;
			}
			console.log('🔍 Running token workspace diagnostics...\n');

			if (identity)
				renderThemeIdentityReport(identity, options.verbose === true);
			for (const finding of workspaceFindings)
				console.log(
					`${finding.level === 'error' ? '✗' : '·'} ${finding.message}`,
				);
			console.log(
				workspaceTheme
					? `✓ Config File: Valid (${workspaceTheme})`
					: '✓ Config File: No main.yaml specified',
			);
			console.log(
				resourcesChecked
					? `${resourcesOk ? '✓' : '✗'} Resources: ${resourcesOk ? 'All declared resources valid' : 'Invalid declarations'}`
					: '· Resources: Not checked',
			);
			if (outputDirectory)
				console.log(`✓ Output Directory: ${outputDirectory}`);
			console.log('');

			if (diagnostics.ok) {
				console.log('All checks passed! 🎉');
				process.exitCode = ExitCode.SUCCESS;
			} else {
				console.log('Some checks failed. Please fix the issues above.');
				process.exitCode = failureExitCode;
			}
			return;
		}
	};
}

export async function runWcag(
	options: { file?: string; night?: boolean },
	command: Command,
) {
	const parentOptions = command.parent?.opts() as {
		file?: string;
		night?: boolean;
	};
	return runDesignTokenContrastCheck({ ...parentOptions, ...options });
}
