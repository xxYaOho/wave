import { Command } from 'commander';
import { isatty } from 'node:tty';
import { runThemeContrastCheck } from '../../core/doctor/registry.ts';
import {
	createThemeDoctorContext,
	detectThemeFiles,
	type ThemeFileEntry,
} from '../../core/doctor/theme-context.ts';
import { selectTheme } from '../../core/doctor/theme-select.ts';
import type { DependencyDict } from '../../core/pipeline/theme-pipeline.ts';
import {
	buildDependencyDictionary,
	loadThemefile,
} from '../../core/pipeline/theme-pipeline.ts';
import type { DoctorThemeReport } from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';

const SEPARATOR = '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~';

interface DoctorCommandOptions {
	file?: string;
	contrast?: boolean;
	night?: boolean;
	variants?: string;
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

/**
 * Build the expected ThemeFileEntry suffix/name from explicit flags.
 * Returns null if no explicit scope flags are set (meaning we need auto-detection).
 */
function resolveExplicitTheme(
	allFiles: ThemeFileEntry[],
	night: boolean,
	variantName: string | undefined,
): ThemeFileEntry | undefined {
	if (!night && !variantName) return undefined;

	const baseName = variantName ?? 'main';
	const targetName = night ? `${baseName}@night` : baseName;

	const match = allFiles.find((f) => f.name === targetName);
	if (!match) {
		console.log(`✗ Theme not found: ${targetName}`);
		console.log(`  Available: ${allFiles.map((f) => f.name).join(', ')}`);
		process.exitCode = ExitCode.FILE_NOT_FOUND;
		return undefined;
	}
	return match;
}

interface DoctorCommandOptions {
	file?: string;
	contrast?: boolean;
	night?: boolean;
	variants?: string;
	theme?: boolean;
}

export const doctorCommand = new Command('doctor')
	.description('Run health diagnostics and contrast checks')
	.option('-f, --file <path>', 'Themefile path to validate')
	.option('-o, --output <path>', 'Output directory to check')
	.option('--contrast', 'Run WCAG contrast check on theme colors')
	.option('--night', 'Check night variant (use with --contrast)')
	.option(
		'--variants <name>',
		'Check specific variant by name (use with --contrast)',
	)
	.addOption(
		new Command().createOption(
			'--theme',
			'(deprecated) Use --contrast instead',
		).hideHelp(),
	)
	.action(async (options: DoctorCommandOptions) => {
		if (options.theme) {
			console.error(
				'Option "--theme" has been renamed to "--contrast".',
			);
			console.error('  wave doctor --contrast   Run WCAG contrast check');
			console.error('  wave doctor --help       Show available options');
			process.exitCode = ExitCode.INVALID_COMMAND;
			return;
		}
		if (!options.contrast) {
			console.log('🔍 Running Wave diagnostics...\n');

			const currentVersion = Bun.version;
			const minVersion = '1.0.0';
			const bunPassed = compareVersions(currentVersion, minVersion) >= 0;
			const icon = bunPassed ? '✓' : '✗';
			console.log(
				`${icon} Bun Version: ${bunPassed ? `v${currentVersion}` : `v${currentVersion} (requires >= v${minVersion})`}`,
			);

			let allPassed = bunPassed;

			if (options.file) {
				const { validateThemefile } = await import(
					'../../core/validator/config.ts'
				);
				const result = await validateThemefile({ themefilePath: options.file });
				const configIcon = result.valid ? '✓' : '✗';
				console.log(
					`${configIcon} Config File: ${result.valid ? `Valid (${result.config?.THEME || 'unknown'})` : result.errors[0] || 'Unknown error'}`,
				);
				if (!result.valid) allPassed = false;
			} else {
				console.log('✓ Config File: No themefile specified');
			}

			console.log('✓ Resources: All built-in resources available');
			console.log('✓ Output Directory: OK');
			console.log('');

			if (allPassed) {
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

		const dictResult = await buildDependencyDictionary(parsed, themeDir);
		if ('error' in dictResult) {
			console.log(`✗ ${dictResult.error.message}`);
			process.exitCode = ExitCode.GENERAL_ERROR;
			return;
		}

		const dict: DependencyDict = dictResult.dict;

		// Detect available theme files
		const allThemeFiles = await detectThemeFiles(themeDir);
		if (allThemeFiles.length === 0) {
			console.log('No theme files found.');
			process.exitCode = ExitCode.SUCCESS;
			return;
		}

		// Selection strategy:
		// 1. Explicit --night / --variants → non-interactive, resolve directly
		// 2. No explicit scope + interactive TTY + single theme → auto-select
		// 3. No explicit scope + interactive TTY + multiple themes → TUI selector
		// 4. No explicit scope + non-TTY → default to main
		let selectedTheme: ThemeFileEntry;

		const hasExplicitScope = !!options.night || !!options.variants;
		const explicit = resolveExplicitTheme(
			allThemeFiles,
			!!options.night,
			options.variants,
		);
		if (hasExplicitScope && !explicit) {
			return;
		}
		if (explicit) {
			selectedTheme = explicit;
		} else if (isatty(process.stdout.fd) && isatty(process.stdin.fd)) {
			// Interactive TTY
			if (allThemeFiles.length === 1) {
				selectedTheme = allThemeFiles[0]!;
			} else {
				selectedTheme = await selectTheme(allThemeFiles);
			}
		} else {
			// Non-TTY: default to main
			const mainFile = allThemeFiles.find((f) => f.name === 'main');
			if (!mainFile) {
				console.log('✗ No main theme file found');
				process.exitCode = ExitCode.FILE_NOT_FOUND;
				return;
			}
			selectedTheme = mainFile;
		}

		const displayThemeName = `${themeName}${selectedTheme.suffix}`;

		const ctxResult = await createThemeDoctorContext(selectedTheme.path, dict);
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
