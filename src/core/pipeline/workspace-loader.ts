import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type {
	DesignTokenBuildConfig,
	ExitCodeType,
} from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';
import { validateMainConfig } from '../validator/design-token-config.ts';
import {
	normalizeProfileName,
	type ProfileDocument,
	type ProfileEntry,
	ProfileFormatError,
	parseProfileDocument,
} from './profile-resolver.ts';
import { memoizeParsed, type TokenCache } from './token-cache.ts';

const ENTRY_HINT =
	'Use main.yaml as the workspace entry or run wave token new.';
const DEFAULT_MAIN_YAML = 'main.yaml';

export interface LoadedDesignTokenWorkspace {
	path: string;
	workspaceDir: string;
	config: DesignTokenBuildConfig;
	/** Document-level `$id` (theme identity) read from the main.yaml root. */
	themeId?: string | undefined;
	tokenContent: string;
}

export type WorkspaceLoadResult =
	| { ok: true; workspace: LoadedDesignTokenWorkspace }
	| { ok: false; exitCode: ExitCodeType; message: string; path: string };

export interface LoadedDesignTokenSource {
	kind: 'main' | 'profile';
	path: string;
	workspace: LoadedDesignTokenWorkspace;
	entry: ProfileEntry;
	document: ProfileDocument;
}

export type SourceLoadResult =
	| { ok: true; source: LoadedDesignTokenSource }
	| { ok: false; exitCode: ExitCodeType; message: string; path: string };

function expandHomePath(input: string): string {
	const home = process.env.HOME;
	if (!home) return input;
	if (input.startsWith('~/')) return path.join(home, input.slice(2));
	if (input.startsWith('${HOME}/')) return path.join(home, input.slice(8));
	return input;
}

function failure(
	filePath: string,
	exitCode: ExitCodeType,
	reason: string,
): WorkspaceLoadResult {
	return {
		ok: false,
		exitCode,
		path: filePath,
		message: `${reason}: ${filePath}. ${ENTRY_HINT}`,
	};
}

function errorCode(error: unknown): string | undefined {
	if (!error || typeof error !== 'object' || !('code' in error))
		return undefined;
	return String((error as { code?: unknown }).code);
}

function sourceFailure(
	filePath: string,
	exitCode: ExitCodeType,
	reason: string,
): SourceLoadResult {
	return {
		ok: false,
		exitCode,
		path: filePath,
		message: `${reason}: ${filePath}. ${ENTRY_HINT}`,
	};
}

async function findAncestorMain(
	profilePath: string,
): Promise<string | undefined> {
	let directory = path.dirname(profilePath);
	while (true) {
		const candidate = path.join(directory, DEFAULT_MAIN_YAML);
		try {
			const stats = await fs.stat(candidate);
			if (stats.isFile()) return candidate;
		} catch {
			// Continue towards the filesystem root.
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

async function mainProfileEntry(
	workspace: LoadedDesignTokenWorkspace,
): Promise<ProfileEntry> {
	const nightPath = path.join(workspace.workspaceDir, 'main@night.yaml');
	let hasNight = false;
	try {
		hasNight = (await fs.stat(nightPath)).isFile();
	} catch {
		// Night is optional for source selection.
	}
	return {
		name: 'main',
		path: workspace.path,
		isDefault: true,
		...(hasNight ? { nightPath } : {}),
	};
}

/**
 * Resolve a token source document for commands that operate on one Day
 * document. A main file or directory keeps the existing workspace contract;
 * any other YAML file is treated as a profile and merged against the nearest
 * ancestor main.yaml.
 */
export async function loadDesignTokenSource(
	input?: string,
	cwd = process.cwd(),
	cache?: TokenCache,
): Promise<SourceLoadResult> {
	const expandedInput = expandHomePath(input ?? DEFAULT_MAIN_YAML);
	const suppliedPath = path.isAbsolute(expandedInput)
		? path.normalize(expandedInput)
		: path.resolve(cwd, expandedInput);

	let sourcePath = suppliedPath;
	try {
		const stats = await fs.stat(suppliedPath);
		if (
			stats.isDirectory() &&
			path.basename(suppliedPath) === DEFAULT_MAIN_YAML
		) {
			return sourceFailure(
				suppliedPath,
				ExitCode.INVALID_PARAMETER,
				'Invalid design token source; expected a regular file, not a directory named main.yaml',
			);
		}
		if (stats.isDirectory())
			sourcePath = path.join(suppliedPath, DEFAULT_MAIN_YAML);
		else if (!stats.isFile()) {
			return sourceFailure(
				suppliedPath,
				ExitCode.INVALID_PARAMETER,
				'Invalid design token source; expected a regular YAML file or workspace directory',
			);
		}
	} catch (error) {
		if (errorCode(error) === 'ENOENT') {
			return sourceFailure(
				suppliedPath,
				ExitCode.FILE_NOT_FOUND,
				'Design token source not found',
			);
		}
		return sourceFailure(
			suppliedPath,
			ExitCode.GENERAL_ERROR,
			'Unable to inspect design token source',
		);
	}

	if (path.basename(sourcePath) === DEFAULT_MAIN_YAML) {
		const loaded = await loadDesignTokenWorkspace(sourcePath, cwd, cache);
		if (!loaded.ok) return loaded;
		const entry = await mainProfileEntry(loaded.workspace);
		return {
			ok: true,
			source: {
				kind: 'main',
				path: loaded.workspace.path,
				workspace: loaded.workspace,
				entry,
				document: {
					entry,
					config: loaded.workspace.config,
					buildDir: loaded.workspace.workspaceDir,
					themeId: loaded.workspace.themeId,
					tokenContent: loaded.workspace.tokenContent,
				},
			},
		};
	}

	if (
		!sourcePath.endsWith('.yaml') ||
		path.basename(sourcePath).endsWith('@night.yaml')
	) {
		return sourceFailure(
			sourcePath,
			ExitCode.INVALID_PARAMETER,
			'Invalid design token source; expected main.yaml or a Day profile YAML file',
		);
	}

	const mainPath = await findAncestorMain(sourcePath);
	if (!mainPath) {
		return sourceFailure(
			sourcePath,
			ExitCode.INVALID_PARAMETER,
			'Unable to locate an ancestor main.yaml for profile source',
		);
	}
	const loaded = await loadDesignTokenWorkspace(mainPath, cwd, cache);
	if (!loaded.ok) return loaded;

	let name: string;
	try {
		name = normalizeProfileName(path.basename(sourcePath, '.yaml'));
	} catch (error) {
		return sourceFailure(
			sourcePath,
			ExitCode.INVALID_PARAMETER,
			error instanceof Error ? error.message : String(error),
		);
	}
	let nightPath: string | undefined;
	const siblingNightPath = path.join(
		path.dirname(sourcePath),
		`${path.basename(sourcePath, '.yaml')}@night.yaml`,
	);
	try {
		if ((await fs.stat(siblingNightPath)).isFile())
			nightPath = siblingNightPath;
	} catch {
		// Night is optional for source selection.
	}
	const entry: ProfileEntry = {
		name,
		path: sourcePath,
		isDefault: false,
		nightPath,
	};
	try {
		const document = await parseProfileDocument(
			entry,
			{
				baseConfig: loaded.workspace.config,
				baseTree: memoizeParsed(
					cache,
					mainPath,
					loaded.workspace.tokenContent,
					'workspace-token-v1',
					() =>
						yaml.load(loaded.workspace.tokenContent) as Record<string, unknown>,
					(value) =>
						typeof value === 'object' &&
						value !== null &&
						!Array.isArray(value),
				),
				baseId: loaded.workspace.themeId,
				baseDir: loaded.workspace.workspaceDir,
			},
			cache,
		);
		return {
			ok: true,
			source: {
				kind: 'profile',
				path: sourcePath,
				workspace: loaded.workspace,
				entry,
				document,
			},
		};
	} catch (error) {
		if (error instanceof ProfileFormatError) {
			return {
				ok: false,
				exitCode: error.exitCode,
				path: sourcePath,
				message: `${error.message}. ${ENTRY_HINT}`,
			};
		}
		return sourceFailure(
			sourcePath,
			ExitCode.FORMAT_ERROR,
			error instanceof Error ? error.message : String(error),
		);
	}
}

export async function loadDesignTokenWorkspace(
	input?: string,
	cwd = process.cwd(),
	cache?: TokenCache,
): Promise<WorkspaceLoadResult> {
	const expandedInput = expandHomePath(input ?? 'main.yaml');
	const workspacePath = path.isAbsolute(expandedInput)
		? path.normalize(expandedInput)
		: path.resolve(cwd, expandedInput);

	if (path.basename(workspacePath) !== 'main.yaml') {
		return failure(
			workspacePath,
			ExitCode.INVALID_PARAMETER,
			'Invalid design token workspace entry; expected a file named main.yaml',
		);
	}

	let stats: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stats = await fs.stat(workspacePath);
	} catch (error) {
		if (errorCode(error) === 'ENOENT') {
			return failure(
				workspacePath,
				ExitCode.FILE_NOT_FOUND,
				'Design token workspace entry not found',
			);
		}
		return failure(
			workspacePath,
			ExitCode.GENERAL_ERROR,
			'Unable to inspect design token workspace entry',
		);
	}

	if (!stats.isFile()) {
		return failure(
			workspacePath,
			ExitCode.INVALID_PARAMETER,
			'Invalid design token workspace entry; expected a regular file',
		);
	}

	let content: string;
	try {
		content = await fs.readFile(workspacePath, 'utf8');
	} catch {
		return failure(
			workspacePath,
			ExitCode.GENERAL_ERROR,
			'Unable to read design token workspace entry',
		);
	}

	let loaded: unknown;
	try {
		loaded = memoizeParsed(
			cache,
			workspacePath,
			content,
			'workspace-root-v1',
			() => yaml.load(content),
			(value) =>
				typeof value === 'object' && value !== null && !Array.isArray(value),
		);
	} catch (error) {
		const reason =
			error instanceof yaml.YAMLException
				? `Invalid YAML (${error.message})`
				: `Unable to parse YAML (${error instanceof Error ? error.message : String(error)})`;
		return failure(workspacePath, ExitCode.FORMAT_ERROR, reason);
	}

	if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
		return failure(
			workspacePath,
			ExitCode.FORMAT_ERROR,
			'Invalid main.yaml root; expected an object containing $config',
		);
	}

	const root = loaded as Record<string, unknown>;
	if (!Object.hasOwn(root, '$config')) {
		return failure(
			workspacePath,
			ExitCode.FORMAT_ERROR,
			'Invalid main.yaml; missing required $config',
		);
	}

	const configResult = validateMainConfig(root.$config);
	if (!configResult.ok) {
		return failure(
			workspacePath,
			configResult.exitCode,
			`Invalid main.yaml $config (${configResult.message})`,
		);
	}

	// Document-level $id is taken from the root before the token tree is
	// serialized, so it never enters the token tree (take-then-strip).
	let themeId: string | undefined;
	if (Object.hasOwn(root, '$id')) {
		const rawThemeId = root.$id;
		if (typeof rawThemeId !== 'string' || rawThemeId.trim() === '') {
			return failure(
				workspacePath,
				ExitCode.FORMAT_ERROR,
				'Invalid main.yaml $id; expected a non-empty string when present',
			);
		}
		themeId = rawThemeId;
	}

	const tokenRoot = { ...root };
	delete tokenRoot.$config;
	delete tokenRoot.$id;

	return {
		ok: true,
		workspace: {
			path: workspacePath,
			workspaceDir: path.dirname(workspacePath),
			config: configResult.config,
			themeId,
			tokenContent: yaml.dump(tokenRoot, { lineWidth: -1 }),
		},
	};
}
