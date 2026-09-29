import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import * as yaml from 'js-yaml';
import {
	discoverProfiles,
	normalizeProfileName,
	ProfileFormatError,
} from '../../core/pipeline/profile-resolver.ts';
import { loadDesignTokenWorkspace } from '../../core/pipeline/workspace-loader.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';

function idsHint(basePath: string): string {
	return `Run wave dt ids --write -f ${JSON.stringify(basePath)} before creating a profile.`;
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
	// Scan authored tokens before reference/$extends resolution, as ids does.
	walk(tree, []);
	return Object.fromEntries(
		Array.from(entries, ([id, token]) => [id, { $value: token.value }]),
	);
}

export function createNewProfileCommand(name = 'new-profile'): Command {
	return new Command(name)
		.description('Create a full value snapshot profile from a registered base')
		.argument('<name>', 'Profile name (lowercase, spaces become underscores)')
		.option('-f, --file <path>', 'main.yaml path. Default: ./main.yaml')
		.action(async (rawName: string, options: { file?: string }) => {
			try {
				let profileName: string;
				try {
					profileName = normalizeProfileName(rawName);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}

				const loaded = await loadDesignTokenWorkspace(options.file);
				if (!loaded.ok) {
					logger.error(loaded.message);
					if (loaded.message.includes('Invalid main.yaml $id;'))
						logger.error(idsHint(loaded.path));
					process.exitCode = loaded.exitCode;
					return;
				}
				const workspace = loaded.workspace;
				if (!workspace.themeId) {
					throw new ProfileFormatError(
						workspace.path,
						`Base root requires a registered $id. ${idsHint(workspace.path)}`,
					);
				}
				const overrides = snapshotOverrides(
					yaml.load(workspace.tokenContent) as Record<string, unknown>,
					workspace.path,
				);
				const profiles = await discoverProfiles(workspace.workspaceDir);
				if (profiles.some((profile) => profile.name === profileName)) {
					logger.error(`Profile "${profileName}" already exists`);
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}

				const profilePath = path.join(
					workspace.workspaceDir,
					'profiles',
					`${profileName}.yaml`,
				);
				const content = yaml.dump(
					{
						$id: randomBytes(16).toString('hex'),
						$config: { base: workspace.themeId },
						$override: overrides,
					},
					{ lineWidth: -1, noRefs: true },
				);
				await fs.mkdir(path.dirname(profilePath), { recursive: true });
				await fs.writeFile(profilePath, content, {
					encoding: 'utf8',
					flag: 'wx',
				});
				logger.success(`Created: ${profilePath}`);
				logger.info('Next steps:');
				logger.info('  1. Edit $override values to define the profile');
				logger.info('  2. Delete redundant overrides to follow base changes');
				logger.info(
					`  3. Run wave dt build --profile ${profileName} -f ${JSON.stringify(workspace.path)} to verify`,
				);
			} catch (error) {
				logger.error(
					`new-profile failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exitCode =
					error instanceof ProfileFormatError
						? error.exitCode
						: ExitCode.GENERAL_ERROR;
			}
		});
}
