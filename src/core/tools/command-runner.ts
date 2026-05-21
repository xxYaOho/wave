export interface PlannedCommand {
	command: string;
	args: string[];
	cwd?: string;
}

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface CommandRunner {
	run(command: PlannedCommand): Promise<CommandResult>;
}

export class BunCommandRunner implements CommandRunner {
	async run(command: PlannedCommand): Promise<CommandResult> {
		const proc = Bun.spawn([command.command, ...command.args], {
			cwd: command.cwd,
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
