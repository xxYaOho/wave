import * as fs from 'node:fs/promises';
import type { ThemeFileEntry } from './theme-context.ts';

export async function selectTheme(
	themeFiles: ThemeFileEntry[],
): Promise<ThemeFileEntry> {
	if (themeFiles.length <= 1) {
		return themeFiles[0]!;
	}

	// Dynamic import to avoid loading @clack/prompts when not needed
	const { select } = await import('@clack/prompts');

	const selected = await select({
		message: 'Select a theme to check:',
		options: themeFiles.map((f) => ({ value: f, label: f.name })),
	});

	return selected as ThemeFileEntry;
}
