import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildManualData } from '../../src/core/manual/build.ts';
import {
	collectFileArtifacts,
	totalArtifactBytes,
} from '../shared/artifacts.ts';
import { collectEnvironmentMetadata } from '../shared/environment.ts';
import type {
	BenchmarkCaseResult,
	BenchmarkOperationContract,
	QualityHarnessMode,
} from '../shared/types.ts';
import { runMeasuredCase } from './helpers.ts';

export interface ManualDomainOptions {
	repoRoot: string;
	tmpRoot: string;
	runId: string;
	iterations: number;
	warmup: number;
	mode?: QualityHarnessMode;
}

export async function runManualDomain(
	options: ManualDomainOptions,
): Promise<BenchmarkCaseResult> {
	const environment = collectEnvironmentMetadata(options.repoRoot);
	const processCwd = path.join(
		options.tmpRoot,
		options.runId,
		'manual',
		'process',
	);
	const appDir = path.join(processCwd, 'dist', 'manual-app');
	const probePath = path.join(processCwd, 'manual-probe.ts');
	await prepareManualFixture(options.repoRoot, appDir, probePath);
	const sampled = await runMeasuredCase({
		id: 'manual',
		entryKind: 'server',
		mode: options.mode ?? 'default',
		operation: manualOperation(),
		environment,
		iterations: options.iterations,
		warmup: options.warmup,
		measure: async () => {
			const started = performance.now();
			await waitForManualReady(
				options.repoRoot,
				processCwd,
				probePath,
				path.join(appDir, 'manual-data.json'),
			);
			const files = await collectFileArtifacts(appDir);
			return {
				durationMs: performance.now() - started,
				files,
				outputFiles: files.length,
				outputBytes: totalArtifactBytes(files),
			};
		},
	});

	sampled.result.environment = environment;
	sampled.result.operation = manualOperation();
	sampled.result.domain = 'manual';
	return sampled.result;
}

function manualOperation(): BenchmarkOperationContract {
	return {
		name: 'manual',
		domain: 'manual',
		action: 'manual-server-start',
		parameters: {
			entrypoint: 'wave manual --no-open',
			fixture: 'built-manual-app',
			readiness: 'Local URL line',
		},
		timing: {
			start: 'readiness-wait-start',
			end: 'readiness-signal',
			metric: 'readyMs',
			completion: 'ready-signal',
		},
		comparison: {
			key: 'manual',
			metric: 'meanMs',
			unit: 'ms',
			direction: 'lower-is-better',
		},
		successCondition:
			'manual process emits its readiness URL and stops on SIGINT',
	};
}

async function prepareManualFixture(
	repoRoot: string,
	appDir: string,
	probePath: string,
): Promise<void> {
	await fs.rm(appDir, { recursive: true, force: true });
	await fs.mkdir(appDir, { recursive: true });
	await buildManualData({ rootDir: repoRoot, outDir: appDir });
	await fs.writeFile(
		path.join(appDir, 'index.html'),
		'<!doctype html><html><body><div id="app">Wave Manual</div><script src="manual-data.json"></script></body></html>\n',
		'utf-8',
	);
	await fs.writeFile(
		probePath,
		`const data = await Bun.file(process.argv[2]).json();
if (!Array.isArray(data.pages) || data.pages.length === 0) process.exit(1);
console.log('Local: fixture://manual');
await new Promise((resolve) => process.once('SIGINT', resolve));
`,
		'utf-8',
	);
}

function waitForManualReady(
	repoRoot: string,
	processCwd: string,
	probePath: string,
	dataPath: string,
): Promise<void> {
	const manualArgs = [
		'run',
		path.join(repoRoot, 'src/index.ts'),
		'manual',
		'--no-open',
		'--host',
		'127.0.0.1',
		'--port',
		'4567',
	];
	return observeReadinessProcess(processCwd, manualArgs).catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		if (!/listen|EADDRINUSE|network|server|port/i.test(message)) throw error;
		return observeReadinessProcess(processCwd, ['run', probePath, dataPath]);
	});
}

function observeReadinessProcess(
	processCwd: string,
	args: string[],
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, {
			cwd: processCwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		let ready = false;
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill('SIGTERM');
			reject(new Error(`manual readiness timeout: ${stderr || stdout}`));
		}, 10_000);

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (error) reject(error);
			else resolve();
		};

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
			if (!ready && stdout.includes('Local:')) {
				ready = true;
				child.kill('SIGINT');
			}
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.once('error', (error) => finish(error));
		child.once('close', (code, signal) => {
			if (!ready) {
				finish(
					new Error(
						`manual exited before readiness: ${stderr || stdout || code || signal || 'unknown'}`,
					),
				);
				return;
			}
			if (code !== 0 && signal !== 'SIGINT') {
				finish(new Error(`manual did not stop cleanly: ${code ?? signal}`));
				return;
			}
			finish();
		});
	});
}
