import type { CommandResult, CommandRunner, PlannedCommand } from './types.ts';

export class BunCommandRunner implements CommandRunner {
	async run(command: PlannedCommand): Promise<CommandResult> {
		let proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
		try {
			proc = Bun.spawn([command.command, ...(command.args ?? [])], {
				cwd: command.cwd,
				env: command.env ? { ...process.env, ...command.env } : process.env,
				stdout: 'pipe',
				stderr: 'pipe',
			});
		} catch (error) {
			return {
				exitCode: 127,
				stdout: '',
				stderr: error instanceof Error ? error.message : String(error),
			};
		}

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { exitCode, stdout, stderr };
	}
}
