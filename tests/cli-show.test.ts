import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

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

describe('wave show', () => {
  test('outputs flat-json for a palette by default', async () => {
    const { exitCode, stdout } = await runWave(['show', 'tailwindcss4']);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(typeof parsed).toBe('object');
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    // Should contain flat keys like tailwindcss4.color.red.50
    const hasFlatKey = Object.keys(parsed).some((k) => k.startsWith('tailwindcss4.color.'));
    expect(hasFlatKey).toBe(true);
  });

  test('outputs yaml for a dimension', async () => {
    const { exitCode, stdout } = await runWave(['show', 'wave', '--format', 'yaml']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('wave:');
  });

  test('outputs nested json for a palette', async () => {
    const { exitCode, stdout } = await runWave(['show', 'leonardo', '--format', 'json']);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('leonardo');
  });

  test('returns error for nonexistent resource', async () => {
    const { exitCode, stderr } = await runWave(['show', 'nonexistent']);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('not found');
  });

  test('returns error for unknown format', async () => {
    const { exitCode, stderr } = await runWave(['show', 'wave', '--format', 'xml']);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown format');
  });
});
