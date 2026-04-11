import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { WaveConfig } from '../types/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
export const VERSION = pkg.version as string;

export const DEFAULT_CONFIG: WaveConfig = {
  version: VERSION,
  defaultOutput: '${HOME}/Downloads/{THEME}/',
  defaultPlatform: ['general'],
};
