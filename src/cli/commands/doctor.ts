import { Command } from 'commander';
import { ExitCode } from '../../types/index.ts';
import { createDoctorRegistry } from '../../core/doctor/registry.ts';
import { runDoctor } from '../../core/doctor/runner.ts';
import { REPORT_SEPARATOR } from '../../core/doctor/findings.ts';
import type { DoctorThemeReport } from '../../types/index.ts';

function renderScoreLines(report: DoctorThemeReport): string[] {
  const lines: string[] = [];

  const normalAAA = report.scores.find((s) => s.dimension === 'Normal Text' && s.level === 'AAA')?.pass;
  const normalAA = report.scores.find((s) => s.dimension === 'Normal Text' && s.level === 'AA')?.pass;
  if (normalAAA) {
    lines.push(`🟢 Normal Text (AAA)`);
  } else if (normalAA) {
    lines.push(`🟢 Normal Text (AA)`);
  } else {
    lines.push(`🔴 Normal Text`);
  }

  const largeAAA = report.scores.find((s) => s.dimension === 'Large Text' && s.level === 'AAA')?.pass;
  const largeAA = report.scores.find((s) => s.dimension === 'Large Text' && s.level === 'AA')?.pass;
  if (largeAAA) {
    lines.push(`🟢 Large Text (AAA)`);
  } else if (largeAA) {
    lines.push(`🟢 Large Text (AA)`);
  } else {
    lines.push(`🔴 Large Text`);
  }

  const uiAA = report.scores.find((s) => s.dimension === 'UI Components' && s.level === 'AA')?.pass;
  if (uiAA) {
    lines.push(`🟢 UI Components (AA)`);
  } else {
    lines.push(`🔴 UI Components`);
  }

  return lines;
}

export const doctorCommand = new Command('doctor')
  .description('Check tool health status')
  .option('-f, --file <path>', 'Themefile path to validate')
  .option('-o, --output <path>', 'Output directory to check')
  .option('--theme', 'Run theme contrast check')
  .action(async (options) => {
    const registry = createDoctorRegistry({
      themefilePath: options.file,
      outputPath: options.output,
      themeMode: options.theme,
    });

    const result = await runDoctor(registry);

    if (!options.theme) {
      console.log('🔍 Running Wave diagnostics...\n');
      let allPassed = true;
      for (const checkResult of result.checks) {
        const icon = checkResult.ok ? '✓' : '✗';
        const message = checkResult.firstError || 'OK';
        console.log(`${icon} ${checkResult.name}: ${message}`);
        if (!checkResult.ok) {
          allPassed = false;
        }
      }
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

    // --theme mode output
    if (result.reports.length === 0 && result.blockingErrors.length === 0) {
      console.log('Contrast Check');
      console.log(REPORT_SEPARATOR);
      console.log('No doctorPairs found to evaluate.');
      process.exitCode = ExitCode.SUCCESS;
      return;
    }

    console.log('Contrast Check');
    console.log(REPORT_SEPARATOR);

    for (let i = 0; i < result.reports.length; i++) {
      const report = result.reports[i];
      if (i > 0) {
        console.log('');
      }
      console.log('Pair');
      console.log(`  foreground: ${report.pair.foregroundPath}`);
      console.log(`  background: ${report.pair.backgroundPath}`);
      console.log('Contrast Ratio');
      console.log(`  ${report.ratio.toFixed(2)}:1`);
      console.log('Score');
      for (const line of renderScoreLines(report)) {
        console.log(line);
      }
    }

    if (result.blockingErrors.length > 0) {
      console.log('');
      for (const err of result.blockingErrors) {
        console.log(`✗ ${err.message}`);
      }
      process.exitCode = ExitCode.GENERAL_ERROR;
    } else {
      process.exitCode = ExitCode.SUCCESS;
    }
  });
