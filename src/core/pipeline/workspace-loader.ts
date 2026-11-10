import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type {
	DesignTokenBuildConfig,
	ExitCodeType,
} from '../../types/index.ts';
import { ExitCode } from '../../types/index.ts';
import { validateMainConfig } from '../validator/design-token-config.ts';

const ENTRY_HINT =
	'Use main.yaml as the workspace entry or run wave token new.';

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

export async function loadDesignTokenWorkspace(
	input?: string,
	cwd = process.cwd(),
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
		loaded = yaml.load(content);
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
