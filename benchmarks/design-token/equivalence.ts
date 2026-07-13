import * as path from 'node:path';
import {
	buildGroupPasses,
	loadThemefile,
} from '../../src/core/pipeline/theme-pipeline.ts';
import { generateTheme } from '../../src/core/pipeline/theme-service.ts';
import {
	collectFileArtifacts,
	commonDirectoryRoot,
} from '../shared/artifacts.ts';
import { withEnv } from '../shared/env.ts';
import { runDesignTokenBenchmarkCase } from './runner.ts';
import type { DesignTokenCase } from './types.ts';
import { prepareDesignTokenWorkspace } from './workspace.ts';

export interface DesignTokenEquivalenceIssue {
	field: string;
	expected: unknown;
	actual: unknown;
}

export interface DesignTokenEquivalenceResult {
	ok: boolean;
	issues: DesignTokenEquivalenceIssue[];
	benchmarkFiles: string[];
	generateThemeFiles: string[];
}

function artifactMap(
	files: Awaited<ReturnType<typeof collectFileArtifacts>>,
): Map<string, string> {
	return new Map(files.map((file) => [file.relativePath, file.sha256]));
}

function compareArtifacts(
	benchmarkFiles: Awaited<ReturnType<typeof collectFileArtifacts>>,
	generateThemeFiles: Awaited<ReturnType<typeof collectFileArtifacts>>,
): DesignTokenEquivalenceIssue[] {
	const issues: DesignTokenEquivalenceIssue[] = [];
	const benchmark = artifactMap(benchmarkFiles);
	const generated = artifactMap(generateThemeFiles);
	const names = [...new Set([...benchmark.keys(), ...generated.keys()])].sort();

	for (const name of names) {
		const benchmarkHash = benchmark.get(name);
		const generatedHash = generated.get(name);
		if (benchmarkHash !== generatedHash) {
			issues.push({
				field: `file:${name}`,
				expected: generatedHash ?? null,
				actual: benchmarkHash ?? null,
			});
		}
	}

	return issues;
}

export async function checkDesignTokenGenerateThemeEquivalence(
	testCase: DesignTokenCase,
	runId: string,
	repoRoot: string = process.cwd(),
): Promise<DesignTokenEquivalenceResult> {
	const tmpRoot = path.join(repoRoot, 'benchmarks/.tmp');
	const benchmarkRun = await runDesignTokenBenchmarkCase(testCase, {
		mode: 'smoke',
		runId: `${runId}-benchmark`,
		iteration: 0,
		tmpRoot,
		repoRoot,
	});

	const generateWorkspace = path.join(
		tmpRoot,
		`${runId}-generate-theme`,
		testCase.id,
		'0',
		'workspace',
	);
	const prepared = await prepareDesignTokenWorkspace(
		testCase,
		generateWorkspace,
		repoRoot,
	);
	const envRoot = path.join(
		tmpRoot,
		`${runId}-generate-theme`,
		testCase.id,
		'env',
	);

	const generateResult = await withEnv(
		{
			WAVE_RESOURCE_CACHE_DIR: path.join(envRoot, 'cache'),
			WAVE_RESOURCE_STATE_PATH: path.join(envRoot, 'state.json'),
			WAVE_RESOURCE_CONFIG_DIR: path.join(envRoot, 'config'),
		},
		() =>
			generateTheme({
				themeName: testCase.id,
				themePath:
					testCase.entryKind === 'themefile-legacy'
						? prepared.themefilePath
						: prepared.mainYamlPath,
				generateOptions: {
					night: testCase.includeNight,
					profiles: testCase.includeProfiles ? 'all' : undefined,
					platform: testCase.platforms,
				},
			}),
	);

	const issues: DesignTokenEquivalenceIssue[] = [];
	if (benchmarkRun.status !== 'success') {
		issues.push({
			field: 'benchmark.status',
			expected: 'success',
			actual: benchmarkRun.error ?? benchmarkRun.status,
		});
	}
	if (!generateResult.ok) {
		issues.push({
			field: 'generateTheme.status',
			expected: 'success',
			actual: generateResult.message,
		});
	}

	const loadResult =
		prepared.mainYamlPath || prepared.themefilePath
			? await loadThemefile(prepared.mainYamlPath ?? prepared.themefilePath)
			: undefined;
	const generateOutputDir =
		loadResult && !('error' in loadResult)
			? commonDirectoryRoot(
					buildGroupPasses(loadResult.parsed, loadResult.themeDir).map(
						(pass) => pass.outputDir,
					),
				)
			: generateResult.ok
				? generateResult.outputDir
				: generateWorkspace;
	const generateFiles = await collectFileArtifacts(generateOutputDir);
	issues.push(...compareArtifacts(benchmarkRun.files, generateFiles));

	return {
		ok: issues.length === 0,
		issues,
		benchmarkFiles: benchmarkRun.files.map((file) => file.relativePath),
		generateThemeFiles: generateFiles.map((file) => file.relativePath),
	};
}
