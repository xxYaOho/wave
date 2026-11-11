import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runCompress } from '../../src/core/compress/index.ts';
import type {
	CommandRunner,
	ToolResolution,
	ToolResolver,
} from '../../src/core/tools/index.ts';
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

export interface CompressDomainOptions {
	repoRoot: string;
	tmpRoot: string;
	runId: string;
	iterations: number;
	warmup: number;
	mode?: QualityHarnessMode;
}

const PNG_FIXTURE = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
	'base64',
);

export async function runCompressDomain(
	options: CompressDomainOptions,
): Promise<BenchmarkCaseResult> {
	const environment = collectEnvironmentMetadata(options.repoRoot);
	const inputDir = path.join(
		options.tmpRoot,
		options.runId,
		'compress',
		'input',
	);
	await prepareCompressFixture(inputDir);
	const resolver = new FixtureToolResolver();
	const runner = new FixtureCommandRunner();
	let sequence = 0;
	const sampled = await runMeasuredCase({
		id: 'compress',
		entryKind: 'fixture',
		mode: options.mode ?? 'default',
		operation: compressOperation(),
		environment,
		iterations: options.iterations,
		warmup: options.warmup,
		measure: async () => {
			const iteration = String(sequence++);
			const outputDir = path.join(
				options.tmpRoot,
				options.runId,
				'compress',
				'output',
				iteration,
			);
			const started = performance.now();
			const result = await runCompress({
				input: inputDir,
				outDir: outputDir,
				recursive: true,
				types: ['png', 'svg'],
				yes: true,
				force: true,
				icon: true,
				resolver,
				runner,
				cwd: options.repoRoot,
			});
			if (result.issues.some((issue) => issue.severity === 'error')) {
				throw new Error(result.issues.map((issue) => issue.message).join('; '));
			}
			const files = await collectFileArtifacts(outputDir);
			return {
				durationMs: performance.now() - started,
				files,
				outputFiles: files.length,
				outputBytes: totalArtifactBytes(files),
			};
		},
	});

	sampled.result.environment = environment;
	sampled.result.operation = compressOperation();
	sampled.result.domain = 'compress';
	return sampled.result;
}

function compressOperation(): BenchmarkOperationContract {
	return {
		name: 'compress',
		domain: 'compress',
		action: 'compress-fixed-assets',
		parameters: {
			fixture: 'png-and-svg',
			recursive: true,
			mode: 'safe',
			tooling: 'hermetic-fixture-runner',
		},
		timing: {
			start: 'operation-start',
			end: 'operation-complete',
			metric: 'durationMs',
			completion: 'result-returned',
		},
		comparison: {
			key: 'compress',
			metric: 'meanMs',
			unit: 'ms',
			direction: 'lower-is-better',
		},
		successCondition:
			'all fixed PNG and SVG inputs are copied to compressed output',
	};
}

async function prepareCompressFixture(inputDir: string): Promise<void> {
	await fs.rm(inputDir, { recursive: true, force: true });
	await fs.mkdir(inputDir, { recursive: true });
	await fs.writeFile(path.join(inputDir, 'sample.png'), PNG_FIXTURE);
	await fs.writeFile(
		path.join(inputDir, 'sample.svg'),
		'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#336699"/></svg>\n',
		'utf-8',
	);
}

class FixtureToolResolver implements ToolResolver {
	async resolveCapability(
		requirement: Parameters<ToolResolver['resolveCapability']>[0],
	): Promise<ToolResolution> {
		const name = requirement.capability === 'compress-svg' ? 'svgo' : 'oxipng';
		const candidate = {
			name,
			command: name,
			available: true,
			version: 'fixture-1',
		};
		return {
			requirement,
			selected: candidate,
			candidates: [candidate],
		};
	}
}

class FixtureCommandRunner implements CommandRunner {
	async run(command: Parameters<CommandRunner['run']>[0]) {
		const outputFlag = command.command === 'svgo' ? '--output' : '--out';
		const inputFlag = command.command === 'svgo' ? '--input' : undefined;
		const outputIndex = command.args?.indexOf(outputFlag) ?? -1;
		const output =
			outputIndex >= 0 ? command.args?.[outputIndex + 1] : undefined;
		const inputIndex = inputFlag
			? (command.args?.indexOf(inputFlag) ?? -1)
			: -1;
		const input =
			inputIndex >= 0 ? command.args?.[inputIndex + 1] : command.args?.at(-1);
		if (!output || !input) {
			return {
				exitCode: 1,
				stdout: '',
				stderr: 'fixture command arguments missing',
			};
		}
		await fs.mkdir(path.dirname(output), { recursive: true });
		await fs.copyFile(input, output);
		return { exitCode: 0, stdout: '', stderr: '' };
	}
}
