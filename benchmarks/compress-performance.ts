import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	type CompressOptions,
	type CompressResult,
	runCompress,
} from '../src/core/compress/index.ts';
import { BunCommandRunner } from '../src/core/tools/command-runner.ts';
import { collectFileArtifacts } from './shared/artifacts.ts';
import { collectEnvironmentMetadata } from './shared/environment.ts';
import { calculateStats } from './shared/stats.ts';

// A consumer of the existing compress domain. Its operation contract and runner
// stay untouched; each pair uses the same source, fixture and dependency tree.
type Scenario = 'q0-fixture' | 'real-encoders';
type Variant = 'serial' | 'parallel';
interface WorkerConfig {
	scenario: Scenario;
	variant: Variant;
	root: string;
	baseline: string;
	baselineDomain: string;
}
interface WorkerResult {
	durationMs: number;
	artifacts: Array<{ relativePath: string; bytes: number; sha256: string }>;
	maxInFlight?: number;
	maxCommandMs?: number;
}
interface ResourcePoint {
	elapsedMs: number;
	rssKiB: number;
	cpuPercent: number;
	processes: number;
}
interface Sample extends WorkerResult {
	outcome: 'success' | 'failure';
	error?: string;
	peakRssKiB: number;
	peakCpuPercent: number;
	peakProcesses: number;
	resourceSamples: number;
}

const repoRoot = path.resolve(import.meta.dir, '..');
const scriptFile = fileURLToPath(import.meta.url);

async function rewriteSnapshot(
	ref: string,
	sourcePath: string,
	destination: string,
	overrides: Record<string, string> = {},
) {
	const proc = Bun.spawn(['git', 'show', `${ref}:${sourcePath}`], {
		cwd: repoRoot,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [source, error, exit] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exit !== 0) throw new Error(error);
	const rewritten = source.replace(
		/(['"])(\.\.?\/[^'"]+)\1/g,
		(_match, quote: string, relative: string) => {
			const target =
				overrides[relative] ??
				path.resolve(repoRoot, path.dirname(sourcePath), relative);
			return `${quote}${target}${quote}`;
		},
	);
	await fs.writeFile(destination, rewritten);
}

async function worker(config: WorkerConfig): Promise<WorkerResult> {
	if (config.scenario === 'q0-fixture') {
		const source =
			config.variant === 'serial'
				? config.baselineDomain
				: path.join(repoRoot, 'benchmarks/domains/compress.ts');
		const { runCompressDomain } = await import(pathToFileURL(source).href);
		const result = await runCompressDomain({
			repoRoot,
			tmpRoot: config.root,
			runId: 'sample',
			// Repeat the unchanged domain operation long enough for ps to observe
			// steady parent RSS; a single ~3ms copy is shorter than a sample.
			iterations: 32,
			warmup: 0,
		});
		if (result.status !== 'success') throw new Error(result.error);
		return {
			durationMs: result.stats.meanMs,
			artifacts: result.files.map(
				({
					relativePath,
					bytes,
					sha256,
				}: {
					relativePath: string;
					bytes: number;
					sha256: string;
				}) => ({ relativePath, bytes, sha256 }),
			),
		};
	}
	const input = path.join(config.root, 'input');
	const outDir = path.join(config.root, 'output');
	await fs.mkdir(input, { recursive: true });
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
		'base64',
	);
	// Fixed, generated material: no user assets or network acquisition. Eight of
	// each format make encoder startup and overlap measurable on this host.
	for (let n = 0; n < 8; n++) {
		await fs.writeFile(path.join(input, `${n}.png`), png);
		await fs.writeFile(
			path.join(input, `${n}.svg`),
			`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${Array.from({ length: 80 }, (_, i) => `<rect x="${i % 8}" y="${i % 8}" width="2" height="2" fill="#336699"/>`).join('')}</svg>\n`,
		);
	}
	const compress: (options: CompressOptions) => Promise<CompressResult> =
		config.variant === 'serial'
			? (await import(pathToFileURL(config.baseline).href)).runCompress
			: runCompress;
	let active = 0,
		maxInFlight = 0,
		maxCommandMs = 0;
	const delegate =
		config.variant === 'serial'
			? new BunCommandRunner()
			: new BunCommandRunner({ timeoutMs: 120_000 });
	const runner = {
		async run(command: Parameters<BunCommandRunner['run']>[0]) {
			const encoding = !(command.args ?? []).some((arg) =>
				['--version', '-version'].includes(arg),
			);
			const started = performance.now();
			if (encoding) maxInFlight = Math.max(maxInFlight, ++active);
			try {
				return await delegate.run(command);
			} finally {
				if (encoding) {
					active--;
					maxCommandMs = Math.max(maxCommandMs, performance.now() - started);
				}
			}
		},
	};
	const resolver = {
		async resolveCapability(
			requirement: Parameters<
				NonNullable<CompressOptions['resolver']>['resolveCapability']
			>[0],
		) {
			const name =
				requirement.capability === 'compress-svg' ? 'svgo' : 'oxipng';
			const selected = { name, command: name, available: true };
			return { requirement, selected, candidates: [selected] };
		},
	};
	const started = performance.now();
	const result = await compress({
		input,
		outDir,
		recursive: true,
		yes: true,
		force: true,
		icon: true,
		runner,
		resolver,
	});
	const durationMs = performance.now() - started;
	if (result.issues.some((issue) => issue.severity === 'error'))
		throw new Error(result.issues.map((issue) => issue.message).join('; '));
	const artifacts = (await collectFileArtifacts(outDir)).map(
		({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 }),
	);
	return { durationMs, artifacts, maxInFlight, maxCommandMs };
}

async function processTree(
	rootPid: number,
): Promise<Omit<ResourcePoint, 'elapsedMs'>> {
	const proc = Bun.spawn(['/bin/ps', '-axo', 'pid=,ppid=,rss=,%cpu='], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const text = await new Response(proc.stdout).text();
	await new Response(proc.stderr).text();
	if ((await proc.exited) !== 0) throw new Error('ps resource sampler failed');
	const rows = text
		.trim()
		.split('\n')
		.map((line) => line.trim().split(/\s+/).map(Number));
	const included = new Set([rootPid]);
	for (let changed = true; changed; ) {
		changed = false;
		for (const [pid, ppid] of rows)
			if (
				pid !== undefined &&
				ppid !== undefined &&
				included.has(ppid) &&
				!included.has(pid)
			) {
				included.add(pid);
				changed = true;
			}
	}
	let rssKiB = 0,
		cpuPercent = 0,
		processes = 0;
	for (const [pid, _ppid, rss, cpu] of rows)
		if (pid !== undefined && included.has(pid)) {
			rssKiB += rss ?? 0;
			cpuPercent += cpu ?? 0;
			processes++;
		}
	return { rssKiB, cpuPercent, processes };
}

async function sample(config: WorkerConfig): Promise<Sample> {
	await fs.mkdir(config.root, { recursive: true });
	const configPath = path.join(config.root, 'worker.json');
	await fs.writeFile(configPath, JSON.stringify(config));
	const proc = Bun.spawn(
		[process.execPath, scriptFile, '--worker', configPath],
		{ cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
	);
	const stdout = new Response(proc.stdout).text();
	const stderr = new Response(proc.stderr).text();
	const points: ResourcePoint[] = [];
	const started = performance.now();
	let stopped = false;
	const observe = (async () => {
		while (!stopped) {
			points.push({
				elapsedMs: performance.now() - started,
				...(await processTree(proc.pid)),
			});
			if (!stopped) await Bun.sleep(15);
		}
	})();
	try {
		const [output, error, exit] = await Promise.all([
			stdout,
			stderr,
			proc.exited,
		]);
		stopped = true;
		await observe;
		const result: WorkerResult =
			exit === 0
				? JSON.parse(output)
				: {
						durationMs: performance.now() - started,
						artifacts: [],
					};
		return {
			...result,
			outcome: exit === 0 ? 'success' : 'failure',
			...(exit === 0 ? {} : { error: error || `worker exited ${exit}` }),
			peakRssKiB: Math.max(0, ...points.map((p) => p.rssKiB)),
			peakCpuPercent: Math.max(0, ...points.map((p) => p.cpuPercent)),
			peakProcesses: Math.max(0, ...points.map((p) => p.processes)),
			resourceSamples: points.length,
		};
	} finally {
		stopped = true;
		await observe;
		await fs.writeFile(
			path.join(config.root, 'resource-trace.json'),
			JSON.stringify(points, null, 2),
		);
		if (proc.exitCode === null) {
			proc.kill('SIGTERM');
			await proc.exited;
		}
	}
}

function quantile(values: number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = (sorted.length - 1) * fraction;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function bootstrapRatios(ratios: number[]) {
	let seed = 17;
	const medians: number[] = [];
	for (let n = 0; n < 2000; n++) {
		const draw: number[] = [];
		for (let i = 0; i < ratios.length; i++) {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			draw.push(ratios[Math.floor((seed / 0x1_0000_0000) * ratios.length)]!);
		}
		medians.push(quantile(draw, 0.5));
	}
	return {
		lower95: quantile(medians, 0.025),
		upper95: quantile(medians, 0.975),
	};
}

async function main() {
	const args = process.argv.slice(2);
	const option = (name: string, fallback: string) =>
		args[args.indexOf(name) + 1] && args.includes(name)
			? args[args.indexOf(name) + 1]!
			: fallback;
	const ref = option('--baseline-ref', '2e4248a');
	const iterations = Number(option('--iterations', '16'));
	const warmup = Number(option('--warmup', '2'));
	if (
		!Number.isInteger(iterations) ||
		iterations < 4 ||
		!Number.isInteger(warmup) ||
		warmup < 0
	)
		throw new Error('Require at least 4 measured pairs and nonnegative warmup');
	const root = path.resolve(option('--work-dir', '.tmp/p2/m2-performance'));
	const reportPath = path.resolve(
		option('--output', '.tmp/p2/m2-evidence/performance.json'),
	);
	await fs.mkdir(root, { recursive: true });
	await fs.mkdir(path.dirname(reportPath), { recursive: true });
	const baseline = path.join(root, 'serial.ts');
	const baselineDomain = path.join(root, 'serial-domain.ts');
	await rewriteSnapshot(ref, 'src/core/compress/index.ts', baseline);
	await rewriteSnapshot(ref, 'benchmarks/domains/compress.ts', baselineDomain, {
		'../../src/core/compress/index.ts': baseline,
	});
	const boundaries = {
		minMedianSpeedupLower95: 1.05,
		maxP95DurationRatio: 1.1,
		maxP95TreeRssRatio: 2,
		maxAbsoluteTreeRssMiB: 512,
		maxObservedTreeCpuPercent: 350,
	};
	const report = {
		baselineRef: ref,
		environment: collectEnvironmentMetadata(repoRoot),
		iterations,
		warmup,
		caseConfiguration: {
			q0Fixture:
				'unchanged Q0 domain, 32 internal iterations per isolated worker; duration is its per-operation mean',
			realEncoders:
				'8 fixed PNG plus 8 fixed SVG; same oxipng/SVGO versions, configuration and output policy for both variants',
		},
		resourceScope:
			'worker parent plus all visible descendants, including encoder grandchildren; sampler and ps excluded',
		sampling:
			'ps RSS KiB and lifetime-average %CPU summed across tree; sampled maxima, 15ms wait plus ps duration; short-lived peaks may be missed; same scope and cadence for both variants',
		boundaries,
		toolVersions: {} as Record<string, string>,
		scenarios: [] as unknown[],
	};
	for (const name of ['oxipng', 'svgo']) {
		const proc = Bun.spawn([name, '--version'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [out, err, exit] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (exit !== 0) throw new Error(`${name} unavailable: ${err}`);
		report.toolVersions[name] = out.trim();
	}
	for (const scenario of ['q0-fixture', 'real-encoders'] as const) {
		const serial: Sample[] = [],
			parallel: Sample[] = [];
		for (let iteration = -warmup; iteration < iterations; iteration++) {
			const order: Variant[] =
				Math.abs(iteration) % 2 === 0
					? ['serial', 'parallel']
					: ['parallel', 'serial'];
			const pair = {} as Record<Variant, Sample>;
			for (const variant of order) {
				pair[variant] = await sample({
					scenario,
					variant,
					root: path.join(root, scenario, `${iteration}`, variant),
					baseline,
					baselineDomain,
				});
			}
			if (
				pair.serial.outcome === 'success' &&
				pair.parallel.outcome === 'success' &&
				JSON.stringify(pair.serial.artifacts) !==
					JSON.stringify(pair.parallel.artifacts)
			)
				throw new Error(
					`Artifact equivalence failed: ${scenario}/${iteration}`,
				);
			if (iteration >= 0) {
				serial.push(pair.serial);
				parallel.push(pair.parallel);
			}
		}
		const ratios = serial.map(
			(sample, i) => sample.durationMs / parallel[i]!.durationMs,
		);
		const confidence = bootstrapRatios(ratios);
		const p95Ratio =
			quantile(
				parallel.map((s) => s.durationMs),
				0.95,
			) /
			quantile(
				serial.map((s) => s.durationMs),
				0.95,
			);
		const rssRatio =
			quantile(
				parallel.map((s) => s.peakRssKiB),
				0.95,
			) /
			quantile(
				serial.map((s) => s.peakRssKiB),
				0.95,
			);
		const resourceAccepted =
			rssRatio <= boundaries.maxP95TreeRssRatio &&
			Math.max(...parallel.map((s) => s.peakRssKiB)) / 1024 <=
				boundaries.maxAbsoluteTreeRssMiB &&
			Math.max(...parallel.map((s) => s.peakCpuPercent)) <=
				boundaries.maxObservedTreeCpuPercent;
		const failedSamples = {
			serial: serial.filter((sample) => sample.outcome === 'failure').length,
			parallel: parallel.filter((sample) => sample.outcome === 'failure')
				.length,
		};
		if (failedSamples.serial || failedSamples.parallel) process.exitCode = 1;
		const retained =
			failedSamples.serial === 0 &&
			failedSamples.parallel === 0 &&
			confidence.lower95 > boundaries.minMedianSpeedupLower95 &&
			p95Ratio <= boundaries.maxP95DurationRatio &&
			resourceAccepted;
		report.scenarios.push({
			scenario,
			failedSamples,
			serialStats: calculateStats(serial.map((s) => s.durationMs)),
			parallelStats: calculateStats(parallel.map((s) => s.durationMs)),
			pairedSpeedups: ratios,
			medianSpeedup: quantile(ratios, 0.5),
			medianSpeedupCI95: confidence,
			p95DurationRatio: p95Ratio,
			p95TreeRssRatio: rssRatio,
			resourceAccepted,
			concurrencyBenefitAccepted: retained,
			maxInFlightSerial:
				scenario === 'q0-fixture'
					? null
					: Math.max(0, ...serial.map((s) => s.maxInFlight ?? 0)),
			maxInFlightParallel:
				scenario === 'q0-fixture'
					? null
					: Math.max(0, ...parallel.map((s) => s.maxInFlight ?? 0)),
			maxObservedCommandMs: Math.max(
				0,
				...parallel.map((s) => s.maxCommandMs ?? 0),
			),
			serial,
			parallel,
		});
		console.log(
			`${scenario}: median speedup=${quantile(ratios, 0.5).toFixed(3)}x, lower95=${confidence.lower95.toFixed(3)}, RSS p95 ratio=${rssRatio.toFixed(3)}, resources=${resourceAccepted}, retain=${retained}`,
		);
	}
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Report: ${reportPath}`);
}

if (process.argv[2] === '--worker') {
	const config: WorkerConfig = JSON.parse(
		await fs.readFile(process.argv[3]!, 'utf8'),
	);
	console.log(JSON.stringify(await worker(config)));
} else if (import.meta.main) {
	await main();
}
