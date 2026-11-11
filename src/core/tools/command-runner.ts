import { spawn } from 'node:child_process';
import type { CommandResult, CommandRunner, PlannedCommand } from './types.ts';

export interface CommandLifetime {
	signal?: AbortSignal;
	timeoutMs?: number;
	killGraceMs?: number;
}

export class CommandTerminationError extends Error {
	readonly code: 'WCP_CANCELLED' | 'WCP_TIMEOUT';
	constructor(readonly reason: 'cancelled' | 'timeout') {
		super(
			reason === 'cancelled' ? 'Compression cancelled' : 'Compressor timed out',
		);
		this.name = 'CommandTerminationError';
		this.code = reason === 'cancelled' ? 'WCP_CANCELLED' : 'WCP_TIMEOUT';
	}
}

export class BunCommandRunner implements CommandRunner {
	constructor(private readonly lifetime?: CommandLifetime) {}

	async run(command: PlannedCommand): Promise<CommandResult> {
		// Only opt-in consumers change process lifetime. Motion, install and
		// ordinary discovery retain the original Bun subprocess behavior.
		if (this.lifetime) return this.runManaged(command, this.lifetime);
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

	private async runManaged(
		command: PlannedCommand,
		lifetime: CommandLifetime,
	): Promise<CommandResult> {
		if (lifetime.signal?.aborted)
			throw new CommandTerminationError('cancelled');
		// An independent POSIX group contains both encoder and descendants.
		// Never signal the CLI's own group or discover targets by executable name.
		if (process.platform === 'win32')
			throw new Error('Managed compression requires POSIX process groups');
		const proc = spawn(command.command, command.args ?? [], {
			cwd: command.cwd,
			env: command.env ? { ...process.env, ...command.env } : process.env,
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		let spawnError: Error | undefined;
		const closed = new Promise<CommandResult>((resolve) => {
			proc.once('error', (error) => {
				spawnError = error;
			});
			// close follows exit AND stdout/stderr closure, including inherited pipes.
			proc.once('close', (exitCode) =>
				resolve({
					exitCode: spawnError ? 127 : (exitCode ?? 1),
					stdout: Buffer.concat(stdout).toString(),
					stderr: spawnError?.message ?? Buffer.concat(stderr).toString(),
				}),
			);
		});
		let termination: CommandTerminationError | undefined;
		let escalation: Promise<void> | undefined;
		let streamDeadline: ReturnType<typeof setTimeout> | undefined;
		const killGroup = (signal: NodeJS.Signals) => {
			if (!proc.pid) return;
			try {
				process.kill(-proc.pid, signal);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
			}
		};
		const stop = (reason: 'cancelled' | 'timeout') => {
			if (termination) return;
			termination = new CommandTerminationError(reason);
			killGroup('SIGTERM');
			escalation = new Promise<void>((resolve) => {
				setTimeout(() => {
					killGroup('SIGKILL');
					resolve();
				}, lifetime.killGraceMs ?? 200);
			});
			// A final local pipe-close bound protects against an inherited descriptor
			// held outside the process group. The group still receives SIGKILL first.
			streamDeadline = setTimeout(
				() => {
					killGroup('SIGKILL');
					proc.stdout.destroy();
					proc.stderr.destroy();
				},
				(lifetime.killGraceMs ?? 200) + 1000,
			);
		};
		const abort = () => stop('cancelled');
		lifetime.signal?.addEventListener('abort', abort, { once: true });
		if (lifetime.signal?.aborted) abort();
		const timer =
			lifetime.timeoutMs === undefined
				? undefined
				: setTimeout(() => stop('timeout'), lifetime.timeoutMs);
		try {
			const result = await closed;
			// A leader may exit before its descendants. Always finish escalation
			// before returning, even when close has already been observed.
			if (escalation) {
				await escalation;
				const groupAlive = () => {
					if (!proc.pid) return false;
					try {
						process.kill(-proc.pid, 0);
						return true;
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
						throw error;
					}
				};
				// close cannot observe descendants that redirect their own stdio.
				// Confirm that the group disappears, with a separate bounded wait.
				const deadline = Date.now() + 1000;
				while (groupAlive() && Date.now() < deadline) await Bun.sleep(10);
				if (groupAlive() && termination)
					termination.message +=
						'; process group did not exit within termination deadline';
			}
			if (termination) throw termination;
			return result;
		} finally {
			clearTimeout(timer);
			clearTimeout(streamDeadline);
			lifetime.signal?.removeEventListener('abort', abort);
		}
	}
}
