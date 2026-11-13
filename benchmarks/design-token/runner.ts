import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as yaml from 'js-yaml';
import { generateTokens } from '../../src/core/generator/index.ts';
import { planBuildOutputs } from '../../src/core/pipeline/output-plan.ts';
import {
	type PreparedBuildPass,
	prepareBuildPass,
} from '../../src/core/pipeline/pass-preparer.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	type ProfileEntry,
	parseProfileDocument,
} from '../../src/core/pipeline/profile-resolver.ts';
import {
	type SketchThemeMode,
	sketchNightPassIds,
	sketchPassIds,
} from '../../src/core/pipeline/sketch-identity.ts';
import {
	buildGroupPasses,
	collectDependencyDictionary,
	type DependencyDict,
} from '../../src/core/pipeline/theme-pipeline.ts';
import {
	createTokenCache,
	TOKEN_CACHE_LAYERS,
} from '../../src/core/pipeline/token-cache.ts';
import { loadDesignTokenWorkspace } from '../../src/core/pipeline/workspace-loader.ts';
import { ExitCode } from '../../src/types/index.ts';
import {
	collectFileArtifacts,
	commonDirectoryRoot,
	totalArtifactBytes,
} from '../shared/artifacts.ts';
import { withEnv } from '../shared/env.ts';
import type {
	BenchmarkCaseResult,
	BenchmarkOperationContract,
	CacheAttributionTrace,
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
	contentOverride: string;
	themeId?: string;
	baseId?: string;
	mode: SketchThemeMode;
	dict: DependencyDict;
	passes: ReturnType<typeof buildGroupPasses>;
	isNight: boolean;
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

function designTokenOperation(
	testCase: DesignTokenCase,
): BenchmarkOperationContract {
	return {
		name: `token.build.${testCase.id}`,
		domain: 'design-token',
		action: 'generate-design-token-outputs',
		parameters: {
			caseId: testCase.id,
			platforms: testCase.platforms.join(','),
			includeNight: testCase.includeNight,
			includeProfiles: testCase.includeProfiles,
			filterLayer: testCase.filterLayer,
		},
		timing: {
			start: 'operation-start',
			end: 'operation-complete',
			metric: 'durationMs',
			completion: 'result-returned',
		},
		comparison: {
			key: testCase.id,
			metric: 'meanMs',
			unit: 'ms',
			direction: 'lower-is-better',
		},
		successCondition: 'all planned output files are generated successfully',
	};
}

function parseYamlObject(content: string): Record<string, unknown> | undefined {
	const parsed = yaml.load(content);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	return parsed as Record<string, unknown>;
}

function profileThemeName(
	baseThemeName: string,
	profile: ProfileEntry,
): string {
	return profile.isDefault ? baseThemeName : `${baseThemeName}-${profile.name}`;
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
		domain: 'design-token',
		operation: designTokenOperation(testCase),
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

				pipelineStart = now();
				const iterationCache = createTokenCache();
				const load = await timed(() =>
					loadDesignTokenWorkspace(
						prepare.value.mainYamlPath,
						undefined,
						iterationCache,
					),
				);
				phases.loadMs = load.ms;
				if (!load.value.ok) {
					return fail(load.value.message);
				}

				const { workspace } = load.value;
				const resolvedThemeName = workspace.config.theme || testCase.id;

				const scopes: GenerateScope[] = [];
				const profiles = await discoverProfiles(workspace.workspaceDir);
				const baseProfile = profiles.find((profile) => profile.isDefault);
				if (!baseProfile) {
					return fail('No main.yaml found');
				}
				const selectedProfiles = testCase.includeProfiles
					? profiles
					: [baseProfile];
				const baseDocument = await parseProfileDocument(
					baseProfile,
					{
						defaultConfig: workspace.config,
						baseDir: workspace.workspaceDir,
					},
					iterationCache,
				);
				const baseTree = parseYamlObject(baseDocument.tokenContent);
				if (!baseTree) return fail('Invalid main token document');

				for (const profile of selectedProfiles) {
					const document = profile.isDefault
						? baseDocument
						: await parseProfileDocument(
								profile,
								{
									baseConfig: baseDocument.config,
									baseDir: workspace.workspaceDir,
									baseTree,
									baseId: baseDocument.themeId,
								},
								iterationCache,
							);
					const resource = await timed(() =>
						collectDependencyDictionary(
							document.config,
							document.buildDir,
							iterationCache,
						),
					);
					phases.resourceMs += resource.ms;
					const groupPass = await timed(async () =>
						buildGroupPasses(document.config, document.buildDir),
					);
					phases.groupPassMs += groupPass.ms;
					const ids = sketchPassIds({
						isDefault: profile.isDefault,
						documentThemeId: document.themeId,
						mainThemeId: baseDocument.themeId,
						themeStem: resolvedThemeName,
					});
					scopes.push({
						name: profile.name,
						themeName: profileThemeName(resolvedThemeName, profile),
						filePath: profile.path,
						contentOverride: document.tokenContent,
						themeId: ids.themeId,
						baseId: ids.baseId,
						mode: ids.mode,
						dict: resource.value.dict,
						passes: groupPass.value,
						isNight: false,
					});

					if (!testCase.includeNight || !profile.nightPath) {
						continue;
					}
					const dayTree = parseYamlObject(document.tokenContent);
					const nightTree = parseYamlObject(
						await fs.readFile(profile.nightPath, 'utf-8'),
					);
					if (!dayTree || !nightTree) {
						continue;
					}
					const mergedNight = mergeNightOverlay(dayTree, nightTree);
					if (!mergedNight.ok) {
						continue;
					}
					const nightIds = sketchNightPassIds({
						isDefault: profile.isDefault,
						documentThemeId: document.themeId,
						mainThemeId: baseDocument.themeId,
						themeStem: resolvedThemeName,
					});
					scopes.push({
						name: `${profile.name}-night`,
						themeName: `${profileThemeName(resolvedThemeName, profile)}-night`,
						filePath: profile.nightPath,
						contentOverride: yaml.dump(mergedNight.tree, { lineWidth: -1 }),
						themeId: nightIds.themeId,
						baseId: nightIds.baseId,
						mode: nightIds.mode,
						dict: resource.value.dict,
						passes: groupPass.value,
						isNight: true,
					});
				}

				const generatedFiles: string[] = [];
				let tokensCount = 0;
				const preparedPasses: Array<{
					scope: GenerateScope;
					prepared: PreparedBuildPass;
				}> = [];
				for (const scope of scopes) {
					const preparedScope: typeof preparedPasses = [];
					let validScope = true;
					for (const [passIndex, pass] of scope.passes.entries()) {
						const process = await timed(() =>
							prepareBuildPass({
								cache: iterationCache,
								id: `${scope.name}:${pass.groupName ?? `pass-${passIndex + 1}`}`,
								themeName: scope.themeName,
								themeId: scope.themeId,
								baseId: scope.baseId,
								mode: scope.mode,
								yamlPath: scope.filePath,
								yamlContent: scope.contentOverride,
								dict: scope.dict,
								pass,
							}),
						);
						phases.processMs += process.ms;
						const processResult = process.value;
						if (!processResult.ok) {
							if (scope.isNight) {
								validScope = false;
								break;
							}
							const line = processResult.line
								? ` at line ${processResult.line}`
								: '';
							return fail(`${scope.name}: ${processResult.message}${line}`);
						}
						preparedScope.push({
							scope,
							prepared: processResult.prepared,
						});
					}
					if (validScope) {
						preparedPasses.push(...preparedScope);
						tokensCount += preparedScope.reduce(
							(total, item) => total + item.prepared.document.tree.length,
							0,
						);
					}
				}

				const outputPlan = planBuildOutputs(
					preparedPasses.map(({ prepared }) => ({
						id: prepared.id,
						themeName: prepared.themeName,
						outputDir: prepared.outputDir,
						platforms: prepared.platforms,
					})),
				);
				if (!outputPlan.ok) return fail(outputPlan.error);

				for (const { scope, prepared } of preparedPasses) {
					const generate = await timed(() =>
						generateTokens({
							themeName: prepared.themeName,
							outputDir: prepared.outputDir,
							tokens: prepared.document.tree,
							platform: prepared.platforms,
							filterLayer: prepared.filterLayer,
							groupComments: prepared.document.groupComments,
							resolved: prepared.document.resolved,
							colorSpace: prepared.colorSpace,
							themeId: prepared.themeId,
							baseId: prepared.baseId,
							mode: prepared.mode,
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

				if (generatedFiles.length === 0) {
					return fail(`No outputs generated (exit ${ExitCode.GENERAL_ERROR})`);
				}

				phases.pipelineDurationMs = now() - pipelineStart;
				const outputDir =
					commonDirectoryRoot(
						scopes.flatMap((scope) =>
							scope.passes.map((pass) => pass.outputDir),
						),
					) ?? path.join(workspace.workspaceDir, workspace.config.theme);
				const files = await collectFileArtifacts(outputDir);
				phases.totalWallMs = now() - totalStart;

				const statsMap = iterationCache.stats();
				const cacheAttribution: CacheAttributionTrace[] =
					TOKEN_CACHE_LAYERS.map((layer) => ({ layer, ...statsMap[layer] }));
				return {
					id: testCase.id,
					caseVersion: testCase.caseVersion,
					mode: options.mode,
					entryKind: testCase.entryKind,
					domain: 'design-token',
					operation: designTokenOperation(testCase),
					status: 'success',
					cacheAttribution,
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
