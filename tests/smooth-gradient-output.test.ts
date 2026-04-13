import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const rootDir = path.resolve(__dirname, '..');

async function runWaveTheme(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', 'src/index.ts', 'theme', ...args], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

describe('smoothGradient CLI output', () => {
  test('generates derived gradient in JSON without $extensions', async () => {
    const fixtureDir = path.join(rootDir, 'tests/fixtures/smooth-gradient');
    const outputDir = path.join(rootDir, '.temp-test-smooth-gradient');

    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {}

    const { exitCode } = await runWaveTheme(['-f', path.join(fixtureDir, 'themefile'), '-o', outputDir, '--platform', 'json,css']);
    expect(exitCode).toBe(0);

    const json = JSON.parse(await fs.readFile(path.join(outputDir, 'smooth-gradient.json'), 'utf-8'));
    const stops = json['theme-gradient-hero'] as { color: string; position: number }[];

    expect(Array.isArray(stops)).toBe(true);
    expect(stops).toHaveLength(5);
    expect(stops[0]?.position).toBe(0);
    expect(stops[4]?.position).toBe(1);

    // Ensure $extensions did not leak into output
    const raw = await fs.readFile(path.join(outputDir, 'smooth-gradient.json'), 'utf-8');
    expect(raw).not.toContain('$extensions');
    expect(raw).not.toContain('smoothGradient');

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  test('generates CSS without gradient tokens (filtered by rootKey) and without $extensions', async () => {
    const fixtureDir = path.join(rootDir, 'tests/fixtures/smooth-gradient');
    const outputDir = path.join(rootDir, '.temp-test-smooth-gradient-css');

    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {}

    const { exitCode } = await runWaveTheme(['-f', path.join(fixtureDir, 'themefile'), '-o', outputDir, '--platform', 'json,css']);
    expect(exitCode).toBe(0);

    const css = await fs.readFile(path.join(outputDir, 'smooth-gradient.css'), 'utf-8');
    // Gradient rootKey is excluded from CSS (only color/style are included)
    expect(css).not.toContain('linear-gradient(to right');
    expect(css).not.toContain('$extensions');
    expect(css).not.toContain('smoothGradient');

    await fs.rm(outputDir, { recursive: true, force: true });
  });
});
