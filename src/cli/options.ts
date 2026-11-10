import type { Command } from 'commander';

/** Add the shared documentation switch without attaching business semantics. */
export function addManualOption(command: Command): Command {
	return command.option(
		'-m, --manual',
		'Print Markdown usage for this command',
	);
}
