import { ExitCode } from '../../types/index.ts';

export function createTokenMigrateCommandAction() {
	return (options: { manual?: boolean }) => {
		if (options.manual) return;
		console.error('Choose a migration: wave token migrate extensions.');
		process.exitCode = ExitCode.INVALID_COMMAND;
	};
}
