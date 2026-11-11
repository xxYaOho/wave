import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { collectEnvironmentMetadata } from '../shared/environment.ts';
import { calculateStats } from '../shared/stats.ts';
import type {
	BenchmarkCaseResult,
	BenchmarkMeasurement,
	BenchmarkOperationContract,
	QualityHarnessMode,
} from '../shared/types.ts';

export interface ColdStartOptions {
	repoRoot: string;
	tmpRoot: string;
	runId: string;
	iterations: number;
	warmup: number;
	mode?: QualityHarnessMode;
}

interface ProcessSample {
	durationMs: number;
	stdout: string;
	stderr: string;
	exitCode: number;
}

export async function runColdStartDomain(
	options: ColdStartOptions,
): Promise<BenchmarkCaseResult> {
	const environment = collectEnvironmentMetadata(options.repoRoot);
	const operation = coldStartOperation();
	const artifactPath = path.join(
		options.tmpRoot,
		options.runId,
		'cold-start',
		'wave.js',
	);
	const sourceEntry = path.join(options.repoRoot, 'src/index.ts');
	try {
		await fs.mkdir(path.dirname(artifactPath), { recursive: true });
		await compileCli(sourceEntry, artifactPath, options.repoRoot);
		for (let i = 0; i < options.warmup; i++) {
			await runDevelopmentEntry(options.repoRoot);
			await runCompiledEntry(artifactPath, options.tmpRoot);
		}

		const development: number[] = [];
		const compiled: number[] = [];
		for (let i = 0; i < options.iterations; i++) {
			const dev = await runDevelopmentEntry(options.repoRoot);
			const built = await runCompiledEntry(artifactPath, options.tmpRoot);
			assertProcessSuccess(dev, 'development entry');
			assertProcessSuccess(built, 'compiled artifact');
			development.push(dev.durationMs);
			compiled.push(built.durationMs);
		}

		const measurements = [
			measurement('development-entry', development),
			measurement('compiled-artifact', compiled),
		];
		const stats = calculateStats([...development, ...compiled]);
		return {
			id: 'cold-start',
			caseVersion: 1,
			mode: options.mode ?? 'default',
			entryKind: 'process',
			domain: 'cold-start',
			operation,
			environment,
			status: 'success',
			iterations: options.iterations,
			warmup: options.warmup,
			tokensCount: 0,
			outputFiles: 0,
			outputBytes: 0,
			outputFileNames: [],
			files: [],
			resources: [],
			phases: {
				prepareMs: 0,
				loadMs: 0,
				resourceMs: 0,
				groupPassMs: 0,
				processMs: 0,
				generateMs: 0,
				pipelineDurationMs: stats?.meanMs ?? 0,
				totalWallMs: stats?.meanMs ?? 0,
			},
			stats,
			measurements,
		};
	} catch (error) {
		return failureResult(
			{
				id: 'cold-start',
				caseVersion: 1,
				mode: options.mode ?? 'default',
				entryKind: 'process',
				domain: 'cold-start',
				operation,
				environment,
				status: 'failure',
				iterations: options.iterations,
				warmup: options.warmup,
				tokensCount: 0,
				outputFiles: 0,
				outputBytes: 0,
				outputFileNames: [],
				files: [],
				resources: [],
				phases: emptyPhases(),
			},
			error,
		);
	}
}

function coldStartOperation(): BenchmarkOperationContract {
	return {
		name: 'cold-start',
		domain: 'cold-start',
		action: 'cli-version-process-start',
		parameters: {
			entrypoints: ['development-entry', 'compiled-artifact'],
			command: '--version',
		},
		timing: {
			start: 'process-spawn',
			end: 'process-exit',
			metric: 'durationMs',
			completion: 'exit-zero',
		},
		comparison: {
			key: 'cold-start',
			metric: 'meanMs',
			unit: 'ms',
			direction: 'lower-is-better',
		},
		successCondition:
			'both fresh CLI processes exit zero and print the version',
	};
}

async function compileCli(
	sourceEntry: string,
	artifactPath: string,
	cwd: string,
): Promise<void> {
	const packageJson = await Bun.file(path.join(cwd, 'package.json')).json();
	const version = String(packageJson.version ?? '').trim();
	if (!version) throw new Error('package.json version is missing');
	const proc = Bun.spawn(
		[
			process.execPath,
			'build',
			sourceEntry,
			'--target',
			'bun',
			'--define',
			`process.env.WAVE_VERSION=${JSON.stringify(version)}`,
			'--outfile',
			artifactPath,
		],
		{ cwd, stdout: 'pipe', stderr: 'pipe' },
	);
	const [stderr, exitCode] = await Promise.all([
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`failed to build cold-start artifact: ${stderr.trim()}`);
	}
}

function runDevelopmentEntry(cwd: string): Promise<ProcessSample> {
	return runProcess(
		process.execPath,
		['run', 'src/index.ts', '--version'],
		cwd,
	);
}

function runCompiledEntry(
	artifactPath: string,
	cwd: string,
): Promise<ProcessSample> {
	return runProcess(process.execPath, ['run', artifactPath, '--version'], cwd);
}

function runProcess(
	command: string,
	args: string[],
	cwd: string,
): Promise<ProcessSample> {
	return new Promise((resolve, reject) => {
		const started = performance.now();
		const child = spawn(command, args, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.once('error', reject);
		child.once('close', (exitCode) => {
			resolve({
				durationMs: performance.now() - started,
				stdout,
				stderr,
				exitCode: exitCode ?? 1,
			});
		});
	});
}

function assertProcessSuccess(sample: ProcessSample, label: string): void {
	if (sample.exitCode !== 0 || !sample.stdout.trim()) {
		throw new Error(
			`${label} failed: exit=${sample.exitCode} ${sample.stderr.trim()}`,
		);
	}
}

function measurement(id: string, samplesMs: number[]): BenchmarkMeasurement {
	const stats = calculateStats(samplesMs);
	return {
		id,
		status: stats ? 'success' : 'failure',
		samplesMs,
		stats,
	};
}

function emptyPhases() {
	return {
		prepareMs: 0,
		loadMs: 0,
		resourceMs: 0,
		groupPassMs: 0,
		processMs: 0,
		generateMs: 0,
		pipelineDurationMs: 0,
		totalWallMs: 0,
	};
}

function failureResult(
	result: BenchmarkCaseResult,
	error: unknown,
): BenchmarkCaseResult {
	result.status = 'failure';
	result.error = error instanceof Error ? error.message : String(error);
	return result;
}
