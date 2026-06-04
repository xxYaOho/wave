import * as os from 'node:os';
import * as path from 'node:path';

function homeDir(): string {
	return process.env.HOME || os.homedir();
}

export function resourceCacheDir(): string {
	return (
		process.env.WAVE_RESOURCE_CACHE_DIR ??
		path.join(homeDir(), '.cache', 'wave', 'resources')
	);
}

export function resourceStatePath(): string {
	return (
		process.env.WAVE_RESOURCE_STATE_PATH ??
		path.join(homeDir(), '.local', 'state', 'wave', 'resources', 'state.json')
	);
}

export function resourceConfigDir(): string {
	return (
		process.env.WAVE_RESOURCE_CONFIG_DIR ??
		path.join(homeDir(), '.config', 'wave', 'resources')
	);
}

export function resourceCachePath(name: string): string {
	return path.join(resourceCacheDir(), `${name}.yaml`);
}

export function leonardoRecipePath(): string {
	return path.join(resourceConfigDir(), 'leonardo.yaml');
}
