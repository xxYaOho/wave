import { spawn } from 'node:child_process';
import * as path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const port = Number(process.env.WAVE_MANUAL_SMOKE_PORT ?? 4173);
const baseUrl = `http://127.0.0.1:${port}`;

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
	return response.json();
}

async function waitForReadiness(): Promise<void> {
	const deadline = Date.now() + 30_000;
	let lastError = 'server did not respond';
	while (Date.now() < deadline) {
		try {
			const home = await fetch(`${baseUrl}/`);
			if (!home.ok) throw new Error(`home returned HTTP ${home.status}`);
			const metadata = (await fetchJson(`${baseUrl}/manual-metadata.json`)) as {
				routes?: unknown[];
			};
			const index = await fetchJson(`${baseUrl}/search-index.json`);
			const legacy = await fetchJson(`${baseUrl}/manual-data.json`);
			const chunk = await fetchJson(`${baseUrl}/pages/en/quickstart.json`);
			if (!Array.isArray(metadata.routes))
				throw new Error('invalid metadata routes');
			if (!Array.isArray(index)) throw new Error('invalid search index');
			if (!legacy || typeof legacy !== 'object')
				throw new Error('invalid legacy data');
			if (!chunk || typeof chunk !== 'object')
				throw new Error('invalid route chunk');
			return;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			await wait(100);
		}
	}
	throw new Error(`manual:dev readiness timed out: ${lastError}`);
}

const child = spawn(
	'pnpm',
	[
		'exec',
		'vite',
		'--host',
		'127.0.0.1',
		'--port',
		String(port),
		'src/manual-app',
	],
	{
		cwd: rootDir,
		env: process.env,
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	},
);

let stdout = '';
let stderr = '';
child.stdout?.on('data', (chunk: Buffer) => {
	stdout += chunk.toString();
});
child.stderr?.on('data', (chunk: Buffer) => {
	stderr += chunk.toString();
});

try {
	await waitForReadiness();
	console.log(
		JSON.stringify({
			ok: true,
			port,
			endpoints: [
				'/',
				'/manual-metadata.json',
				'/search-index.json',
				'/manual-data.json',
				'/pages/en/quickstart.json',
			],
		}),
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	if (stdout) console.error(stdout);
	if (stderr) console.error(stderr);
	process.exitCode = 1;
} finally {
	if (child.exitCode === null && child.pid) {
		try {
			process.kill(-child.pid, 'SIGINT');
		} catch {
			child.kill('SIGINT');
		}
	}
	await new Promise<void>((resolve) => {
		if (child.exitCode !== null) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			resolve();
		}, 5000);
		child.once('close', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}
