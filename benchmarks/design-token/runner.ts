import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateTokens } from '../../src/core/generator/index.ts';
import {
	buildDependencyDictionary,
	buildGroupPasses,
	loadThemefile,
	processThemeDocument,
} from '../../src/core/pipeline/theme-pipeline.ts';
import { ExitCode } from '../../src/types/index.ts';
import {
	collectFileArtifacts,
	commonDirectoryRoot,
	totalArtifactBytes,
} from '../shared/artifacts.ts';
import { withEnv } from '../shared/env.ts';
import type {
	BenchmarkCaseResult,
	PhaseDurations,
	QualityHarnessMode,
} from '../shared/types.ts';
import type { DesignTokenCase } from './types.ts';
import { prepareDesignTokenWorkspace } from './workspace.ts';

export interface DesignTokenBenchmarkRunOptions {
	mode: QualityHarnessMode;
	runId: string;
	iteration: number;
	tmpRoot?: string;
	repoRoot?: string;
}

interface TimedValue<T> {
	value: T;
	ms: number;
}

interface GenerateScope {
	name: string;
	themeName: string;
	filePath: string;
	contentOverride?: string;
}

function now(): number {
	return performance.now();
}

async function timed<T>(fn: () => Promise<T>): Promise<TimedValue<T>> {
	const start = now();
	const value = await fn();
	return { value, ms: now() - start };
}

function createInitialPhases(): PhaseDurations {
	return {
		prepareMs: 0,
		loadMs: 0,
		resourceMs: 0,
		groupPassMs: 0,
		processMs: 0,
		generateMs: 0,
		pipelineDurationMs: 0,
		totalWallMs: 0,
	};
}

function failureResult(
	testCase: DesignTokenCase,
	options: DesignTokenBenchmarkRunOptions,
	phases: PhaseDurations,
	error: string,
): BenchmarkCaseResult {
	return {
		id: testCase.id,
		caseVersion: testCase.caseVersion,
		mode: options.mode,
		entryKind: testCase.entryKind,
		status: 'failure',
		error,
		iterations: 1,
		warmup: 0,
		tokensCount: 0,
		outputFiles: 0,
		outputBytes: 0,
		outputFileNames: [],
		files: [],
		resources: [],
		phases,
	};
}

export async function runDesignTokenBenchmarkCase(
	testCase: DesignTokenCase,
	options: DesignTokenBenchmarkRunOptions,
): Promise<BenchmarkCaseResult> {
	const repoRoot = options.repoRoot ?? process.cwd();
	const tmpRoot = options.tmpRoot ?? path.join(repoRoot, 'benchmarks/.tmp');
	const workspaceDir = path.join(
		tmpRoot,
		options.runId,
		testCase.id,
		String(options.iteration),
		'workspace',
	);
	const envRoot = path.join(tmpRoot, options.runId, testCase.id, 'env');
	const phases = createInitialPhases();
	const totalStart = now();
	let pipelineStart: number | undefined;

	const fail = (error: string): BenchmarkCaseResult => {
		if (pipelineStart !== undefined && phases.pipelineDurationMs === 0) {
			phases.pipelineDurationMs = now() - pipelineStart;
		}
		phases.totalWallMs = now() - totalStart;
		return failureResult(testCase, options, phases, error);
	};

	return withEnv(
		{
			WAVE_RESOURCE_CACHE_DIR: path.join(envRoot, 'cache'),
			WAVE_RESOURCE_STATE_PATH: path.join(envRoot, 'state.json'),
			WAVE_RESOURCE_CONFIG_DIR: path.join(envRoot, 'config'),
		},
		async () => {
			try {
				const prepare = await timed(() =>
					prepareDesignTokenWorkspace(testCase, workspaceDir, repoRoot),
				);
				phases.prepareMs = prepare.ms;

				const themePath =
					testCase.entryKind === 'themefile-legacy'
						? prepare.value.themefilePath
						: prepare.value.mainYamlPath;
				if (!themePath) {
					return fail('Benchmark case has no entry file');
				}

				pipelineStart = now();
				const load = await timed(() => loadThemefile(themePath));
				phases.loadMs = load.ms;
				if ('error' in load.value) {
					return fail(load.value.error.message);
				}

				const { parsed, themeDir, mainYamlPath, mainYamlContent } = load.value;
				const resolvedThemeName = parsed.THEME || testCase.id;

				const resource = await timed(() =>
					buildDependencyDictionary(parsed, themeDir),
				);
				phases.resourceMs = resource.ms;
				if ('error' in resource.value) {
					return fail(resource.value.error.message);
				}
				const dependency = resource.value;

				const groupPass = await timed(async () =>
					buildGroupPasses(parsed, themeDir, undefined, undefined),
				);
				phases.groupPassMs = groupPass.ms;

				const scopes: GenerateScope[] = [];
				if (mainYamlPath) {
					scopes.push({
						name: 'main',
						themeName: resolvedThemeName,
						filePath: mainYamlPath,
						contentOverride: mainYamlContent,
					});
				} else {
					const fallbackMainYamlPath = path.join(themeDir, 'main.yaml');
					try {
						const stat = await fs.stat(fallbackMainYamlPath);
						if (stat.isFile()) {
							scopes.push({
								name: 'main',
								themeName: resolvedThemeName,
								filePath: fallbackMainYamlPath,
							});
						}
					} catch (err) {
						if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
							throw err;
						}
					}
				}

				const generatedFiles: string[] = [];
				let tokensCount = 0;
				for (const scope of scopes) {
					for (const pass of groupPass.value) {
						const process = await timed(() =>
							processThemeDocument(
								scope.filePath,
								dependency.dict,
								pass.colorSpace,
								scope.contentOverride,
							),
						);
						phases.processMs += process.ms;
						const processResult = process.value;
						if (!processResult.ok) {
							const line = processResult.line
								? ` at line ${processResult.line}`
								: '';
							return fail(`${scope.name}: ${processResult.message}${line}`);
						}
						tokensCount += processResult.tree.length;

						const generate = await timed(() =>
							generateTokens({
								themeName: scope.themeName,
								outputDir: pass.outputDir,
								tokens: processResult.tree,
								platform: pass.platforms,
								filterLayer: pass.filterLayer,
								groupComments: processResult.groupComments,
							}),
						);
						phases.generateMs += generate.ms;
						if (!generate.value.success) {
							return fail(
								generate.value.error ?? `Failed to generate ${scope.name}`,
							);
						}
						generatedFiles.push(...generate.value.files);
					}
				}

				if (generatedFiles.length === 0) {
					return fail(`No outputs generated (exit ${ExitCode.GENERAL_ERROR})`);
				}

				phases.pipelineDurationMs = now() - pipelineStart;
				const outputDir =
					commonDirectoryRoot(groupPass.value.map((pass) => pass.outputDir)) ??
					path.join(themeDir, parsed.THEME);
				const files = await collectFileArtifacts(outputDir);
				phases.totalWallMs = now() - totalStart;

				return {
					id: testCase.id,
					caseVersion: testCase.caseVersion,
					mode: options.mode,
					entryKind: testCase.entryKind,
					status: 'success',
					iterations: 1,
					warmup: 0,
					tokensCount,
					outputFiles: files.length,
					outputBytes: totalArtifactBytes(files),
					outputFileNames: files.map((file) => file.relativePath),
					files,
					resources: prepare.value.resources,
					phases,
				};
			} catch (err) {
				return fail(err instanceof Error ? err.message : String(err));
			}
		},
	);
}
