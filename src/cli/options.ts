import type { Command } from 'commander';

export function addOutputOption(
	command: Command,
	description = 'Output path',
): Command {
	return command.option('-o, --output <path>', description);
}

export function addQualityOption(
	command: Command,
	description = 'Quality, 1-100',
	defaultValue?: string,
): Command {
	return defaultValue === undefined
		? command.option('-q, --quality <n>', description)
		: command.option('-q, --quality <n>', description, defaultValue);
}

export function addRepeatableOption(
	command: Command,
	flags: string,
	description: string,
): Command {
	return command.option(
		flags,
		description,
		(value: string, previous: string[] = []) => [...previous, value],
	);
}

/** Add the shared documentation switch without attaching business semantics. */
export function addManualOption(command: Command): Command {
	if (command.options.some((option) => option.long === '--manual')) {
		return command;
	}
	return command.option(
		'-m, --manual',
		'Print Markdown usage for this command',
	);
}
