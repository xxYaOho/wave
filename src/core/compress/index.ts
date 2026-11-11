import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { CommandTerminationError } from '../tools/command-runner.ts';
import type {
	CommandRunner,
	ToolCapability,
	ToolResolution,
	ToolResolver,
} from '../tools/index.ts';
import { BunCommandRunner, DefaultToolResolver } from '../tools/index.ts';

export type CompressMode = 'safe' | 'quality';

export type CompressFileType = 'png' | 'jpg' | 'svg' | 'gif';

export interface CompressOptions {
	input: string;
	outDir?: string;
	recursive?: boolean;
	types?: CompressFileType[];
	quality?: number;
	dryRun?: boolean;
	yes?: boolean;
	force?: boolean;
	icon?: boolean;
	resolver?: ToolResolver;
	runner?: CommandRunner;
	cwd?: string;
	signal?: AbortSignal;
	commandTimeoutMs?: number;
}

interface CompressItemIdentity {
	source: string;
	output: string;
	relativePath: string;
	type: CompressFileType;
}

export interface CompressCompletedItem extends CompressItemIdentity {
	result: 'success' | 'soft-failed';
	status: 'optimized' | 'cleaned' | 'unchanged';
	beforeBytes: number;
	afterBytes: number;
	savedBytes: number;
	savedPercent: number;
	tool: string;
	written: boolean;
}

export interface CompressFailedItem extends CompressItemIdentity {
	result: 'hard-failed';
	code: string;
	message: string;
}

export type CompressItemResult = CompressCompletedItem | CompressFailedItem;

export interface CompressSummary {
	total: number;
	succeeded: number;
	softFailed: number;
	hardFailed: number;
	writtenCount: number;
	cancelled?: true;
	issues: Array<CompressIssue & { path: string }>;
}

export interface CompressResult {
	mode: CompressMode;
	input: string;
	outDir: string;
	scanned: number;
	matched: number;
	written: boolean;
	items: CompressItemResult[];
	issues: CompressIssue[];
	toolResolutions: ToolResolution[];
	summary: CompressSummary;
	cancelled?: true;
}

export interface CompressInputPreview {
	input: string;
	outDir: string;
	scanned: number;
	matched: number;
}

export interface CompressIssue {
	code: string;
	severity: 'error' | 'warning';
	message: string;
	path?: string;
	fix?: string;
}

interface FileCandidate {
	absolutePath: string;
	relativePath: string;
	type: CompressFileType;
}

// Two encoders can overlap I/O without multiplying CPU threads and memory by
// host core count (encoders such as oxipng already use internal parallelism).
const COMPRESS_CONCURRENCY = 2;
// Per external command, including discovery. Calibrated with the compress
// performance consumer; deliberately absent from default CommandRunner usage.
const COMPRESS_COMMAND_TIMEOUT_MS = 120_000;

function checkCancelled(signal?: AbortSignal): void {
	if (signal?.aborted) throw new CommandTerminationError('cancelled');
}

interface CompressScan {
	input: string;
	outDir: string;
	key: string;
	candidates: FileCandidate[];
}

// Scope reuse to the exact preview object handed back by the caller. Never
// retain a process-wide directory snapshot across independent invocations.
const previewScans = new WeakMap<CompressInputPreview, CompressScan>();

function scanKey(
	options: Pick<CompressOptions, 'recursive' | 'types'>,
): string {
	return JSON.stringify([
		!!options.recursive,
		[...new Set(options.types ?? ['png', 'jpg', 'svg', 'gif'])].sort(),
	]);
}

export async function previewCompressInput(
	options: Pick<
		CompressOptions,
		'input' | 'outDir' | 'recursive' | 'types' | 'cwd'
	>,
): Promise<CompressInputPreview> {
	const cwd = options.cwd ?? process.cwd();
	const input = path.resolve(cwd, options.input);
	const outDir = options.outDir
		? path.resolve(cwd, options.outDir)
		: await defaultCompressOutputDir(input);
	const candidates = await scanCompressCandidates(input, {
		recursive: !!options.recursive,
		types: options.types,
	});

	const preview = {
		input,
		outDir,
		scanned: candidates.length,
		matched: candidates.length,
	};
	previewScans.set(preview, {
		input,
		outDir,
		key: scanKey(options),
		candidates,
	});
	return preview;
}

export async function runCompress(
	options: CompressOptions,
	preview?: CompressInputPreview,
): Promise<CompressResult> {
	const cwd = options.cwd ?? process.cwd();
	const input = path.resolve(cwd, options.input);
	const outDir = options.outDir
		? path.resolve(cwd, options.outDir)
		: await defaultCompressOutputDir(input);
	const mode: CompressMode = options.quality === undefined ? 'safe' : 'quality';
	const managedRunner = new BunCommandRunner({
		signal: options.signal,
		timeoutMs: options.commandTimeoutMs ?? COMPRESS_COMMAND_TIMEOUT_MS,
	});
	const runner = options.runner ?? managedRunner;
	// An injected encoder runner never implicitly becomes the discovery runner.
	const resolver =
		options.resolver ?? new DefaultToolResolver({ runner: managedRunner });
	// 1. Scan, or consume the matching confirmation snapshot.
	const scan = preview ? previewScans.get(preview) : undefined;
	const candidates =
		scan?.input === input &&
		scan.outDir === outDir &&
		scan.key === scanKey(options)
			? scan.candidates
			: await scanCompressCandidates(input, {
					recursive: !!options.recursive,
					types: options.types,
				});
	// 2. Complete all tool and output preflight checks before dispatch.
	const resolutions = await resolveToolsForCandidates(
		candidates,
		mode,
		resolver,
	);
	const issues = options.signal?.aborted
		? []
		: validateToolResolutions(resolutions);
	const shouldWrite = !!options.yes && !options.dryRun;

	if (options.signal?.aborted || issues.length > 0) {
		return {
			mode,
			input,
			outDir,
			scanned: 0,
			matched: 0,
			written: false,
			items: [],
			issues,
			toolResolutions: resolutions,
			summary: summarizeItems([], issues, input, options.signal),
			...(options.signal?.aborted ? { cancelled: true as const } : {}),
		};
	}

	if (shouldWrite && !options.force) {
		const outputIssues = await validateOutputTargets(candidates, outDir);
		if (outputIssues.length > 0) {
			return {
				mode,
				input,
				outDir,
				scanned: candidates.length,
				matched: candidates.length,
				written: false,
				items: [],
				issues: outputIssues,
				toolResolutions: resolutions,
				summary: summarizeItems([], outputIssues, input, options.signal),
				...(options.signal?.aborted ? { cancelled: true as const } : {}),
			};
		}
	}

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
	let items: CompressItemResult[];
	try {
		const hasSvg = candidates.some((candidate) => candidate.type === 'svg');
		const iconSvgoConfigPath =
			options.icon && hasSvg ? await writeIconSvgoConfig(tempDir) : undefined;
		const userSvgoConfigPath =
			!options.icon && hasSvg ? await findUserSvgoConfigPath() : undefined;
		const sources = new Set(
			candidates.map((candidate) => candidate.absolutePath),
		);
		const overlaps = candidates.some((candidate) =>
			sources.has(path.join(outDir, candidate.relativePath)),
		);
		// 3. Bound encoder execution. Overlap preserves the old scan-order reads
		// and writes, including recursive reruns that consume previous outputs.
		items = await mapBounded(
			candidates,
			overlaps ? 1 : COMPRESS_CONCURRENCY,
			(candidate) =>
				processCandidate({
					candidate,
					outDir,
					tempDir,
					resolutions,
					mode,
					options,
					runner,
					shouldWrite,
					svgoConfigPath: iconSvgoConfigPath ?? userSvgoConfigPath,
					useSvgOutput: !!options.icon || !!userSvgoConfigPath,
				}),
			options.signal,
		);
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}

	// Report in scan order, independently of encoder completion order.
	for (const item of items) {
		if (item.result === 'hard-failed') {
			issues.push({
				code: item.code,
				severity: 'error',
				message: item.message,
				path: item.source,
			});
		}
	}
	const summary = summarizeItems(items, issues, input, options.signal);
	return {
		mode,
		input,
		outDir,
		scanned: candidates.length,
		matched: candidates.length,
		written: summary.writtenCount > 0,
		items,
		issues,
		toolResolutions: resolutions,
		summary,
		...(options.signal?.aborted ? { cancelled: true as const } : {}),
	};
}

async function mapBounded<T, R>(
	inputs: T[],
	limit: number,
	process: (input: T) => Promise<R>,
	signal?: AbortSignal,
): Promise<R[]> {
	const results = new Array<R>(inputs.length);
	let next = 0;
	// Each worker holds one permit until its complete encode/classify/commit
	// operation settles; no unbounded queue of running encoder promises.
	await Promise.all(
		Array.from({ length: Math.min(limit, inputs.length) }, async () => {
			while (next < inputs.length && !signal?.aborted) {
				const index = next++;
				results[index] = await process(inputs[index]!);
			}
		}),
	);
	return results.slice(0, next);
}

async function processCandidate(context: {
	candidate: FileCandidate;
	outDir: string;
	tempDir: string;
	resolutions: ToolResolution[];
	mode: CompressMode;
	options: CompressOptions;
	runner: CommandRunner;
	shouldWrite: boolean;
	svgoConfigPath?: string;
	useSvgOutput: boolean;
}): Promise<CompressItemResult> {
	const {
		candidate,
		outDir,
		tempDir,
		resolutions,
		mode,
		options,
		runner,
		shouldWrite,
	} = context;
	const identity: CompressItemIdentity = {
		source: candidate.absolutePath,
		output: path.join(outDir, candidate.relativePath),
		relativePath: candidate.relativePath,
		type: candidate.type,
	};
	let code = 'WCP_COMPRESS_FAILED';
	try {
		checkCancelled(options.signal);
		const tempOutput = path.join(tempDir, candidate.relativePath);
		await fs.mkdir(path.dirname(tempOutput), { recursive: true });
		const resolution = getResolutionForType(resolutions, candidate.type, mode);
		if (!resolution?.selected)
			throw new Error(`No compressor available for ${candidate.type}`);
		checkCancelled(options.signal);
		await compressFile({
			source: candidate.absolutePath,
			output: tempOutput,
			type: candidate.type,
			mode,
			quality: options.quality,
			toolName: resolution.selected.name,
			svgoConfigPath:
				candidate.type === 'svg' ? context.svgoConfigPath : undefined,
			runner,
		});
		checkCancelled(options.signal);
		// 4. Classify using the same byte and SVG policies as the serial path.
		const beforeBytes = (await fs.stat(candidate.absolutePath)).size;
		const previewBytes = (await fs.stat(tempOutput)).size;
		const status =
			previewBytes < beforeBytes
				? 'optimized'
				: candidate.type === 'svg' && context.useSvgOutput
					? 'cleaned'
					: 'unchanged';
		const afterBytes = status === 'unchanged' ? beforeBytes : previewBytes;
		// 5. Commit only after encoding and classification have settled.
		if (shouldWrite) {
			code = 'WCP_WRITE_FAILED';
			await fs.mkdir(path.dirname(identity.output), { recursive: true });
			checkCancelled(options.signal);
			// Once copyFile starts, await it even if SIGINT arrives. No encoder
			// signal is passed into the final copy, and its failure remains real.
			await fs.copyFile(
				status === 'unchanged' ? candidate.absolutePath : tempOutput,
				identity.output,
			);
		}
		return {
			...identity,
			result: 'success',
			status,
			beforeBytes,
			afterBytes,
			savedBytes: beforeBytes - afterBytes,
			savedPercent:
				beforeBytes === 0
					? 0
					: Number(
							(((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1),
						),
			tool: resolution.selected.name,
			written: shouldWrite,
		};
	} catch (error) {
		return {
			...identity,
			result: 'hard-failed',
			code: error instanceof CommandTerminationError ? error.code : code,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

function summarizeItems(
	items: CompressItemResult[],
	issues: CompressIssue[],
	input: string,
	signal?: AbortSignal,
): CompressSummary {
	const summary: CompressSummary = {
		total: items.length,
		...(signal?.aborted ? { cancelled: true as const } : {}),
		succeeded: 0,
		softFailed: 0,
		hardFailed: 0,
		writtenCount: 0,
		// Preflight issues describe the whole input batch; item failures already
		// carry the exact source path. Keep the existing top-level issues intact.
		issues: issues.map((issue) => ({ ...issue, path: issue.path ?? input })),
	};
	for (const item of items) {
		if (item.result === 'hard-failed') {
			summary.hardFailed++;
		} else {
			if (item.result === 'success') summary.succeeded++;
			else summary.softFailed++;
			if (item.written) summary.writtenCount++;
		}
	}
	return summary;
}

async function defaultCompressOutputDir(input: string): Promise<string> {
	const stat = await fs.stat(input);
	const baseDir = stat.isDirectory() ? input : path.dirname(input);
	return path.join(baseDir, 'wave-compress');
}

async function scanCompressCandidates(
	input: string,
	options: { recursive: boolean; types?: CompressFileType[] },
): Promise<FileCandidate[]> {
	const stat = await fs.stat(input);
	const allowed = new Set(options.types ?? ['png', 'jpg', 'svg', 'gif']);
	const baseDir = stat.isDirectory() ? input : path.dirname(input);
	const files: FileCandidate[] = [];

	async function visit(current: string): Promise<void> {
		const currentStat = await fs.stat(current);
		if (currentStat.isFile()) {
			const type = detectFileType(current);
			if (type && allowed.has(type)) {
				files.push({
					absolutePath: current,
					relativePath: path.relative(baseDir, current),
					type,
				});
			}
			return;
		}
		if (!currentStat.isDirectory()) return;
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const child = path.join(current, entry.name);
			if (entry.isDirectory() && !options.recursive) continue;
			await visit(child);
		}
	}

	await visit(input);
	return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function detectFileType(filePath: string): CompressFileType | null {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.png') return 'png';
	if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
	if (ext === '.svg') return 'svg';
	if (ext === '.gif') return 'gif';
	return null;
}

async function validateOutputTargets(
	candidates: FileCandidate[],
	outDir: string,
): Promise<CompressIssue[]> {
	const issues: CompressIssue[] = [];
	for (const candidate of candidates) {
		const output = path.join(outDir, candidate.relativePath);
		if (await fileExists(output)) {
			issues.push({
				code: 'WCP_OUTPUT_EXISTS',
				severity: 'error',
				message: `Output already exists: ${output}`,
				path: output,
				fix: 'Pass --force to overwrite existing output files.',
			});
		}
	}
	return issues;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function resolveToolsForCandidates(
	candidates: FileCandidate[],
	mode: CompressMode,
	resolver: ToolResolver,
): Promise<ToolResolution[]> {
	const requirements = new Map<
		string,
		{ capability: ToolCapability; preferred: string[] }
	>();
	for (const candidate of candidates) {
		const requirement = requirementForType(candidate.type, mode);
		requirements.set(`${requirement.capability}:${mode}`, requirement);
	}
	return Promise.all(
		[...requirements.values()].map((requirement) =>
			resolver.resolveCapability({
				capability: requirement.capability,
				mode,
				preferred: requirement.preferred,
			}),
		),
	);
}

function requirementForType(
	type: CompressFileType,
	mode: CompressMode,
): { capability: ToolCapability; preferred: string[] } {
	if (mode === 'quality') {
		if (type === 'png')
			return { capability: 'compress-png', preferred: ['pngquant'] };
		if (type === 'jpg')
			return { capability: 'compress-jpg', preferred: ['mozjpeg'] };
	}
	if (type === 'png')
		return { capability: 'compress-png', preferred: ['oxipng'] };
	if (type === 'svg')
		return { capability: 'compress-svg', preferred: ['svgo'] };
	if (type === 'gif')
		return { capability: 'compress-gif', preferred: ['gifsicle'] };
	return { capability: 'compress-jpg', preferred: ['jpegtran', 'mozjpeg'] };
}

function validateToolResolutions(
	resolutions: ToolResolution[],
): CompressIssue[] {
	return resolutions
		.filter((resolution) => !resolution.selected)
		.map((resolution) => ({
			code: 'WCP_TOOL_MISSING',
			severity: 'error',
			message:
				resolution.missingReason ??
				`Missing tool for ${resolution.requirement.capability}`,
			fix: 'Run wave compress install --check to inspect tool requirements.',
		}));
}

function getResolutionForType(
	resolutions: ToolResolution[],
	type: CompressFileType,
	mode: CompressMode,
): ToolResolution | undefined {
	const requirement = requirementForType(type, mode);
	return resolutions.find(
		(resolution) =>
			resolution.requirement.capability === requirement.capability &&
			resolution.requirement.mode === mode,
	);
}

function ensureKnownToolName(toolName: string): string {
	if (
		['oxipng', 'pngquant', 'svgo', 'gifsicle', 'jpegtran', 'mozjpeg'].includes(
			toolName,
		)
	) {
		return toolName;
	}
	throw new Error(`Unsupported compress tool: ${toolName}`);
}

type CompressCommandToolName =
	| 'oxipng'
	| 'pngquant'
	| 'svgo'
	| 'gifsicle'
	| 'jpegtran'
	| 'mozjpeg';

async function compressFile(options: {
	source: string;
	output: string;
	type: CompressFileType;
	mode: CompressMode;
	quality?: number;
	toolName: string;
	svgoConfigPath?: string;
	runner: CommandRunner;
}): Promise<void> {
	const toolName = ensureKnownToolName(
		options.toolName,
	) as CompressCommandToolName;
	const args = buildToolArgs({ ...options, toolName });
	const result = await options.runner.run({
		command: toolName,
		args,
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`${toolName} failed for ${path.basename(options.source)}: ${result.stderr.trim()}`,
		);
	}
	if (!(await Bun.file(options.output).exists())) {
		await fs.copyFile(options.source, options.output);
	}
}

function homeDir(): string {
	return process.env.HOME || os.homedir();
}

async function findUserSvgoConfigPath(): Promise<string | undefined> {
	const configPath = path.join(homeDir(), '.config', 'wave', 'svgo.cjs');
	return (await fileExists(configPath)) ? configPath : undefined;
}

async function writeIconSvgoConfig(tempDir: string): Promise<string> {
	const configPath = path.join(tempDir, 'wave-svgo-icon.cjs');
	await fs.writeFile(
		configPath,
		`module.exports = {
  plugins: [
    {
      name: 'preset-default',
      params: {
        floatPrecision: 2,
      },
    },
    {
      name: 'removeAttrs',
      params: {
        attrs: '(fill|fill-rule|fill-opacity)',
      },
    },
  ],
};
`,
	);
	return configPath;
}

function buildToolArgs(options: {
	source: string;
	output: string;
	type: CompressFileType;
	mode: CompressMode;
	quality?: number;
	toolName: CompressCommandToolName;
	svgoConfigPath?: string;
}): string[] {
	switch (options.toolName) {
		case 'oxipng':
			return ['--out', options.output, options.source];
		case 'pngquant':
			return [
				'--quality',
				`${options.quality ?? 80}-${options.quality ?? 80}`,
				'--output',
				options.output,
				'--force',
				options.source,
			];
		case 'svgo':
			return [
				...(options.svgoConfigPath ? ['--config', options.svgoConfigPath] : []),
				'--input',
				options.source,
				'--output',
				options.output,
			];
		case 'gifsicle':
			return ['--optimize=3', '--output', options.output, options.source];
		case 'jpegtran':
			return [
				'-copy',
				'none',
				'-optimize',
				'-outfile',
				options.output,
				options.source,
			];
		case 'mozjpeg':
			return [
				'-quality',
				String(options.quality ?? 85),
				'-outfile',
				options.output,
				options.source,
			];
	}
}
