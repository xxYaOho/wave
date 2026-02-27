import type { WaveConfig } from '../types/index.ts';

export const VERSION = '0.2.0';

export const DEFAULT_CONFIG: WaveConfig = {
  version: VERSION,
  defaultOutput: '${HOME}/Downloads/{THEME}/',
  defaultPlatform: ['general'],
};
