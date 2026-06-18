import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { startManualServer } from '../src/core/manual/server.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const cliEntry = path.join(rootDir, 'src/index.ts');

async function runWave(
	args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(['bun', 'run', cliEntry, ...args], {
		cwd: rootDir,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { exitCode, stdout, stderr };
}

async function directoryExists(dir: string): Promise<boolean> {
	try {
		return (await fs.stat(dir)).isDirectory();
	} catch {
		return false;
	}
}

async function waitForManualServer(port: number): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/`);
			if (response.ok) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Manual server did not start on port ${port}`);
}

async function getFreePort(start = 4677): Promise<number> {
	for (let port = start; port < start + 50; port++) {
		try {
			const server = Bun.serve({
				hostname: '127.0.0.1',
				port,
				fetch: () => new Response('ok'),
			});
			server.stop(true);
			return port;
		} catch {}
	}
	throw new Error(`No free test port found from ${start}`);
}

describe('wave manual', () => {
	test('top-level help includes manual command', async () => {
		const { exitCode, stdout } = await runWave(['--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('manual         Open the local Wave manual');
	});

	test('manual help is actionable', async () => {
		const { exitCode, stdout } = await runWave(['manual', '--help']);

		expect(exitCode).toBe(0);
		expect(stdout).toContain('Wave Manual');
		expect(stdout).toContain('wave manual [options]');
		expect(stdout).toContain('--port <port>');
		expect(stdout).toContain('--host <host>');
		expect(stdout).toContain('--no-open');
	});

	test('missing build output returns readable error', async () => {
		const manualApp = path.join(rootDir, 'dist/manual-app');
		const backup = path.join(rootDir, 'dist/manual-app-test-backup');
		await fs.rm(backup, { recursive: true, force: true });
		try {
			if (await directoryExists(manualApp)) {
				await fs.rename(manualApp, backup);
			}

			const { exitCode, stderr } = await runWave([
				'manual',
				'--no-open',
				'--port',
				'4567',
			]);

			expect(exitCode).toBe(1);
			expect(stderr).toContain('Manual app is not built');
		} finally {
			if (await directoryExists(backup)) {
				await fs.rename(backup, manualApp);
			}
		}
	});

	test('manual server returns app shell and data', async () => {
		const build = Bun.spawn(['pnpm', 'manual:build'], {
			cwd: rootDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(await build.exited).toBe(0);

		const appDir = path.join(rootDir, 'dist/manual-app');
		const port = await getFreePort();
		const server = startManualServer({
			appDir,
			host: '127.0.0.1',
			port,
		});

		try {
			await waitForManualServer(port);
			const home = await fetch(`http://127.0.0.1:${port}/`);
			const page = await fetch(`http://127.0.0.1:${port}/design-token`);
			const data = await fetch(`http://127.0.0.1:${port}/manual-data.json`);
			const missing = await fetch(`http://127.0.0.1:${port}/assets/missing.js`);
			const traversal = await fetch(
				`http://127.0.0.1:${port}/%2e%2e/package.json`,
			);

			expect(home.status).toBe(200);
			expect(home.headers.get('content-type')).toContain('text/html');
			expect(await home.text()).toContain('<div id="root"></div>');
			expect(page.status).toBe(200);
			expect(await page.text()).toContain('<div id="root"></div>');
			expect(data.status).toBe(200);
			expect(data.headers.get('content-type')).toContain('application/json');
			expect(JSON.stringify(await data.json())).toContain('Design Token');
			expect(missing.status).toBe(404);
			expect(await traversal.text()).not.toContain('"name": "wave"');
		} finally {
			server.stop(true);
		}
	});
});
