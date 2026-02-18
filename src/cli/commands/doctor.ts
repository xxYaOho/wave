import { Command } from 'commander';
import { ExitCode, type CheckResult } from '../../types/index.ts';
import { checkBuiltinResources, checkOutputDir, createConfigCheck } from '../../core/validator/index.ts';

export const doctorCommand = new Command('doctor')
  .description('Check tool health status')
  .option('-f, --file <path>', 'Themefile path to validate')
  .option('-o, --output <path>', 'Output directory to check')
  .action(async (options) => {
    console.log('🔍 Running Wave diagnostics...\n');

    const checks: Array<() => Promise<CheckResult & { name: string }>> = [
      checkBunVersion,
      () => Promise.resolve(checkBuiltinResources()),
      createConfigCheck(options.file),
      () => Promise.resolve(checkOutputDir(options.output)),
    ];

    let allPassed = true;

    for (const check of checks) {
      const result = await check();
      const icon = result.success ? '✓' : '✗';
      console.log(`${icon} ${result.name}: ${result.message}`);

      if (!result.success && result.suggestion) {
        console.log(`  → ${result.suggestion}`);
        allPassed = false;
      }
    }

    console.log('');
    if (allPassed) {
      console.log('All checks passed! 🎉');
      process.exit(ExitCode.SUCCESS);
    } else {
      console.log('Some checks failed. Please fix the issues above.');
      process.exit(ExitCode.GENERAL_ERROR);
    }
  });

function checkBunVersion(): Promise<CheckResult & { name: string }> {
  const currentVersion = Bun.version;
  const minVersion = '1.0.0';
  const passed = compareVersions(currentVersion, minVersion) >= 0;

  return Promise.resolve({
    name: 'Bun Version',
    success: passed,
    message: passed
      ? `v${currentVersion}`
      : `v${currentVersion} (requires >= v${minVersion})`,
    suggestion: passed ? undefined : 'Run: bun upgrade',
  });
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
