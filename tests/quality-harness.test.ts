import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	DESIGN_TOKEN_CASES,
	getDesignTokenCases,
} from '../benchmarks/design-token/cases.ts';
import { checkDesignTokenGenerateThemeEquivalence } from '../benchmarks/design-token/equivalence.ts';
import { runDesignTokenBenchmarkCase } from '../benchmarks/design-token/runner.ts';
import {
	createSyntheticMainYaml,
	SYNTHETIC_MIXED_1000,
} from '../benchmarks/design-token/synthetic.ts';
import { prepareDesignTokenWorkspace } from '../benchmarks/design-token/workspace.ts';
import { collectFileArtifacts } from '../benchmarks/shared/artifacts.ts';
import { compareSuiteReports } from '../benchmarks/shared/compare.ts';
import { withEnv } from '../benchmarks/shared/env.ts';
import { sha256Text } from '../benchmarks/shared/hash.ts';
import type { BenchmarkSuiteReport } from '../benchmarks/shared/report.ts';

describe('Quality Harness design-token case registry', () => {
	test('keeps default design-token benchmark cases on the main-config entry', () => {
		const defaultCases = getDesignTokenCases('default');

		expect(defaultCases.length).toBeGreaterThan(0);
		expect(
			defaultCases.every((testCase) => testCase.entryKind === 'main-config'),
		).toBe(true);
		expect(
			defaultCases.some((testCase) => testCase.id === 'sketch-extensions'),
		).toBe(true);
		expect(defaultCases.some((testCase) => testCase.id === 'standard')).toBe(
			false,
		);
	});

	test('keeps legacy themefile cases outside default comparison', () => {
		const legacyCases = getDesignTokenCases('legacy');

		expect(legacyCases.length).toBeGreaterThan(0);
		expect(
			legacyCases.every(
				(testCase) => testCase.entryKind === 'themefile-legacy',
			),
		).toBe(true);
		expect(
			DESIGN_TOKEN_CASES.filter(
				(testCase) =>
					testCase.entryKind === 'themefile-legacy' &&
					testCase.compareDurations,
			),
		).toEqual([]);
	});

	test('registers example-derived cases with traceable source and risks', () => {
		const exampleCases = DESIGN_TOKEN_CASES.filter(
			(testCase) => testCase.origin === 'example-derived',
		);

		expect(exampleCases.length).toBeGreaterThan(0);
		expect(
			exampleCases.every((testCase) => testCase.entryKind === 'main-config'),
		).toBe(true);
		for (const testCase of exampleCases) {
			expect(testCase.example?.sourceName).toBeTruthy();
			expect(testCase.example?.reason).toContain('real');
			expect(testCase.example?.risks.length).toBeGreaterThan(0);
		}

		const orca = getDesignTokenCases('default').find(
			(testCase) => testCase.id === 'orca-realistic',
		);
		expect(orca?.origin).toBe('example-derived');
		expect(orca?.example?.risks).toContain('variants');
		expect(orca?.example?.risks).toContain('css and sketch outputs');
	});
});

describe('Quality Harness synthetic design-token source', () => {
	test('generates deterministic main.yaml for the same seed and options', () => {
		const first = createSyntheticMainYaml(SYNTHETIC_MIXED_1000);
		const second = createSyntheticMainYaml(SYNTHETIC_MIXED_1000);

		expect(sha256Text(first)).toBe(sha256Text(second));
		expect(first).toContain('$config:');
		expect(first).toContain('./resources/tailwindcss.yaml');
		expect(first).toContain('./resources/wave.yaml');
		expect(first).toContain('theme:');
	});
});

describe('Quality Harness artifact collection', () => {
	test('collects stable file hashes and byte sizes', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-qh-'));
		try {
			await fs.mkdir(path.join(tempDir, 'nested'));
			await fs.writeFile(path.join(tempDir, 'a.txt'), 'alpha', 'utf-8');
			await fs.writeFile(
				path.join(tempDir, 'nested', 'b.txt'),
				'beta',
				'utf-8',
			);

			const artifacts = await collectFileArtifacts(tempDir);

			expect(artifacts.map((artifact) => artifact.relativePath)).toEqual([
				'a.txt',
				path.join('nested', 'b.txt'),
			]);
			expect(artifacts[0]?.bytes).toBe(5);
			expect(artifacts[0]?.sha256).toBe(sha256Text('alpha'));
			expect(artifacts[1]?.sha256).toBe(sha256Text('beta'));
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});

describe('Quality Harness report comparison', () => {
	function minimalReport(
		runId: string,
		overrides: Partial<BenchmarkSuiteReport['cases'][number]> = {},
	): BenchmarkSuiteReport {
		return {
			schemaVersion: 1,
			name: 'design-token',
			runId,
			mode: 'smoke',
			createdAt: '2026-06-20T00:00:00.000Z',
			node: 'v0.0.0',
			bun: '0.0.0',
			cases: [
				{
					id: 'case-a',
					caseVersion: 1,
					mode: 'smoke',
					entryKind: 'main-config',
					status: 'success',
					iterations: 1,
					warmup: 0,
					tokensCount: 1,
					outputFiles: 1,
					outputBytes: 5,
					outputFileNames: ['a.json'],
					files: [
						{
							relativePath: 'a.json',
							path: '/tmp/a.json',
							bytes: 5,
							sha256: 'hash-a',
						},
					],
					resources: [],
					phases: {
						prepareMs: 0,
						loadMs: 1,
						resourceMs: 1,
						groupPassMs: 1,
						processMs: 1,
						generateMs: 1,
						pipelineDurationMs: 5,
						totalWallMs: 6,
					},
					stats: {
						meanMs: 5,
						minMs: 5,
						maxMs: 5,
						p95Ms: 5,
					},
					...overrides,
				},
			],
		};
	}

	test('fails comparison when artifact hash changes without size changes', () => {
		const base = minimalReport('base');
		const current = minimalReport('current', {
			files: [
				{
					relativePath: 'a.json',
					path: '/tmp/a.json',
					bytes: 5,
					sha256: 'hash-b',
				},
			],
		});

		const comparison = compareSuiteReports(base, current);

		expect(comparison.ok).toBe(false);
		expect(comparison.cases[0]?.status).toBe('changed');
		expect(comparison.cases[0]?.notes.join('\n')).toContain(
			'artifact changed: a.json',
		);
	});

	test('fails comparison when current report adds a case', () => {
		const base = minimalReport('base');
		const current = minimalReport('current');
		current.cases.push({
			...current.cases[0]!,
			id: 'case-b',
			files: [],
			outputFileNames: [],
		});

		const comparison = compareSuiteReports(base, current);

		expect(comparison.ok).toBe(false);
		expect(comparison.cases.find((item) => item.id === 'case-b')?.status).toBe(
			'new',
		);
	});
});

describe('Quality Harness workspace and runner', () => {
	test('prepares isolated design-token workspace resources', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-qh-'));
		try {
			const testCase = DESIGN_TOKEN_CASES.find(
				(candidate) => candidate.id === 'config-main',
			);
			expect(testCase).toBeDefined();
			const prepared = await prepareDesignTokenWorkspace(
				testCase!,
				path.join(tempDir, 'workspace'),
			);
			const mainYaml = await fs.readFile(prepared.mainYamlPath!, 'utf-8');

			expect(mainYaml).toContain('./resources/tailwindcss.yaml');
			expect(mainYaml).toContain('./resources/wave.yaml');
			expect(prepared.resources.map((resource) => resource.ref).sort()).toEqual(
				['./resources/tailwindcss.yaml', './resources/wave.yaml'],
			);
			expect(
				await fs.exists(
					path.join(prepared.workspaceDir, 'resources/wave.yaml'),
				),
			).toBe(true);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('restores resource env overrides after success and failure', async () => {
		const original = process.env.WAVE_RESOURCE_CACHE_DIR;
		process.env.WAVE_RESOURCE_CACHE_DIR = 'before-quality-harness';
		try {
			await withEnv(
				{ WAVE_RESOURCE_CACHE_DIR: 'inside-quality-harness' },
				async () => {
					expect(process.env.WAVE_RESOURCE_CACHE_DIR).toBe(
						'inside-quality-harness',
					);
				},
			);
			expect(process.env.WAVE_RESOURCE_CACHE_DIR).toBe(
				'before-quality-harness',
			);

			await expect(
				withEnv({ WAVE_RESOURCE_CACHE_DIR: 'inside-failure' }, async () => {
					throw new Error('intentional failure');
				}),
			).rejects.toThrow('intentional failure');
			expect(process.env.WAVE_RESOURCE_CACHE_DIR).toBe(
				'before-quality-harness',
			);
		} finally {
			if (original === undefined) {
				delete process.env.WAVE_RESOURCE_CACHE_DIR;
			} else {
				process.env.WAVE_RESOURCE_CACHE_DIR = original;
			}
		}
	});

	test('runs a smoke design-token case with phase metrics and artifacts', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-qh-'));
		try {
			const testCase = getDesignTokenCases('smoke').find(
				(candidate) => candidate.id === 'config-main',
			);
			expect(testCase).toBeDefined();
			const result = await runDesignTokenBenchmarkCase(testCase!, {
				mode: 'smoke',
				runId: 'test-runner',
				iteration: 0,
				tmpRoot: tempDir,
			});

			expect(result.status).toBe('success');
			expect(result.tokensCount).toBeGreaterThan(0);
			expect(result.outputBytes).toBeGreaterThan(0);
			expect(result.outputFileNames.length).toBeGreaterThan(0);
			expect(result.phases.loadMs).toBeGreaterThanOrEqual(0);
			expect(result.phases.resourceMs).toBeGreaterThanOrEqual(0);
			expect(result.phases.groupPassMs).toBeGreaterThanOrEqual(0);
			expect(result.phases.processMs).toBeGreaterThanOrEqual(0);
			expect(result.phases.generateMs).toBeGreaterThanOrEqual(0);
			expect(result.phases.pipelineDurationMs).toBeGreaterThanOrEqual(
				result.phases.loadMs,
			);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('runs an example-derived design-token case with variant artifacts', async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-qh-'));
		try {
			const testCase = getDesignTokenCases('default').find(
				(candidate) => candidate.id === 'orca-realistic',
			);
			expect(testCase).toBeDefined();
			const result = await runDesignTokenBenchmarkCase(testCase!, {
				mode: 'default',
				runId: 'test-orca-realistic',
				iteration: 0,
				tmpRoot: tempDir,
			});

			expect(result.status).toBe('success');
			expect(result.outputFileNames).toEqual([
				path.join('css', 'orca-realistic-assistant-app.css'),
				path.join('css', 'orca-realistic-viz-fos.css'),
				path.join('css', 'orca-realistic.css'),
				path.join('sketch', 'orca-realistic-assistant-app2sketch.json'),
				path.join('sketch', 'orca-realistic-viz-fos2sketch.json'),
				path.join('sketch', 'orca-realistic2sketch.json'),
			]);
			expect(
				result.resources.some((resource) => resource.kind === 'custom'),
			).toBe(true);
			const mainSketch = result.files.find(
				(file) =>
					file.relativePath ===
					path.join('sketch', 'orca-realistic2sketch.json'),
			);
			expect(mainSketch).toBeDefined();
			const sketchOutput = JSON.parse(
				await fs.readFile(mainSketch!.path, 'utf-8'),
			);
			expect(sketchOutput.foundation.color['primary-main']).toEqual({
				color: '#0052f5ff',
			});
			expect(sketchOutput['primary-main']).toBeUndefined();
			expect(sketchOutput.foundation.interaction['interaction-hover']).toEqual({
				opacity: 0.08,
			});
			expect(
				sketchOutput.foundation.shadow['shadow-raised'].shadow,
			).toBeArray();
			expect(sketchOutput.foundation.gradient.mask.gradient).toBeArray();
			expect(result.tokensCount).toBeGreaterThan(0);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	test('matches generateTheme output hashes for sketch-extension smoke', async () => {
		const testCase = getDesignTokenCases('smoke').find(
			(candidate) => candidate.id === 'sketch-extensions',
		);
		expect(testCase).toBeDefined();
		const result = await checkDesignTokenGenerateThemeEquivalence(
			testCase!,
			'test-equivalence',
		);

		expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
		expect(
			result.benchmarkFiles.some((file) => file.endsWith('2sketch.json')),
		).toBe(true);
		expect(result.benchmarkFiles).toEqual(result.generateThemeFiles);
	});

	test('matches generateTheme output hashes for group night and variant outputs', async () => {
		const testCase = getDesignTokenCases('default').find(
			(candidate) => candidate.id === 'config-group-variants',
		);
		expect(testCase).toBeDefined();
		const result = await checkDesignTokenGenerateThemeEquivalence(
			testCase!,
			'test-group-equivalence',
		);

		expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
		expect(
			result.benchmarkFiles.some((file) =>
				file.includes('config-group-variants-night'),
			),
		).toBe(true);
		expect(
			result.benchmarkFiles.some((file) =>
				file.includes('config-group-variants-dark'),
			),
		).toBe(true);
	});

	test('matches generateTheme output hashes for legacy themefile cases', async () => {
		const testCase = getDesignTokenCases('legacy').find(
			(candidate) => candidate.id === 'standard',
		);
		expect(testCase).toBeDefined();
		const result = await checkDesignTokenGenerateThemeEquivalence(
			testCase!,
			'test-legacy-equivalence',
		);

		expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
		expect(result.benchmarkFiles).toEqual(result.generateThemeFiles);
	});
});
