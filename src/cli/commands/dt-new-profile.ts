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
import {
	planSourceOutput,
	writeSourceOutput,
} from '../../core/pipeline/source-output.ts';
import { loadDesignTokenWorkspace } from '../../core/pipeline/workspace-loader.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { expandMainYamlEntry } from '../file-input.ts';

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
		.option(
			'-f, --file <path>',
			'Base main.yaml or workspace directory. Default: ./main.yaml',
		)
		.option(
			'-o, --output <path>',
			'Output YAML file (stem must match the normalized name)',
		)
		.option('--dry-run', 'Show the complete creation plan without writing')
		.option('--force', 'Allow overwriting the selected profile target')
		.action(async (rawName: string, _options: unknown, command: Command) => {
			const options = command.optsWithGlobals<{
				file?: string;
				output?: string;
				dryRun?: boolean;
				force?: boolean;
			}>();
			try {
				let profileName: string;
				try {
					profileName = normalizeProfileName(rawName);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}

				const loaded = await loadDesignTokenWorkspace(
					await expandMainYamlEntry(options.file),
				);
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
				const profilePath = path.resolve(
					options.output ??
						path.join(
							workspace.workspaceDir,
							'profiles',
							`${profileName}.yaml`,
						),
				);
				if (path.basename(profilePath) !== `${profileName}.yaml`) {
					logger.error(`Profile output must be named ${profileName}.yaml`);
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
				}
				const collision = profiles.find(
					(profile) => profile.name === profileName,
				);
				// realpath comparison also accepts equivalent parent-directory aliases;
				// the write preflight still rejects a symlink as the target file.
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
					logger.error(`Profile "${profileName}" already exists`);
					process.exitCode = ExitCode.INVALID_PARAMETER;
					return;
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
				logger.success(
					`${options.dryRun ? `Dry run: would ${plan.overwrites ? 'overwrite' : 'create'}` : 'Created'}: ${profilePath}`,
				);
				logger.info('Next steps:');
				logger.info('  1. Edit $override values to define the profile');
				logger.info('  2. Delete redundant overrides to follow base changes');
				const relative = path.relative(workspace.workspaceDir, profilePath);
				if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
					logger.warn(
						`Move ${profileName}.yaml into ${workspace.workspaceDir} or one of its subdirectories before consuming it with -f.`,
					);
					logger.info(
						`  3. Then run wave token build -f <moved-${profileName}.yaml-path> to verify`,
					);
				} else {
					logger.info(
						`  3. Run wave token build -f ${JSON.stringify(profilePath)} to verify`,
					);
				}
			} catch (error) {
				logger.error(
					`Profile creation failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exitCode =
					error instanceof ProfileFormatError
						? error.exitCode
						: ExitCode.GENERAL_ERROR;
			}
		});
}
