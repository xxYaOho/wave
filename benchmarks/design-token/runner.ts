import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as yaml from 'js-yaml';
import { generateTokens } from '../../src/core/generator/index.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	type ProfileEntry,
	parseProfileDocument,
} from '../../src/core/pipeline/profile-resolver.ts';
import {
	buildGroupPasses,
	collectDependencyDictionary,
	type DependencyDict,
	processThemeDocument,
} from '../../src/core/pipeline/theme-pipeline.ts';
import { loadDesignTokenWorkspace } from '../../src/core/pipeline/workspace-loader.ts';
import {
	type DesignTokenBuildConfig,
	ExitCode,
} from '../../src/types/index.ts';
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
	dict: DependencyDict;
	passes: ReturnType<typeof buildGroupPasses>;
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

function toGroupPassConfig(config: DesignTokenBuildConfig) {
	return {
		THEME: config.theme,
		PARAMETER: config.parameter,
		resources: config.resources,
		groups: config.parameterGroups.map((group) => ({
			name: group.name,
			PARAMETER: group.parameter,
		})),
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

				pipelineStart = now();
				const load = await timed(() =>
					loadDesignTokenWorkspace(prepare.value.mainYamlPath),
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
				const baseDocument = await parseProfileDocument(baseProfile, {
					defaultConfig: workspace.config,
					baseDir: workspace.workspaceDir,
				});

				for (const profile of selectedProfiles) {
					const document = profile.isDefault
						? baseDocument
						: await parseProfileDocument(profile, {
								baseConfig: baseDocument.config,
								baseDir: workspace.workspaceDir,
							});
					const resource = await timed(() =>
						collectDependencyDictionary(document.config, document.buildDir),
					);
					phases.resourceMs += resource.ms;
					const groupPass = await timed(async () =>
						buildGroupPasses(
							toGroupPassConfig(document.config),
							document.buildDir,
						),
					);
					phases.groupPassMs += groupPass.ms;
					scopes.push({
						name: profile.name,
						themeName: profileThemeName(resolvedThemeName, profile),
						filePath: profile.path,
						contentOverride: document.tokenContent,
						dict: resource.value.dict,
						passes: groupPass.value,
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
					scopes.push({
						name: `${profile.name}-night`,
						themeName: `${profileThemeName(resolvedThemeName, profile)}-night`,
						filePath: profile.nightPath,
						contentOverride: yaml.dump(mergedNight.tree, { lineWidth: -1 }),
						dict: resource.value.dict,
						passes: groupPass.value,
					});
				}

				const generatedFiles: string[] = [];
				let tokensCount = 0;
				for (const scope of scopes) {
					for (const pass of scope.passes) {
						const process = await timed(() =>
							processThemeDocument(
								scope.filePath,
								scope.dict,
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
					commonDirectoryRoot(
						scopes.flatMap((scope) =>
							scope.passes.map((pass) => pass.outputDir),
						),
					) ?? path.join(workspace.workspaceDir, workspace.config.theme);
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
