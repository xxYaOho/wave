/**
 * The public CLI no longer rewrites argv before Commander parses it.
 * Legacy aliases and shortcut flags therefore fail through the normal
 * Commander unknown-command/unknown-option path.
 */
export function normalizeWaveArgv(argv: string[]): string[] {
	return argv;
}
