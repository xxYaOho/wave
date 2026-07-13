import { describe, expect, test } from 'bun:test';
import { extractDoctorPairs } from '../src/core/doctor/pair-extractor.ts';
import {
	createThemeDoctorContext,
	createThemeDoctorContextFromContent,
	detectThemeFiles,
} from '../src/core/doctor/theme-context.ts';
import {
	buildDependencyDictionary,
	loadThemefile,
	processThemeDocument,
} from '../src/core/pipeline/theme-pipeline.ts';
import { loadTestTheme } from './utils/fixture-loader.ts';

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

	test('rejects typography values that become invalid after resolution', async () => {
		const result = await createThemeDoctorContextFromContent(
			'/tmp/typography-invalid/main.yaml',
			`theme:
  dimension:
    invalid:
      $value: -1
  font:
    $type: typography
    $extensions:
      typography:
        defaults:
          fontFamily: Inter
          fontSize: "{theme.dimension.invalid}"
          fontWeight: 400
          lineHeight: 1.5
          letterSpacing: 0
    body:
      $value: {}
`,
			{},
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.findings[0]?.message).toContain(
			'Theme schema validation failed after reference resolution',
		);
		expect(result.findings[0]?.message).toContain(
			'theme.font.$extensions.typography.defaults.fontSize',
		);
	});

	test('rejects border dash values that become invalid after resolution', async () => {
		const result = await createThemeDoctorContextFromContent(
			'/tmp/border-dash-invalid/main.yaml',
			`theme:
  dimension:
    invalid:
      $value: -1
  border:
    $type: border
    antline:
      $value:
        color: "#000000"
        width: 1
        style:
          dashArray:
            - "{theme.dimension.invalid}"
            - 8
`,
			{},
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.findings[0]?.message).toContain(
			'Theme schema validation failed after reference resolution',
		);
		expect(result.findings[0]?.message).toContain(
			'theme.border.antline.$value.style.dashArray[0]',
		);
	});

	test('accepts border dash $ref dimensions with resolved swatch metadata', async () => {
		const result = await createThemeDoctorContextFromContent(
			'/tmp/border-dash-ref/main.yaml',
			`theme:
  dimension:
    dash:
      $type: dimension
      $value:
        value: 4
        unit: px
  border:
    $type: border
    antline:
      $value:
        color: "#000000"
        width: 1
        style:
          dashArray:
            - $ref: "#/theme/dimension/dash/$value"
            - 8
`,
			{},
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(JSON.stringify(result.context.resolvedTree)).toContain(
			'"_swatchName"',
		);
	});

	test('build and doctor reject the same missing materialized typography field', async () => {
		const content = `theme:
  font:
    $type: typography
    body:
      $value:
        fontFamily: Inter
        fontSize: 14
        fontWeight: 400
        lineHeight: 1.5
`;
		const yamlPath = '/tmp/typography-missing/main.yaml';
		const buildResult = await processThemeDocument(
			yamlPath,
			{},
			undefined,
			content,
		);
		const doctorResult = await createThemeDoctorContextFromContent(
			yamlPath,
			content,
			{},
		);

		expect(buildResult.ok).toBe(false);
		expect(doctorResult.ok).toBe(false);
		if (buildResult.ok || doctorResult.ok) return;
		const buildMessage = buildResult.message;
		const doctorMessage = doctorResult.findings[0]?.message ?? '';
		for (const expected of [
			'theme.font.body',
			'missing required fields: letterSpacing',
		]) {
			expect(buildMessage).toContain(expected);
			expect(doctorMessage).toContain(expected);
		}
	});
});
