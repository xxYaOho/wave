import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

interface RunningCli {
	child: ReturnType<typeof spawn>;
	stdout: string;
	stderr: string;
	url: Promise<string>;
	closed: Promise<number>;
}

function spawnManual(args: string[]): RunningCli {
	const child = spawn(
		process.execPath,
		[cliEntry, 'manual', '--no-open', ...args],
		{
			cwd: rootDir,
			env: { ...process.env, NODE_ENV: 'test' },
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	let stdout = '';
	let stderr = '';
	let resolveUrl: (url: string) => void = () => {};
	let rejectUrl: (error: Error) => void = () => {};
	const url = new Promise<string>((resolve, reject) => {
		resolveUrl = resolve;
		rejectUrl = reject;
	});
	const closed = new Promise<number>((resolve) => {
		child.once('close', (code) => resolve(code ?? 1));
	});
	const urlPattern = /Local:\s+(http:\/\/127\.0\.0\.1:\d+\/)/u;
	const inspect = (chunk: Buffer, target: 'stdout' | 'stderr') => {
		const text = chunk.toString();
		if (target === 'stdout') stdout += text;
		else stderr += text;
		const match = urlPattern.exec(stdout);
		if (match?.[1]) resolveUrl(match[1]);
	};
	child.stdout?.on('data', (chunk: Buffer) => inspect(chunk, 'stdout'));
	child.stderr?.on('data', (chunk: Buffer) => inspect(chunk, 'stderr'));
	child.once('error', (error) => rejectUrl(error));

	return {
		child,
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
		url,
		closed,
	};
}

async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function freePort(start = 28000): Promise<number> {
	for (let port = start; port < start + 200; port += 1) {
		try {
			const server = Bun.serve({
				hostname: '127.0.0.1',
				port,
				fetch: () => new Response('ok'),
			});
			server.stop(true);
			return port;
		} catch {
			// Continue through the bounded range.
		}
	}
	throw new Error('No free manual test port');
}

async function stopChild(running: RunningCli): Promise<void> {
	if (running.child.exitCode !== null) return;
	running.child.kill('SIGINT');
	try {
		await withTimeout(running.closed, 5000, 'manual process shutdown');
	} catch {
		running.child.kill('SIGKILL');
		await running.closed;
	}
}

describe('M1 manual server process contract', () => {
	test('starts on an explicit port, serves the shell and split artifacts, and exits on SIGINT', async () => {
		const port = await freePort();
		const running = spawnManual(['--port', String(port)]);
		try {
			const url = await withTimeout(running.url, 10000, 'manual URL');
			expect(url).toBe(`http://127.0.0.1:${port}/`);
			const home = await fetch(url);
			const metadata = await fetch(`${url}manual-metadata.json`);
			const chunk = await fetch(`${url}pages/en/quickstart.json`);
			expect(home.status).toBe(200);
			expect(metadata.status).toBe(200);
			expect(chunk.status).toBe(200);
			expect(await metadata.json()).toMatchObject({ locales: ['zh', 'en'] });
			expect(await chunk.json()).toMatchObject({
				route: 'quickstart',
				locale: 'en',
			});
			running.child.kill('SIGINT');
			expect(await withTimeout(running.closed, 5000, 'manual SIGINT')).toBe(0);
		} finally {
			await stopChild(running);
		}
	});

	test('falls back from the default port when it is occupied', async () => {
		let blocker: ReturnType<typeof Bun.serve> | undefined;
		try {
			blocker = Bun.serve({
				hostname: '127.0.0.1',
				port: 4567,
				fetch: () => new Response('occupied'),
			});
		} catch {
			// A parallel process already owns the default; the CLI still exercises
			// its bounded auto-port path against the next available port.
		}
		const running = spawnManual([]);
		try {
			const url = await withTimeout(running.url, 10000, 'fallback manual URL');
			const selectedPort = Number(new URL(url).port);
			expect(selectedPort).toBeGreaterThanOrEqual(4567);
			if (blocker) expect(selectedPort).not.toBe(4567);
		} finally {
			await stopChild(running);
			blocker?.stop(true);
		}
	});
});
