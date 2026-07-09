import * as path from 'node:path';
import { Command } from 'commander';
import * as yaml from 'js-yaml';
import {
	findDimensionMigrationFindings,
	renderDimensionMigrationAdvice,
} from '../../core/doctor/dimension-migration.ts';
import { runThemeContrastCheck } from '../../core/doctor/registry.ts';
import {
	createThemeDoctorContext,
	createThemeDoctorContextFromContent,
} from '../../core/doctor/theme-context.ts';
import { runToolchainDoctor } from '../../core/doctor/toolchain.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
	type ProfileEntry,
	parseProfileDocument,
	resolveProfilesToBuild,
} from '../../core/pipeline/profile-resolver.ts';
import {
	buildDependencyDictionary,
	loadThemefile,
} from '../../core/pipeline/theme-pipeline.ts';
import type { DoctorThemeReport } from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';

const SEPARATOR = '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~';

async function fileExists(filePath: string): Promise<boolean> {
	return await Bun.file(filePath).exists();
}

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

export function createDoctorCommand(
	name = 'doctor',
	commandOptions: CreateDoctorCommandOptions = {},
): Command {
	return new Command(name)
		.description('Run health diagnostics and contrast checks')
		.option('-f, --file <path>', 'Themefile path to validate')
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

				let allPassed = bunPassed;
				let resourcesChecked = false;
				let resourcesPassed = true;
				const defaultMainPath = path.resolve(process.cwd(), 'main.yaml');
				const effectiveFile =
					options.file ??
					(commandOptions.defaultMainYaml === true &&
					(await fileExists(defaultMainPath))
						? defaultMainPath
						: undefined);

				if (effectiveFile) {
					const loadResult = await loadThemefile(effectiveFile);
					if ('error' in loadResult) {
						console.log(`✗ Config File: ${loadResult.error.message}`);
						allPassed = false;
					} else {
						console.log(
							`✓ Config File: Valid (${loadResult.parsed.THEME || 'unknown'})`,
						);
						const adjacentMainPath = path.join(loadResult.themeDir, 'main.yaml');
						const inspectPath =
							loadResult.mainYamlPath ??
							((await fileExists(adjacentMainPath))
								? adjacentMainPath
								: undefined);
						const dictResult = await buildDependencyDictionary(
							loadResult.parsed,
							loadResult.themeDir,
						);
						resourcesChecked = true;
						if ('error' in dictResult) {
							console.log(`✗ Resources: ${dictResult.error.message}`);
							resourcesPassed = false;
							allPassed = false;
							const findings = await inspectRawDimensionMigration(inspectPath);
							if (findings.length > 0) {
								console.log(renderDimensionMigrationAdvice(findings));
							}
						} else {
							if (!inspectPath) {
								console.log(
									'Theme: dimension migration check skipped; no main.yaml token entry found',
								);
							} else {
								const ctxResult = await createThemeDoctorContext(
									inspectPath,
									dictResult.dict,
								);
								if (ctxResult.ok) {
									const findings = findDimensionMigrationFindings(
										ctxResult.context.resolvedTree,
									);
									if (findings.length > 0) {
										console.log(renderDimensionMigrationAdvice(findings));
										allPassed = false;
									}
								} else {
									console.log(
										`✗ Theme: ${ctxResult.findings[0]?.message ?? 'Unable to inspect theme'}`,
									);
									allPassed = false;
								}
							}
						}
					}
				} else {
					console.log('✓ Config File: No themefile specified');
				}

				if (!resourcesChecked || resourcesPassed) {
					console.log('✓ Resources: All built-in resources available');
				}
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
			const loadResult = await loadThemefile(options.file);
			if ('error' in loadResult) {
				console.log(`✗ ${loadResult.error.message}`);
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}

			const { parsed, themeDir } = loadResult;
			const themeName = parsed.THEME || 'unknown';
			const profiles = await discoverProfiles(themeDir);
			if (profiles.length === 0) {
				console.log('No theme files found.');
				process.exitCode = ExitCode.SUCCESS;
				return;
			}

			let selectedEntries: ProfileEntry[];
			try {
				selectedEntries = resolveProfilesToBuild(profiles, {
					night: !!options.night,
					...(options.profile && { profile: options.profile }),
				});
			} catch (error) {
				console.log(
					`✗ ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}

			const baseProfile = profiles.find((profile) => profile.isDefault);
			if (!baseProfile) {
				console.log('✗ No main theme file found');
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}
			const baseDocument = await parseProfileDocument(baseProfile, {
				defaultParsed: parsed,
				baseDir: themeDir,
			});
			const selectedEntry = selectedEntries[0]!;
			const selectedDocument = selectedEntry.isDefault
				? baseDocument
				: await parseProfileDocument(selectedEntry, {
						baseParsed: baseDocument.parsed,
						baseDir: themeDir,
					});
			const profileDictResult = await buildDependencyDictionary(
				selectedDocument.parsed,
				themeDir,
			);
			if ('error' in profileDictResult) {
				console.log(`✗ ${profileDictResult.error.message}`);
				process.exitCode = ExitCode.GENERAL_ERROR;
				return;
			}

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
