import { describe, test, expect } from 'bun:test';
import { createThemeDoctorContext, detectThemeFiles } from '../src/core/doctor/theme-context.ts';
import { extractDoctorPairs } from '../src/core/doctor/pair-extractor.ts';
import { loadTestTheme } from './utils/fixture-loader.ts';
import { loadThemefile, buildDependencyDictionary } from '../src/core/pipeline/theme-pipeline.ts';

describe('doctor theme context', () => {
  test('loads valid theme and exposes resolvedTree and doctorConfig', async () => {
    const theme = await loadTestTheme('doctor-contrast-pass');
    const loadResult = await loadThemefile(theme.themefile);
    expect('parsed' in loadResult).toBe(true);
    if (!('parsed' in loadResult)) return;

    const { parsed, themeDir } = loadResult;
    const dictResult = await buildDependencyDictionary(parsed, themeDir);
    expect('dict' in dictResult).toBe(true);
    if (!('dict' in dictResult)) return;

    const yamlPath = `${themeDir}/main.yaml`;
    const ctxResult = await createThemeDoctorContext(yamlPath, dictResult.dict);
    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) return;

    expect(ctxResult.context.expandedTree).toBeDefined();
    expect(ctxResult.context.resolvedTree).toBeDefined();
    expect(ctxResult.context.doctorConfig).toBeDefined();
  });

  test('strips doctor key from resolved tree', async () => {
    const theme = await loadTestTheme('doctor-contrast-pass');
    const loadResult = await loadThemefile(theme.themefile);
    expect('parsed' in loadResult).toBe(true);
    if (!('parsed' in loadResult)) return;

    const { parsed, themeDir } = loadResult;
    const dictResult = await buildDependencyDictionary(parsed, themeDir);
    expect('dict' in dictResult).toBe(true);
    if (!('dict' in dictResult)) return;

    const yamlPath = `${themeDir}/main.yaml`;
    const ctxResult = await createThemeDoctorContext(yamlPath, dictResult.dict);
    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) return;

    // doctor should NOT be in the resolved tree
    const resolved = ctxResult.context.resolvedTree as Record<string, unknown>;
    expect(resolved.doctor).toBeUndefined();
  });

  test('doctorConfig is undefined when no doctor key exists', async () => {
    const theme = await loadTestTheme('doctor-contrast-empty');
    const loadResult = await loadThemefile(theme.themefile);
    expect('parsed' in loadResult).toBe(true);
    if (!('parsed' in loadResult)) return;

    const { parsed, themeDir } = loadResult;
    const dictResult = await buildDependencyDictionary(parsed, themeDir);
    expect('dict' in dictResult).toBe(true);
    if (!('dict' in dictResult)) return;

    const yamlPath = `${themeDir}/main.yaml`;
    const ctxResult = await createThemeDoctorContext(yamlPath, dictResult.dict);
    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) return;

    expect(ctxResult.context.doctorConfig).toBeUndefined();
  });

  test('extractDoctorPairs reports errors for unresolved references', async () => {
    const theme = await loadTestTheme('doctor-contrast-invalid');
    const loadResult = await loadThemefile(theme.themefile);
    expect('parsed' in loadResult).toBe(true);
    if (!('parsed' in loadResult)) return;

    const { parsed, themeDir } = loadResult;
    const dictResult = await buildDependencyDictionary(parsed, themeDir);
    expect('dict' in dictResult).toBe(true);
    if (!('dict' in dictResult)) return;

    const yamlPath = `${themeDir}/main.yaml`;
    const ctxResult = await createThemeDoctorContext(yamlPath, dictResult.dict);
    expect(ctxResult.ok).toBe(true);
    if (!ctxResult.ok) return;

    const { pairs, errors } = extractDoctorPairs(
      ctxResult.context.doctorConfig!,
      ctxResult.context.resolvedTree,
    );
    expect(pairs).toHaveLength(0);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.message).toContain('foreground references unresolved');
  });

  test('detectThemeFiles finds main.yaml', async () => {
    const theme = await loadTestTheme('doctor-contrast-pass');
    const files = await detectThemeFiles(theme.dir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.name === 'main')).toBe(true);
  });
});
