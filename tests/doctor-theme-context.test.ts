import { describe, test, expect } from 'bun:test';
import { createThemeDoctorContext } from '../src/core/doctor/theme-context.ts';
import { loadTestTheme } from './utils/fixture-loader.ts';

describe('doctor theme context', () => {
  test('loads valid theme and exposes resolvedTree and expandedTree', async () => {
    const theme = await loadTestTheme('doctor-contrast-pass');
    const ctxResult = await createThemeDoctorContext(theme.themefile);
    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) return;

    expect(ctxResult.context.themeDir).toBe(theme.dir);
    expect(ctxResult.context.parsed.THEME).toBe('doctor-contrast-pass');
    expect(ctxResult.context.expandedTree).toBeDefined();
    expect(ctxResult.context.resolvedTree).toBeDefined();
  });

  test('returns ok=false for missing themefile', async () => {
    const ctxResult = await createThemeDoctorContext('/nonexistent/path/themefile');
    expect(ctxResult.ok).toBe(false);
    if (ctxResult.ok) return;
    expect(ctxResult.exitCode).not.toBe(0);
    expect(ctxResult.findings[0]!.message).toContain('not found');
  });

  test('returns ok=false for schema error (invalid doctorPairs)', async () => {
    const theme = await loadTestTheme('doctor-contrast-invalid');
    const ctxResult = await createThemeDoctorContext(theme.themefile);
    expect(ctxResult.ok).toBe(false);
    if (ctxResult.ok) return;
    expect(ctxResult.exitCode).not.toBe(0);
    expect(ctxResult.findings[0]!.message.toLowerCase()).toContain('schema validation failed');
    expect(ctxResult.findings[0]!.message).toContain('doctorPairs can only be used with $type "color"');
  });

  test('resolvedTree contains resolved color values', async () => {
    const theme = await loadTestTheme('doctor-contrast-pass');
    const ctxResult = await createThemeDoctorContext(theme.themefile);
    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) return;

    const resolved = ctxResult.context.resolvedTree as Record<string, unknown>;
    const themeGroup = resolved.theme as Record<string, unknown> | undefined;
    expect(themeGroup).toBeDefined();
    const colorGroup = themeGroup!.color as Record<string, unknown> | undefined;
    expect(colorGroup).toBeDefined();
    const bgToken = colorGroup!.background as Record<string, unknown> | undefined;
    expect(bgToken).toBeDefined();
    expect(bgToken!.$value).toBe('#000000');
  });
});
