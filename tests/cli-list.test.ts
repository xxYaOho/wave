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

describe('wave list', () => {
  test('lists built-in palettes and dimensions', async () => {
    const { exitCode, stdout } = await runWave(['list']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('leonardo');
    expect(stdout).toContain('tailwindcss4');
    expect(stdout).toContain('wave');
    expect(stdout).toContain('Palettes:');
    expect(stdout).toContain('Dimensions:');
  });
});
