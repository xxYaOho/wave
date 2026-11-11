import * as os from 'node:os';
import type { EnvironmentMetadata } from './types.ts';

export function collectEnvironmentMetadata(
	cwd: string = process.cwd(),
): EnvironmentMetadata {
	return {
		runtime: 'bun',
		node: process.version,
		bun: Bun.version,
		platform: process.platform,
		arch: process.arch,
		cpuCount: os.cpus().length,
		memoryBytes: os.totalmem(),
		cwd,
	};
}
