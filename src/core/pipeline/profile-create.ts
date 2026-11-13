import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ExitCode, type ExitCodeType } from '../../types/index.ts';
import {
	discoverProfiles,
	normalizeProfileName,
	ProfileFormatError,
} from './profile-resolver.ts';
import { planSourceOutput, writeSourceOutput } from './source-output.ts';
import { loadDesignTokenWorkspace } from './workspace-loader.ts';

export type ProfileCreateLogLevel = 'error' | 'success' | 'info' | 'warn';

export interface ProfileCreateLog {
	level: ProfileCreateLogLevel;
	message: string;
}

export interface ProfileCreateResult {
	exitCode: ExitCodeType;
	logs: ProfileCreateLog[];
}

export interface ProfileCreateOptions {
	file?: string;
	output?: string;
	dryRun?: boolean;
	force?: boolean;
}

function idsHint(basePath: string): string {
	return `Run wave token ids --write -f ${JSON.stringify(basePath)} before creating a profile.`;
}

function snapshotOverrides(
	tree: Record<string, unknown>,
	basePath: string,
): Record<string, { $value: unknown }> {
	const entries = new Map<string, { path: string; value: unknown }>();
	function walk(node: unknown, parts: string[]): void {
		if (!node || typeof node !== 'object' || Array.isArray(node)) return;
		const token = node as Record<string, unknown>;
		if (parts.length > 0 && Object.hasOwn(token, '$value')) {
			const tokenPath = parts.join('.');
			const id = token.$id;
			if (typeof id !== 'string' || id.trim() === '') {
				throw new ProfileFormatError(
					basePath,
					`Base token "${tokenPath}" requires a registered $id. ${idsHint(basePath)}`,
				);
			}
			const existing = entries.get(id);
			if (existing) {
				throw new ProfileFormatError(
					basePath,
					`Duplicate base token $id "${id}" at "${existing.path}" and "${tokenPath}". ${idsHint(basePath)}`,
				);
			}
			entries.set(id, {
				path: tokenPath,
				value: structuredClone(token.$value),
			});
			return;
		}
		for (const [key, child] of Object.entries(token)) {
			if (key.startsWith('$') || (parts.length === 0 && key === 'doctor'))
				continue;
			walk(child, [...parts, key]);
		}
	}
	walk(tree, []);
	return Object.fromEntries(
		Array.from(entries, ([id, token]) => [id, { $value: token.value }]),
	);
}

function log(
	logs: ProfileCreateLog[],
	level: ProfileCreateLogLevel,
	message: string,
): void {
	logs.push({ level, message });
}

export async function createProfile(
	rawName: string,
	options: ProfileCreateOptions,
): Promise<ProfileCreateResult> {
	const logs: ProfileCreateLog[] = [];
	try {
		let profileName: string;
		try {
			profileName = normalizeProfileName(rawName);
		} catch (error) {
			log(
				logs,
				'error',
				error instanceof Error ? error.message : String(error),
			);
			return { exitCode: ExitCode.INVALID_PARAMETER, logs };
		}

		const loaded = await loadDesignTokenWorkspace(options.file);
		if (!loaded.ok) {
			log(logs, 'error', loaded.message);
			if (loaded.message.includes('Invalid main.yaml $id;'))
				log(logs, 'error', idsHint(loaded.path));
			return { exitCode: loaded.exitCode, logs };
		}
		const workspace = loaded.workspace;
		if (!workspace.themeId)
			throw new ProfileFormatError(
				workspace.path,
				`Base root requires a registered $id. ${idsHint(workspace.path)}`,
			);
		const overrides = snapshotOverrides(
			yaml.load(workspace.tokenContent) as Record<string, unknown>,
			workspace.path,
		);
		const profiles = await discoverProfiles(workspace.workspaceDir);
		const profilePath = path.resolve(
			options.output ??
				path.join(workspace.workspaceDir, 'profiles', `${profileName}.yaml`),
		);
		if (path.basename(profilePath) !== `${profileName}.yaml`) {
			log(logs, 'error', `Profile output must be named ${profileName}.yaml`);
			return { exitCode: ExitCode.INVALID_PARAMETER, logs };
		}
		const collision = profiles.find((profile) => profile.name === profileName);
		const sameTarget =
			collision &&
			options.force &&
			(await fs.realpath(collision.path)) ===
				(await fs
					.realpath(profilePath)
					.catch((error: NodeJS.ErrnoException) => {
						if (error.code === 'ENOENT') return undefined;
						throw error;
					}));
		if (collision && (collision.isDefault || !sameTarget)) {
			log(logs, 'error', `Profile "${profileName}" already exists`);
			return { exitCode: ExitCode.INVALID_PARAMETER, logs };
		}

		const plan = await planSourceOutput(profilePath, options.force, [
			workspace.path,
		]);
		const content = yaml.dump(
			{
				$id: randomBytes(16).toString('hex'),
				$config: { base: workspace.themeId },
				$override: overrides,
			},
			{ lineWidth: -1, noRefs: true },
		);
		if (!options.dryRun)
			await writeSourceOutput(profilePath, content, options.force);
		log(
			logs,
			'success',
			`${options.dryRun ? `Dry run: would ${plan.overwrites ? 'overwrite' : 'create'}` : 'Created'}: ${profilePath}`,
		);
		log(logs, 'info', 'Next steps:');
		log(logs, 'info', '  1. Edit $override values to define the profile');
		log(logs, 'info', '  2. Delete redundant overrides to follow base changes');
		const relative = path.relative(workspace.workspaceDir, profilePath);
		if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			log(
				logs,
				'warn',
				`Move ${profileName}.yaml into ${workspace.workspaceDir} or one of its subdirectories before consuming it with -f.`,
			);
			log(
				logs,
				'info',
				`  3. Then run wave token build -f <moved-${profileName}.yaml-path> to verify`,
			);
		} else {
			log(
				logs,
				'info',
				`  3. Run wave token build -f ${JSON.stringify(profilePath)} to verify`,
			);
		}
		return { exitCode: ExitCode.SUCCESS, logs };
	} catch (error) {
		log(
			logs,
			'error',
			`Profile creation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			exitCode:
				error instanceof ProfileFormatError
					? error.exitCode
					: ExitCode.GENERAL_ERROR,
			logs,
		};
	}
}
