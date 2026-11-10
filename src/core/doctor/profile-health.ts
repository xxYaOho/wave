import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as yaml from 'js-yaml';
import { type DoctorFinding, ExitCode } from '../../types/index.ts';
import {
	discoverProfiles,
	mergeProfileOverrides,
	type ProfileDocument,
	ProfileFormatError,
	parseProfileDocument,
	resolveProfilesToBuild,
} from '../pipeline/profile-resolver.ts';
import type {
	LoadedDesignTokenSource,
	LoadedDesignTokenWorkspace,
} from '../pipeline/workspace-loader.ts';
import {
	collectThemeIdentityReport,
	identityBlockingFindings,
	loadIdentityInputs,
	type ThemeIdentityReport,
} from './identity.ts';
import { detectThemeFiles } from './theme-context.ts';

export interface WorkspaceHealthResult {
	findings: DoctorFinding[];
	identity: ThemeIdentityReport;
	selectedDocument?: ProfileDocument;
	exitCode: number;
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Profile health is workspace-wide; resource validation stays selected-document scoped. */
export async function inspectWorkspaceHealth(
	workspace: LoadedDesignTokenWorkspace,
	profile?: string,
	source?: LoadedDesignTokenSource,
): Promise<WorkspaceHealthResult> {
	const result: WorkspaceHealthResult = {
		findings: [],
		identity: collectThemeIdentityReport([]),
		exitCode: ExitCode.SUCCESS,
	};
	try {
		const entries = source
			? [source.entry]
			: await discoverProfiles(workspace.workspaceDir);
		const selected =
			source?.entry ??
			resolveProfilesToBuild(entries, {
				night: false,
				...(profile ? { profile } : {}),
			})[0]!;
		const scope = source || profile ? [selected] : entries;
		const baseTree = yaml.load(workspace.tokenContent) as Record<
			string,
			unknown
		>;
		const baseline = mergeProfileOverrides(
			baseTree,
			{},
			undefined,
			workspace.path,
		);
		for (const entry of scope) {
			if (entry.isDefault) {
				if (selected.isDefault)
					result.selectedDocument = source?.document ?? {
						entry,
						config: workspace.config,
						buildDir: workspace.workspaceDir,
						themeId: workspace.themeId,
						tokenContent: workspace.tokenContent,
					};
				continue;
			}
			try {
				if (source && entry.path === source.entry.path) {
					result.selectedDocument = source.document;
					continue;
				}
				const root = yaml.load(await Bun.file(entry.path).text());
				if (
					record(root) &&
					(!record(root.$config) ||
						typeof root.$config.base !== 'string' ||
						root.$config.base.trim() === '')
				) {
					throw new ProfileFormatError(
						entry.path,
						'$config.base is missing or empty; declare the main.yaml document $id',
					);
				}
				const document = await parseProfileDocument(entry, {
					baseConfig: workspace.config,
					baseTree,
					baseId: workspace.themeId,
					baseDir: workspace.workspaceDir,
				});
				if (entry.path === selected.path) result.selectedDocument = document;
				if (record(root) && record(root.$override)) {
					const overrides = Object.entries(root.$override);
					// Reuse the merge layer's first-hit index and source-value replacement semantics.
					const redundant = overrides.filter(([id, value]) =>
						isDeepStrictEqual(
							mergeProfileOverrides(baseTree, {}, { [id]: value }, entry.path),
							baseline,
						),
					).length;
					if (redundant > 0)
						result.findings.push({
							level: 'info',
							message: `${entry.path}: ${redundant}/${overrides.length} overrides match base source values; remove redundant overrides`,
						});
				}
			} catch (error) {
				result.findings.push({
					level: 'error',
					message:
						error instanceof ProfileFormatError
							? error.message
							: new ProfileFormatError(
									entry.path,
									error instanceof Error ? error.message : String(error),
								).message,
				});
				result.exitCode = ExitCode.FORMAT_ERROR;
			}
		}
		const files = source
			? [
					{
						name: 'main',
						path: workspace.path,
						suffix: '',
					},
					...(source.entry.isDefault
						? []
						: [
								{
									name: source.entry.name,
									path: source.entry.path,
									suffix: `-${source.entry.name}`,
								},
							]),
					...(source.entry.nightPath
						? [
								{
									name: `${source.entry.name}@night`,
									path: source.entry.nightPath,
									suffix: `-${source.entry.name}-night`,
								},
							]
						: []),
				]
			: await detectThemeFiles(workspace.workspaceDir);
		const labels = new Map(
			files.map((entry) => [
				entry.name,
				path.relative(workspace.workspaceDir, entry.path),
			]),
		);
		const selectedPaths = source
			? new Set([workspace.path, selected.path, selected.nightPath])
			: new Set([selected.path, selected.nightPath]);
		const inputs = await loadIdentityInputs(
			files
				.filter((entry) => source || !profile || selectedPaths.has(entry.path))
				.map((entry) => ({
					label: path.relative(workspace.workspaceDir, entry.path),
					path: entry.path,
					...(entry.name.endsWith('@night')
						? { baseLabel: labels.get(entry.name.slice(0, -'@night'.length)) }
						: {}),
				})),
		);
		result.identity = collectThemeIdentityReport(inputs);
		const identityErrors = identityBlockingFindings(result.identity);
		result.findings.push(...identityErrors);
		if (identityErrors.length > 0 && result.exitCode === ExitCode.SUCCESS)
			result.exitCode = ExitCode.GENERAL_ERROR;
	} catch (error) {
		result.findings.push({
			level: 'error',
			message: error instanceof Error ? error.message : String(error),
		});
		result.exitCode =
			error instanceof ProfileFormatError
				? error.exitCode
				: ExitCode.FILE_NOT_FOUND;
	}
	return result;
}
