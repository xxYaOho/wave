import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { generateTokens } from '../../core/generator/index.ts';
import type {
	ColorSpaceFormat,
	ExitCodeType,
	GenerateOptions,
} from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import type { BuildContext } from '../../utils/receipt.ts';
import {
	DIMENSION_BUILD_WARNING,
	findPublicDimensionRoots,
} from '../doctor/dimension-migration.ts';
import {
	discoverProfiles,
	mergeNightOverlay,
	NIGHT_SKIP_MESSAGE,
	type ProfileDocument,
	type ProfileEntry,
	parseProfileDocument,
	resolveProfilesToBuild,
} from './profile-resolver.ts';
import {
	buildGroupPasses,
	collectDependencyDictionary,
	type DependencyDict,
	type LoadedDependency,
	processThemeDocument,
} from './theme-pipeline.ts';
import { loadDesignTokenWorkspace } from './workspace-loader.ts';

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

async function generatePass(
	resolvedThemeName: string,
	outputDir: string,
	dict: DependencyDict,
	platforms: string[],
	filterLayer: number | undefined,
	colorSpace: string | undefined,
	mainYamlPath: string,
	mainYamlContent: string,
	ctx?: BuildContext,
	outputScope: 'main' | 'profile' | 'night' = 'main',
	outputLabel?: string,
	fatal: boolean = true,
): Promise<{ files: string[] } | ThemeGenerationFailure> {
	const files: string[] = [];
	if (!ctx) logger.info('Found main.yaml, parsing theme tokens...');
	const parseResult = await processThemeDocument(
		mainYamlPath,
		dict,
		colorSpace as ColorSpaceFormat | undefined,
		mainYamlContent,
	);

	if (!parseResult.ok) {
		const msg = parseResult.line
			? `${parseResult.message} at line ${parseResult.line}`
			: parseResult.message;
		if (fatal) ctx?.markFailed('parse', msg, { phase: 'main parse' });
		return {
			ok: false,
			exitCode: parseResult.exitCode,
			message: msg,
		};
	}

	if (findPublicDimensionRoots(parseResult.resolved).length > 0) {
		if (
			!ctx?.warnings.some(
				(warning) => warning.message === DIMENSION_BUILD_WARNING,
			)
		) {
			ctx?.addWarning('dimension', DIMENSION_BUILD_WARNING);
		}
		if (!ctx) logger.warn(DIMENSION_BUILD_WARNING);
	}

	const mainResult = await generateTokens({
		themeName: resolvedThemeName,
		outputDir,
		tokens: parseResult.tree,
		platform: platforms,
		filterLayer,
		groupComments: parseResult.groupComments,
		resolved: parseResult.resolved,
		colorSpace: colorSpace as ColorSpaceFormat | undefined,
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

	files.push(...mainResult.files);
	ctx?.addOutput(outputScope, mainResult.files, outputLabel);
	if (!ctx) logger.success(`Generated main: ${mainResult.files.join(', ')}`);

	return { files };
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

	const loadResult = await loadDesignTokenWorkspace(workspacePath);
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

	const { workspace } = loadResult;
	const generatedFiles: string[] = [];
	const recordedResources = new Set<string>();
	const profiles = await discoverProfiles(workspace.workspaceDir);

	let selectedProfiles: ProfileEntry[];
	try {
		selectedProfiles = resolveProfilesToBuild(profiles, generateOptions);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx?.markFailed('load', message, { phase: 'profile resolve' });
		return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
	}

	ctx?.setProfiles(
		generateOptions.profiles === 'all'
			? 'all'
			: generateOptions.profile
				? 'single'
				: 'default',
		selectedProfiles.length,
		selectedProfiles.map((profile) => profile.name),
	);

	const baseProfile = profiles.find((profile) => profile.isDefault);
	if (!baseProfile) {
		const message = 'No main.yaml found';
		ctx?.markFailed('load', message, { phase: 'profile resolve' });
		return { ok: false, exitCode: ExitCode.FILE_NOT_FOUND, message };
	}

	const baseDocument: ProfileDocument = {
		entry: baseProfile,
		config: workspace.config,
		buildDir: workspace.workspaceDir,
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

	for (const entry of selectedProfiles) {
		const document = entry.isDefault
			? baseDocument
			: await parseProfileDocument(entry, {
					baseConfig: baseDocument.config,
					baseDir: workspace.workspaceDir,
				});
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
		for (const pass of profilePasses) {
			const result = await generatePass(
				profileThemeName(effectiveThemeName, document),
				pass.outputDir,
				profileDepResult.dict,
				pass.platforms,
				pass.filterLayer,
				pass.colorSpace,
				entry.path,
				document.tokenContent,
				ctx,
				entry.isDefault ? 'main' : 'profile',
				entry.isDefault ? undefined : entry.name,
			);
			if (!('files' in result)) return result;
			generatedFiles.push(...result.files);
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
			warnNightSkipped(entry.name);
			continue;
		}

		ctx?.setNight('enabled');
		const nightContent = yaml.dump(mergedNight.tree, { lineWidth: -1 });
		for (const pass of profilePasses) {
			const result = await generatePass(
				`${profileThemeName(effectiveThemeName, document)}-night`,
				pass.outputDir,
				profileDepResult.dict,
				pass.platforms,
				pass.filterLayer,
				pass.colorSpace,
				entry.nightPath,
				nightContent,
				ctx,
				'night',
				entry.isDefault ? undefined : entry.name,
				false,
			);
			if (!('files' in result)) {
				warnNightSkipped(entry.name);
				break;
			}
			generatedFiles.push(...result.files);
		}
	}

	return {
		ok: true,
		themeName: effectiveThemeName,
		outputDir: firstPass.outputDir,
		generatedFiles,
	};
}
