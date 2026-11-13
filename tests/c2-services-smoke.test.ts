import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { runDesignTokenContrastCheck } from '../src/core/doctor/wcag-service.ts';
import { createProfile } from '../src/core/pipeline/profile-create.ts';
import {
	listBuiltinResources,
	showResource,
} from '../src/core/inspect/resource-service.ts';

const rootDir = path.resolve(import.meta.dir, '..');

describe('c2 core service API smoke', () => {
	test('inspect service returns structured resource data', async () => {
		const names = listBuiltinResources('palette');
		const result = await showResource('tailwindcss', 'json', 'palette', rootDir);
		expect(names).toContain('tailwindcss');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.output).toContain('tailwindcss');
	});

	test('profile service returns a dry-run result', async () => {
		const result = await createProfile('c2-smoke', {
			file: path.join(
				rootDir,
				'docs/island/plans/2026-11-12-c2-equivalence/fixtures/std-with-ids/main.yaml',
			),
			output: path.join('/tmp', 'c2-smoke.yaml'),
			dryRun: true,
		});
		expect(result.exitCode).toBe(0);
		expect(result.logs.some((entry) => entry.level === 'success')).toBe(true);
	});

	test('wcag service returns a structured check result', async () => {
		const result = await runDesignTokenContrastCheck({
			sourcePath: path.join(
				rootDir,
				'tests/fixtures/themes/doctor-contrast-pass/main.yaml',
			),
		});
		expect(result.kind).toBe('result');
		if (result.kind === 'result') {
			expect(result.displayThemeName).toBe('doctor-contrast-pass');
			expect(Array.isArray(result.reports)).toBe(true);
		}
	});
});
