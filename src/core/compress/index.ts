import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
	CommandRunner,
	ToolCapability,
	ToolResolver,
	ToolResolution,
} from '../tools/index.ts';
import {
	BunCommandRunner,
	DefaultToolResolver,
} from '../tools/index.ts';

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
	resolver?: ToolResolver;
	runner?: CommandRunner;
	cwd?: string;
}

export interface CompressItemResult {
	source: string;
	output: string;
	type: CompressFileType;
	status: 'optimized' | 'unchanged';
	beforeBytes: number;
	afterBytes: number;
	savedBytes: number;
	savedPercent: number;
	tool: string;
	written: boolean;
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

export async function runCompress(
	options: CompressOptions,
): Promise<CompressResult> {
	const cwd = options.cwd ?? process.cwd();
	const input = path.resolve(cwd, options.input);
	const outDir = path.resolve(cwd, options.outDir ?? './compressed');
	const mode: CompressMode = options.quality === undefined ? 'safe' : 'quality';
	const resolver = options.resolver ?? new DefaultToolResolver();
	const runner = options.runner ?? new BunCommandRunner();
	const candidates = await scanCompressCandidates(input, {
		recursive: !!options.recursive,
		types: options.types,
	});
	const resolutions = await resolveToolsForCandidates(candidates, mode, resolver);
	const issues = validateToolResolutions(resolutions);

	if (issues.length > 0) {
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
		};
	}

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
	const items: CompressItemResult[] = [];
	try {
		for (const candidate of candidates) {
			const tempOutput = path.join(tempDir, candidate.relativePath);
			await fs.mkdir(path.dirname(tempOutput), { recursive: true });
			const resolution = getResolutionForType(resolutions, candidate.type, mode);
			if (!resolution?.selected) {
				issues.push({
					code: 'WCP_TOOL_MISSING',
					severity: 'error',
					message: `No compressor available for ${candidate.type}`,
					path: candidate.absolutePath,
					fix: 'Run wave compress doctor or wave compress install --check.',
				});
				continue;
			}
			await compressFile({
				source: candidate.absolutePath,
				output: tempOutput,
				type: candidate.type,
				mode,
				quality: options.quality,
				toolName: resolution.selected.name,
				runner,
			});

			const beforeBytes = (await fs.stat(candidate.absolutePath)).size;
			const previewBytes = (await fs.stat(tempOutput)).size;
			const status = previewBytes < beforeBytes ? 'optimized' : 'unchanged';
			const afterBytes = status === 'optimized' ? previewBytes : beforeBytes;
			const finalOutput = path.join(outDir, candidate.relativePath);
			const shouldWrite = !!options.yes && !options.dryRun;
			if (shouldWrite) {
				await fs.mkdir(path.dirname(finalOutput), { recursive: true });
				await fs.copyFile(
					status === 'optimized' ? tempOutput : candidate.absolutePath,
					finalOutput,
				);
			}
			items.push({
				source: candidate.absolutePath,
				output: finalOutput,
				type: candidate.type,
				status,
				beforeBytes,
				afterBytes,
				savedBytes: beforeBytes - afterBytes,
				savedPercent:
					beforeBytes === 0
						? 0
						: Number((((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1)),
				tool: resolution.selected.name,
				written: shouldWrite,
			});
		}
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}

	return {
		mode,
		input,
		outDir,
		scanned: candidates.length,
		matched: candidates.length,
		written: items.some((item) => item.written),
		items,
		issues,
		toolResolutions: resolutions,
	};
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

async function resolveToolsForCandidates(
	candidates: FileCandidate[],
	mode: CompressMode,
	resolver: ToolResolver,
): Promise<ToolResolution[]> {
	const requirements = new Map<string, { capability: ToolCapability; preferred: string[] }>();
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
		if (type === 'png') return { capability: 'compress-png', preferred: ['pngquant'] };
		if (type === 'jpg') return { capability: 'compress-jpg', preferred: ['mozjpeg'] };
	}
	if (type === 'png') return { capability: 'compress-png', preferred: ['oxipng'] };
	if (type === 'svg') return { capability: 'compress-svg', preferred: ['svgo'] };
	if (type === 'gif') return { capability: 'compress-gif', preferred: ['gifsicle'] };
	return { capability: 'compress-jpg', preferred: ['jpegtran', 'mozjpeg'] };
}

function validateToolResolutions(resolutions: ToolResolution[]): CompressIssue[] {
	return resolutions
		.filter((resolution) => !resolution.selected)
		.map((resolution) => ({
			code: 'WCP_TOOL_MISSING',
			severity: 'error',
			message: resolution.missingReason ?? `Missing tool for ${resolution.requirement.capability}`,
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
	runner: CommandRunner;
}): Promise<void> {
	const toolName = ensureKnownToolName(options.toolName) as CompressCommandToolName;
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

function buildToolArgs(options: {
	source: string;
	output: string;
	type: CompressFileType;
	mode: CompressMode;
	quality?: number;
	toolName: CompressCommandToolName;
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
			return ['--input', options.source, '--output', options.output];
		case 'gifsicle':
			return ['--optimize=3', '--output', options.output, options.source];
		case 'jpegtran':
			return ['-copy', 'none', '-optimize', '-outfile', options.output, options.source];
		case 'mozjpeg':
			return ['-quality', String(options.quality ?? 85), '-outfile', options.output, options.source];
	}
}
