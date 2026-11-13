import * as path from 'node:path';
import type { Command } from 'commander';
import { createProfile } from '../../core/pipeline/profile-create.ts';
import { ExitCode } from '../../types/index.ts';
import { logger } from '../../utils/logger.ts';
import { expandMainYamlEntry } from '../file-input.ts';

export function createNewProfileCommandAction() {
	return async (rawName: string, _options: unknown, command: Command) => {
		const options = command.optsWithGlobals<{
			file?: string;
			output?: string;
			dryRun?: boolean;
			force?: boolean;
		}>();
		const result = await createProfile(rawName, {
			file: await expandMainYamlEntry(options.file),
			output: options.output ? path.resolve(options.output) : undefined,
			dryRun: options.dryRun,
			force: options.force,
		});
		for (const entry of result.logs) logger[entry.level](entry.message);
		process.exitCode = result.exitCode ?? ExitCode.SUCCESS;
	};
}
