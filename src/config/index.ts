import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WaveConfig } from '../types/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
	const injectedVersion = process.env.WAVE_VERSION;
	if (injectedVersion?.trim()) return injectedVersion.trim();

	const pkg = JSON.parse(
		readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
	);
	return pkg.version as string;
}

export const VERSION = readPackageVersion();

export const DEFAULT_CONFIG: WaveConfig = {
	version: VERSION,
	defaultOutput: './{THEME}/',
	defaultPlatform: ['general'],
};
