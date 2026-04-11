import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');

async function runWave(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', 'src/index.ts', ...args], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

describe('wave doctor', () => {
  test('legacy doctor command runs without crashing', async () => {
    const { exitCode, stdout } = await runWave(['doctor']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Running Wave diagnostics');
    expect(stdout).toContain('All checks passed!');
  });

  test('--theme with pass fixture exits 0 and shows green scores', async () => {
    const { exitCode, stdout } = await runWave([
      'doctor',
      '--theme',
      '--file',
      'tests/fixtures/themes/doctor-contrast-pass/themefile',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Contrast Check');
    expect(stdout).toContain('doctor-contrast-pass');
    expect(stdout).toContain('primary-main');
    expect(stdout).toContain('🟢 Normal Text   (AAA)');
    expect(stdout).toContain('🟢 Large Text    (AAA)');
    expect(stdout).toContain('🟢 UI Components (AA)');
    expect(stdout).not.toContain('🔴');
  });

  test('--theme with report fixture exits 0 and shows red scores', async () => {
    const { exitCode, stdout } = await runWave([
      'doctor',
      '--theme',
      '--file',
      'tests/fixtures/themes/doctor-contrast-report/themefile',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Contrast Check');
    expect(stdout).toContain('doctor-contrast-report');
    expect(stdout).toContain('🔴 Normal Text');
    expect(stdout).toContain('🔴 Large Text');
    expect(stdout).toContain('🔴 UI Components');
  });

  test('--theme with invalid fixture exits non-zero', async () => {
    const { exitCode, stdout } = await runWave([
      'doctor',
      '--theme',
      '--file',
      'tests/fixtures/themes/doctor-contrast-invalid/themefile',
    ]);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('✗');
  });

  test('--theme with empty fixture exits 0 and indicates no pairs', async () => {
    const { exitCode, stdout } = await runWave([
      'doctor',
      '--theme',
      '--file',
      'tests/fixtures/themes/doctor-contrast-empty/themefile',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('No wcagPairs found to evaluate');
  });
});
