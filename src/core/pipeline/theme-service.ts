import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { generateTokens } from '../../core/generator/index.ts';
import type { ExitCodeType, GenerateOptions } from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import type { BuildContext } from '../../utils/receipt.ts';
import {
	DIMENSION_BUILD_WARNING,
	findPublicDimensionRoots,
} from '../doctor/dimension-migration.ts';
import { planBuildOutputs } from './output-plan.ts';
import { type PreparedBuildPass, prepareBuildPass } from './pass-preparer.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
	type ProfileDocument,
	type ProfileEntry,
	ProfileFormatError,
	parseProfileDocument,
	resolveProfilesToBuild,
} from './profile-resolver.ts';
import { sketchNightPassIds, sketchPassIds } from './sketch-identity.ts';
import {
	buildGroupPasses,
	collectDependencyDictionary,
	type LoadedDependency,
} from './theme-pipeline.ts';
import { loadDesignTokenSource } from './workspace-loader.ts';

function parseYamlObject(content: string): Record<string, unknown> | undefined {
	const parsed = yaml.load(content);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	return parsed as Record<string, unknown>;
}

export interface ThemeGenerationInput {
	workspacePath?: string;
	cliOutput?: string;
	cliPlatform?: string;
	generateOptions: GenerateOptions;
}

export interface ThemeGenerationSuccess {
	ok: true;
	themeName: string;
	outputDir: string;
	generatedFiles: string[];
}

export interface ThemeGenerationFailure {
	ok: false;
	exitCode: ExitCodeType;
	message: string;
	line?: number;
}

export type ThemeGenerationResult =
	| ThemeGenerationSuccess
	| ThemeGenerationFailure;

function profileThemeName(
	baseThemeName: string,
	profile: ProfileDocument,
): string {
	return profile.entry.isDefault
		? baseThemeName
		: `${baseThemeName}-${profile.entry.name}`;
}

function recordLoadedResources(
	ctx: BuildContext | undefined,
	loaded: LoadedDependency[],
	recorded: Set<string>,
): void {
	for (const entry of loaded) {
		const key = `${entry.kind}\0${entry.ref}\0${entry.source}`;
		if (recorded.has(key)) continue;
		recorded.add(key);
		if (ctx) {
			ctx.addResource(entry.kind, entry.ref, entry.source);
		} else {
			logger.success(
				`Resource [${entry.kind}]: ${entry.ref} (${entry.source})`,
			);
		}
	}
}

interface PreparedServicePass {
	prepared: PreparedBuildPass;
	profileName: string;
	outputScope: 'main' | 'profile' | 'night';
	outputLabel?: string;
	fatal: boolean;
}

async function generatePreparedPass(
	servicePass: PreparedServicePass,
	ctx?: BuildContext,
): Promise<{ files: string[] } | ThemeGenerationFailure> {
	const { prepared, fatal, outputScope, outputLabel } = servicePass;

	const mainResult = await generateTokens({
		themeName: prepared.themeName,
		outputDir: prepared.outputDir,
		tokens: prepared.document.tree,
		platform: prepared.platforms,
		filterLayer: prepared.filterLayer,
		groupComments: prepared.document.groupComments,
		resolved: prepared.document.resolved,
		colorSpace: prepared.colorSpace,
		baseId: prepared.baseId,
		themeId: prepared.themeId,
		mode: prepared.mode,
	});

	if (!mainResult.success) {
		const msg = mainResult.error || 'Failed to generate tokens';
		if (fatal) ctx?.markFailed('generate', msg, { phase: 'main generate' });
		return {
			ok: false,
			exitCode: ExitCode.GENERAL_ERROR,
			message: msg,
		};
	}

	ctx?.addOutput(outputScope, mainResult.files, outputLabel);
	if (!ctx) logger.success(`Generated main: ${mainResult.files.join(', ')}`);

	return { files: mainResult.files };
}

export async function generateTheme(
	input: ThemeGenerationInput,
	ctx?: BuildContext,
): Promise<ThemeGenerationResult> {
	const { workspacePath, cliOutput, cliPlatform, generateOptions } = input;
	const resolvedCliOutput =
		cliOutput && !path.isAbsolute(cliOutput)
			? path.resolve(process.cwd(), cliOutput)
			: cliOutput;
	const nightSkipWarnings = new Set<string>();
	const warnNightSkipped = (name: string): void => {
		if (nightSkipWarnings.has(name)) return;
		nightSkipWarnings.add(name);
		if (ctx?.nightMode.state !== 'enabled') {
			ctx?.setNight('skipped', NIGHT_SKIP_MESSAGE);
		}
		ctx?.addWarning('night', NIGHT_SKIP_MESSAGE);
		if (!ctx) logger.warn(NIGHT_SKIP_MESSAGE);
	};

	const loadResult = await loadDesignTokenSource(workspacePath);
	if (!loadResult.ok) {
		ctx?.markFailed('load', loadResult.message, {
			phase: 'workspace load',
			detail: loadResult.message,
		});
		return {
			ok: false,
			exitCode: loadResult.exitCode,
			message: loadResult.message,
		};
	}

	const { source } = loadResult;
	const { workspace } = source;
	if (source.kind === 'profile' && generateOptions.profiles === 'all') {
		const message =
			'--profiles all requires a main.yaml or workspace directory input';
		ctx?.markFailed('load', message, { phase: 'source selection' });
		return { ok: false, exitCode: ExitCode.INVALID_PARAMETER, message };
	}
	const generatedFiles: string[] = [];
	const preparedPasses: PreparedServicePass[] = [];
	const recordedResources = new Set<string>();
	const profiles =
		source.kind === 'main'
			? await discoverProfiles(workspace.workspaceDir)
			: [source.entry];

	let selectedProfiles: ProfileEntry[];
	try {
		selectedProfiles =
			source.kind === 'profile'
				? [source.entry]
				: resolveProfilesToBuild(profiles, generateOptions);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx?.markFailed('load', message, { phase: 'profile resolve' });
		return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
	}

	ctx?.setProfiles(
		source.kind === 'profile'
			? 'single'
			: generateOptions.profiles === 'all'
				? 'all'
				: generateOptions.profile
					? 'single'
					: 'default',
		selectedProfiles.length,
		selectedProfiles.map((profile) => profile.name),
	);

	const baseProfile =
		source.kind === 'main'
			? profiles.find((profile) => profile.isDefault)
			: {
					name: 'main',
					path: workspace.path,
					isDefault: true,
				};
	if (!baseProfile) {
		const message = 'No main.yaml found';
		ctx?.markFailed('load', message, { phase: 'profile resolve' });
		return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
	}

	const baseDocument: ProfileDocument = {
		entry: baseProfile,
		config: workspace.config,
		buildDir: workspace.workspaceDir,
		themeId: workspace.themeId,
		tokenContent: workspace.tokenContent,
	};
	const effectiveThemeName = baseDocument.config.theme;
	const baseDayTree = parseYamlObject(baseDocument.tokenContent);
	const firstPass = buildGroupPasses(
		baseDocument.config,
		baseDocument.buildDir,
		resolvedCliOutput,
		cliPlatform,
	)[0]!;
	if (ctx) ctx.outputDir = firstPass.outputDir;
	if (!ctx) logger.info('Found main.yaml, parsing theme tokens...');
	let hasPublicDimensions = false;

	for (const entry of selectedProfiles) {
		let document: ProfileDocument;
		try {
			document =
				source.kind === 'profile'
					? source.document
					: entry.isDefault
						? baseDocument
						: await parseProfileDocument(entry, {
								baseConfig: baseDocument.config,
								baseTree: baseDayTree,
								baseId: baseDocument.themeId,
								baseDir: workspace.workspaceDir,
							});
		} catch (error) {
			if (!(error instanceof ProfileFormatError)) throw error;
			ctx?.markFailed('parse', error.message, { phase: 'profile merge' });
			return { ok: false, exitCode: error.exitCode, message: error.message };
		}
		const dayTree = entry.isDefault
			? baseDayTree
			: parseYamlObject(document.tokenContent);
		const profileDepResult = await collectDependencyDictionary(
			document.config,
			document.buildDir,
		);
		recordLoadedResources(ctx, profileDepResult.loaded, recordedResources);
		const profilePasses = buildGroupPasses(
			document.config,
			document.buildDir,
			resolvedCliOutput,
			cliPlatform,
		);
		const profileId = entry.isDefault ? 'default' : `profile:${entry.name}`;
		for (const [passIndex, pass] of profilePasses.entries()) {
			const ids = sketchPassIds({
				isDefault: entry.isDefault,
				documentThemeId: document.themeId,
				mainThemeId: baseDocument.themeId,
				themeStem: effectiveThemeName,
			});
			const prepared = await prepareBuildPass({
				id: `${profileId}:day:${pass.groupName ?? `pass-${passIndex + 1}`}`,
				themeName: profileThemeName(effectiveThemeName, document),
				themeId: ids.themeId,
				baseId: ids.baseId,
				mode: ids.mode,
				yamlPath: entry.path,
				yamlContent: document.tokenContent,
				dict: profileDepResult.dict,
				pass,
			});
			if (!prepared.ok) {
				const message = prepared.line
					? `${prepared.message} at line ${prepared.line}`
					: prepared.message;
				ctx?.markFailed('parse', message, { phase: 'main parse' });
				return { ok: false, exitCode: prepared.exitCode, message };
			}
			hasPublicDimensions ||=
				findPublicDimensionRoots(prepared.prepared.document.resolved).length >
				0;
			preparedPasses.push({
				prepared: prepared.prepared,
				profileName: entry.name,
				outputScope: entry.isDefault ? 'main' : 'profile',
				outputLabel: entry.isDefault ? undefined : entry.name,
				fatal: true,
			});
		}

		if (!generateOptions.night) {
			ctx?.setNight('disabled');
			continue;
		}
		if (!entry.nightPath || !dayTree) {
			warnNightSkipped(entry.name);
			continue;
		}

		let nightTree: Record<string, unknown> | undefined;
		try {
			nightTree = parseYamlObject(await Bun.file(entry.nightPath).text());
		} catch {
			nightTree = undefined;
		}
		if (!nightTree) {
			warnNightSkipped(entry.name);
			continue;
		}

		const mergedNight = mergeNightOverlay(dayTree, nightTree);
		if (!mergedNight.ok) {
			if ('error' in mergedNight) {
				const message = `${entry.nightPath}: ${mergedNight.error}`;
				ctx?.markFailed('parse', message, { phase: 'night merge' });
				return { ok: false, exitCode: ExitCode.FORMAT_ERROR, message };
			}
			warnNightSkipped(entry.name);
			continue;
		}

		const nightContent = yaml.dump(mergedNight.tree, { lineWidth: -1 });
		const nightPasses: PreparedServicePass[] = [];
		for (const [passIndex, pass] of profilePasses.entries()) {
			const ids = sketchNightPassIds({
				isDefault: entry.isDefault,
				documentThemeId: document.themeId,
				mainThemeId: baseDocument.themeId,
				themeStem: effectiveThemeName,
			});
			const prepared = await prepareBuildPass({
				id: `${profileId}:night:${pass.groupName ?? `pass-${passIndex + 1}`}`,
				themeName: `${profileThemeName(effectiveThemeName, document)}-night`,
				themeId: ids.themeId,
				baseId: ids.baseId,
				mode: ids.mode,
				yamlPath: entry.nightPath,
				yamlContent: nightContent,
				dict: profileDepResult.dict,
				pass,
			});
			if (!prepared.ok) {
				warnNightSkipped(entry.name);
				nightPasses.length = 0;
				break;
			}
			hasPublicDimensions ||=
				findPublicDimensionRoots(prepared.prepared.document.resolved).length >
				0;
			nightPasses.push({
				prepared: prepared.prepared,
				profileName: entry.name,
				outputScope: 'night',
				outputLabel: entry.isDefault ? undefined : entry.name,
				fatal: false,
			});
		}
		if (nightPasses.length > 0) {
			ctx?.setNight('enabled');
			preparedPasses.push(...nightPasses);
		}
	}

	if (hasPublicDimensions) {
		if (
			!ctx?.warnings.some(
				(warning) => warning.message === DIMENSION_BUILD_WARNING,
			)
		) {
			ctx?.addWarning('dimension', DIMENSION_BUILD_WARNING);
		}
		if (!ctx) logger.warn(DIMENSION_BUILD_WARNING);
	}

	const outputPlan = planBuildOutputs(
		preparedPasses.map(({ prepared }) => ({
			id: prepared.id,
			themeName: prepared.themeName,
			outputDir: prepared.outputDir,
			platforms: prepared.platforms,
		})),
	);
	if (!outputPlan.ok) {
		ctx?.markFailed('generate', outputPlan.error, { phase: 'output plan' });
		return {
			ok: false,
			exitCode: ExitCode.GENERAL_ERROR,
			message: outputPlan.error,
		};
	}

	const failedNightProfiles = new Set<string>();
	for (const servicePass of preparedPasses) {
		if (
			!servicePass.fatal &&
			failedNightProfiles.has(servicePass.profileName)
		) {
			continue;
		}
		const result = await generatePreparedPass(servicePass, ctx);
		if (!('files' in result)) {
			if (servicePass.fatal) return result;
			failedNightProfiles.add(servicePass.profileName);
			warnNightSkipped(servicePass.profileName);
			continue;
		}
		generatedFiles.push(...result.files);
	}

	return {
		ok: true,
		themeName: effectiveThemeName,
		outputDir: firstPass.outputDir,
		generatedFiles,
	};
}
