import type { CommandResult, CommandRunner, PlannedCommand } from './types.ts';

export class BunCommandRunner implements CommandRunner {
	async run(command: PlannedCommand): Promise<CommandResult> {
		const proc = Bun.spawn([command.command, ...(command.args ?? [])], {
			cwd: command.cwd,
			env: command.env ? { ...process.env, ...command.env } : process.env,
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { exitCode, stdout, stderr };
	}
}
