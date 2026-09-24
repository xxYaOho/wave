import * as path from 'node:path';
import { Command } from 'commander';
import * as yaml from 'js-yaml';
import {
	findDimensionMigrationFindings,
	renderDimensionMigrationAdvice,
} from '../../core/doctor/dimension-migration.ts';
import {
	collectThemeIdentityReport,
	describeIdentityConflict,
	identityBlockingFindings,
	loadIdentityInputs,
} from '../../core/doctor/identity.ts';
import { runThemeContrastCheck } from '../../core/doctor/registry.ts';
import { validateDeclaredResources } from '../../core/doctor/resource-validator.ts';
import {
	createThemeDoctorContextFromContent,
	detectThemeFiles,
} from '../../core/doctor/theme-context.ts';
import { runToolchainDoctor } from '../../core/doctor/toolchain.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
	type ProfileDocument,
	type ProfileEntry,
	parseProfileDocument,
	resolveProfilesToBuild,
} from '../../core/pipeline/profile-resolver.ts';
import { collectDependencyDictionary } from '../../core/pipeline/theme-pipeline.ts';
import {
	type LoadedDesignTokenWorkspace,
	loadDesignTokenWorkspace,
} from '../../core/pipeline/workspace-loader.ts';
import type { DoctorThemeReport } from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';

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

function compareVersions(a: string, b: string): number {
	const partsA = a.split('.').map(Number);
	const partsB = b.split('.').map(Number);
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const numA = partsA[i] ?? 0;
		const numB = partsB[i] ?? 0;
		if (numA > numB) return 1;
		if (numA < numB) return -1;
	}
	return 0;
}

interface DoctorCommandOptions {
	file?: string;
	contrast?: boolean;
	night?: boolean;
	profile?: string;
	theme?: boolean;
	json?: boolean;
	verbose?: boolean;
	status?: boolean;
}

interface CreateDoctorCommandOptions {
	defaultMainYaml?: boolean;
}

function defaultProfileDocument(
	workspace: LoadedDesignTokenWorkspace,
	entry: ProfileEntry,
): ProfileDocument {
	return {
		entry,
		config: workspace.config,
		buildDir: workspace.workspaceDir,
		tokenContent: workspace.tokenContent,
	};
}

async function selectProfileDocument(
	workspace: LoadedDesignTokenWorkspace,
	profile?: string,
): Promise<{ document: ProfileDocument; entry: ProfileEntry }> {
	const profiles = await discoverProfiles(workspace.workspaceDir);
	const baseEntry = profiles.find((entry) => entry.isDefault);
	if (!baseEntry) throw new Error('No main.yaml found');
	const baseDocument = defaultProfileDocument(workspace, baseEntry);
	const entry = resolveProfilesToBuild(profiles, {
		night: false,
		...(profile ? { profile } : {}),
	})[0]!;
	const document = entry.isDefault
		? baseDocument
		: await parseProfileDocument(entry, {
				baseConfig: baseDocument.config,
				baseDir: workspace.workspaceDir,
			});
	return { document, entry };
}

function renderWorkspaceLoadFailure(
	result: Extract<
		Awaited<ReturnType<typeof loadDesignTokenWorkspace>>,
		{ ok: false }
	>,
): void {
	console.log(`✗ ${result.message}`);
	process.exitCode = result.exitCode;
}

/**
 * Scan every theme file of the workspace for token identity health, print the
 * report, and return whether no blocking finding (cross-file id conflict,
 * DTCG §5.2.2 undecidable token type) exists. Detail lists are capped unless
 * --verbose is set.
 */
async function renderThemeIdentityReport(
	themeDir: string,
	verbose = false,
): Promise<boolean> {
	const entries = await detectThemeFiles(themeDir);
	const labelOf = new Map(
		entries.map((entry) => [entry.name, path.relative(themeDir, entry.path)]),
	);
	const inputs = await loadIdentityInputs(
		entries.map((entry) => {
			const nightStem = entry.name.endsWith('@night')
				? entry.name.slice(0, -'@night'.length)
				: undefined;
			const baseLabel =
				nightStem !== undefined ? labelOf.get(nightStem) : undefined;
			return {
				label: path.relative(themeDir, entry.path),
				path: entry.path,
				baseLabel,
			};
		}),
	);
	const report = collectThemeIdentityReport(inputs);

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
	return identityBlockingFindings(report).length === 0;
}

export function createDoctorCommand(
	name = 'doctor',
	commandOptions: CreateDoctorCommandOptions = {},
): Command {
	return new Command(name)
		.description('Run health diagnostics and contrast checks')
		.option('-f, --file <path>', 'main.yaml path to validate')
		.option('-o, --output <path>', 'Output directory to check')
		.option('--contrast', 'Run WCAG contrast check on theme colors')
		.option('--night', 'Check night profile (use with --contrast)')
		.option(
			'--profile <name>',
			'Check specific profile by name (use with --contrast)',
		)
		.option('--json', 'Output structured JSON for core diagnostics')
		.option('--verbose', 'Show detailed core diagnostics')
		.option('--status', 'Show compact core health status')
		.addOption(
			new Command()
				.createOption('--theme', '(deprecated) Use --contrast instead')
				.hideHelp(),
		)
		.action(async (options: DoctorCommandOptions) => {
			if (options.theme) {
				console.error('Option "--theme" has been renamed to "--contrast".');
				console.error('  wave doctor --contrast   Run WCAG contrast check');
				console.error('  wave doctor --help       Show available options');
				process.exitCode = ExitCode.INVALID_COMMAND;
				return;
			}
			if (!options.contrast) {
				let workspaceTheme: string | undefined;
				let identityOk = true;
				if (
					commandOptions.defaultMainYaml === true ||
					options.file !== undefined
				) {
					const loadResult = await loadDesignTokenWorkspace(options.file);
					if (!loadResult.ok) {
						renderWorkspaceLoadFailure(loadResult);
						return;
					}

					let selected: Awaited<ReturnType<typeof selectProfileDocument>>;
					try {
						selected = await selectProfileDocument(
							loadResult.workspace,
							options.profile,
						);
					} catch (error) {
						console.log(
							`✗ ${error instanceof Error ? error.message : String(error)}`,
						);
						process.exitCode = ExitCode.FILE_NOT_FOUND;
						return;
					}

					workspaceTheme = selected.document.config.theme;
					const resourceResult = await validateDeclaredResources(
						selected.document.config,
						selected.document.buildDir,
					);
					if (!resourceResult.ok) {
						console.log(`✗ Resources: ${resourceResult.message}`);
						const findings = await inspectRawDimensionMigration(
							selected.entry.path,
						);
						if (findings.length > 0) {
							console.log(renderDimensionMigrationAdvice(findings));
						}
						process.exitCode = ExitCode.GENERAL_ERROR;
						return;
					}

					const contextResult = await createThemeDoctorContextFromContent(
						selected.entry.path,
						selected.document.tokenContent,
						resourceResult.dictionary.dict,
					);
					if (!contextResult.ok) {
						console.log(
							`✗ Theme: ${contextResult.findings[0]?.message ?? 'Unable to inspect theme'}`,
						);
						process.exitCode = contextResult.exitCode;
						return;
					}
					const findings = findDimensionMigrationFindings(
						contextResult.context.resolvedTree,
					);
					if (findings.length > 0) {
						console.log(renderDimensionMigrationAdvice(findings));
						process.exitCode = ExitCode.GENERAL_ERROR;
						return;
					}

					// Token identity health: multi-pass scan across every theme file.
					if (!options.json && !options.status) {
						identityOk = await renderThemeIdentityReport(
							loadResult.workspace.workspaceDir,
							options.verbose === true,
						);
					}
				}

				const toolchain = await runToolchainDoctor({ module: 'core' });
				if (options.json) {
					console.log(JSON.stringify(toolchain, null, 2));
					process.exitCode = toolchain.ok
						? ExitCode.SUCCESS
						: ExitCode.GENERAL_ERROR;
					return;
				}
				if (options.status) {
					const failed = toolchain.checks.filter(
						(check) => check.status === 'fail',
					).length;
					const warned = toolchain.checks.filter(
						(check) => check.status === 'warn',
					).length;
					const passed = toolchain.checks.filter(
						(check) => check.status === 'pass',
					).length;
					console.log(
						`wave: ${toolchain.ok ? 'ok' : 'needs attention'} (${passed} pass, ${warned} warn, ${failed} fail)`,
					);
					process.exitCode = toolchain.ok
						? ExitCode.SUCCESS
						: ExitCode.GENERAL_ERROR;
					return;
				}
				console.log('🔍 Running Wave diagnostics...\n');

				const currentVersion = Bun.version;
				const minVersion = '1.0.0';
				const bunPassed = compareVersions(currentVersion, minVersion) >= 0;
				const icon = bunPassed ? '✓' : '✗';
				console.log(
					`${icon} Bun Version: ${bunPassed ? `v${currentVersion}` : `v${currentVersion} (requires >= v${minVersion})`}`,
				);

				const allPassed = bunPassed && identityOk;
				console.log(
					workspaceTheme
						? `✓ Config File: Valid (${workspaceTheme})`
						: '✓ Config File: No main.yaml specified',
				);
				console.log('✓ Resources: All declared resources valid');
				console.log('✓ Output Directory: OK');
				if (options.verbose || toolchain.issues.length > 0) {
					for (const check of toolchain.checks) {
						const icon = check.status === 'pass' ? '✓' : '✗';
						console.log(`${icon} ${check.name}: ${check.message}`);
					}
				}
				console.log('');

				if (allPassed && toolchain.ok) {
					console.log('All checks passed! 🎉');
					process.exitCode = ExitCode.SUCCESS;
				} else {
					console.log('Some checks failed. Please fix the issues above.');
					process.exitCode = ExitCode.GENERAL_ERROR;
				}
				return;
			}

			// --contrast mode
			const loadResult = await loadDesignTokenWorkspace(options.file);
			if (!loadResult.ok) {
				renderWorkspaceLoadFailure(loadResult);
				return;
			}

			const { workspace } = loadResult;
			const themeName = workspace.config.theme;
			let selected: Awaited<ReturnType<typeof selectProfileDocument>>;
			try {
				selected = await selectProfileDocument(workspace, options.profile);
			} catch (error) {
				console.log(
					`✗ ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}
			const selectedEntry = selected.entry;
			const selectedDocument = selected.document;
			const profileDictResult = await collectDependencyDictionary(
				selectedDocument.config,
				selectedDocument.buildDir,
			);

			let contextPath = selectedEntry.path;
			let contextContent = selectedDocument.tokenContent;
			let displayThemeName = selectedEntry.isDefault
				? themeName
				: `${themeName}-${selectedEntry.name}`;
			if (options.night) {
				if (!selectedEntry.nightPath) {
					console.log(NIGHT_SKIP_MESSAGE);
					process.exitCode = ExitCode.SUCCESS;
					return;
				}
				const dayRaw = yaml.load(selectedDocument.tokenContent);
				const nightRaw = yaml.load(
					await Bun.file(selectedEntry.nightPath).text(),
				);
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
				contextPath = selectedEntry.nightPath;
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

			const context = ctxResult.context;
			const checkResult = await runThemeContrastCheck(context);

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
				if (i > 0) {
					console.log(SEPARATOR);
				}
				console.log(report.pair.name);
				console.log(`  ${report.ratio.toFixed(2)}:1`);
				console.log('Score');
				for (const line of renderScoreLines(report)) {
					console.log(line);
				}
			}
			console.log(SEPARATOR);

			if (checkResult.blockingErrors.length > 0) {
				console.log('');
				for (const err of checkResult.blockingErrors) {
					console.log(`✗ ${err.message}`);
				}
				process.exitCode = ExitCode.GENERAL_ERROR;
			} else {
				process.exitCode = ExitCode.SUCCESS;
			}
		});
}

export const doctorCommand = createDoctorCommand('doctor');
