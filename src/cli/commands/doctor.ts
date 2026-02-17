import { Command } from 'commander';
import { ExitCode, type CheckResult } from '../../types/index.ts';

export const doctorCommand = new Command('doctor')
  .description('Check tool health status')
  .action(async () => {
    console.log('Running Wave diagnostics...\n');

    const checks = [
      checkBunVersion(),
      checkResources(),
    ];

    let allPassed = true;

    for (const check of checks) {
      const result = await check;
      const icon = result.success ? '✓' : '✗';
      console.log(`${icon} ${result.name}: ${result.message}`);

      if (!result.success && result.suggestion) {
        console.log(`  → ${result.suggestion}`);
        allPassed = false;
      }
    }

    console.log('');
    if (allPassed) {
      console.log('All checks passed!');
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

function checkResources(): Promise<CheckResult & { name: string }> {
  const resourcesDir = import.meta.dir + '/../../resources';
  const palettesDir = resourcesDir + '/palettes';
  const dimensionsDir = resourcesDir + '/dimensions';

  const palettesExists = Bun.file(palettesDir).size !== undefined;
  const dimensionsExists = Bun.file(dimensionsDir).size !== undefined;

  return Promise.resolve({
    name: 'Resources',
    success: true,
    message: palettesExists && dimensionsExists
      ? 'All built-in resources available'
      : 'Some resources missing (this is expected in initial setup)',
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
