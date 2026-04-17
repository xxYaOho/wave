import type { ThemeFileEntry } from '../core/doctor/theme-context.ts';

export async function selectThemesToGenerate(
	themeFiles: ThemeFileEntry[],
): Promise<ThemeFileEntry[]> {
	const { multiselect, isCancel } = await import('@clack/prompts');

	const selected = await multiselect<ThemeFileEntry>({
		message: 'Select themes to generate:',
		options: themeFiles.map((f) => ({ value: f, label: f.name })),
		initialValues: themeFiles.filter((f) => f.name === 'main'),
	});

	if (isCancel(selected)) {
		process.exit(0);
	}

	return selected as ThemeFileEntry[];
}
