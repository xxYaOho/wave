import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
	CompressMode,
	CompressToolName,
	ToolResolver,
	ToolStatus,
} from './tools.ts';
import {
	checkCompressTools,
	getMissingToolNames,
	PathToolResolver,
} from './tools.ts';

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
	cwd?: string;
}

export interface CompressItemResult {
	source: string;
	output: string;
	type: CompressFileType;
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
	toolStatuses: ToolStatus[];
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
	const resolver = options.resolver ?? new PathToolResolver();
	const toolStatuses = await checkCompressTools(resolver, mode);
	const candidates = await scanCompressCandidates(input, {
		recursive: !!options.recursive,
		types: options.types,
	});
	const issues = validateToolStatus(
		toolStatuses,
		mode,
		candidates.map((candidate) => candidate.type),
	);

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
			toolStatuses,
		};
	}

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-compress-'));
	const items: CompressItemResult[] = [];
	try {
		for (const candidate of candidates) {
			const tempOutput = path.join(tempDir, candidate.relativePath);
			await fs.mkdir(path.dirname(tempOutput), { recursive: true });
			const selected = selectTool(candidate.type, mode, toolStatuses);
			if (!selected) {
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
				toolPath: selected.path,
				toolName: selected.name,
			});

			const beforeBytes = (await fs.stat(candidate.absolutePath)).size;
			const afterBytes = (await fs.stat(tempOutput)).size;
			const finalOutput = path.join(outDir, candidate.relativePath);
			const shouldWrite = !!options.yes && !options.dryRun;
			if (shouldWrite) {
				await fs.mkdir(path.dirname(finalOutput), { recursive: true });
				await fs.copyFile(tempOutput, finalOutput);
			}
			items.push({
				source: candidate.absolutePath,
				output: finalOutput,
				type: candidate.type,
				beforeBytes,
				afterBytes,
				savedBytes: beforeBytes - afterBytes,
				savedPercent:
					beforeBytes === 0
						? 0
						: Number((((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1)),
				tool: selected.name,
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
		toolStatuses,
	};
}

export async function runCompressDoctor(
	resolver: ToolResolver = new PathToolResolver(),
	mode: CompressMode = 'quality',
): Promise<{ ok: boolean; issues: CompressIssue[]; toolStatuses: ToolStatus[] }> {
	const toolStatuses = await checkCompressTools(resolver, mode);
	const issues = validateToolStatus(toolStatuses, mode);
	return { ok: issues.every((issue) => issue.severity !== 'error'), issues, toolStatuses };
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

function validateToolStatus(
	toolStatuses: ToolStatus[],
	mode: CompressMode,
	types: CompressFileType[] = ['png', 'jpg', 'svg', 'gif'],
): CompressIssue[] {
	const required = getRequiredToolsForTypes(types, mode);
	const missing = getMissingToolNames(toolStatuses).filter((name) => {
		if (!required.has(name)) return false;
		if (name === 'jpegtran') {
			return !toolStatuses.some(
				(status) => status.name === 'mozjpeg' && status.available,
			);
		}
		if (name === 'mozjpeg' && mode === 'safe') {
			return !toolStatuses.some(
				(status) => status.name === 'jpegtran' && status.available,
			);
		}
		return true;
	});
	if (missing.length === 0) return [];
	return [
		{
			code: 'WCP_TOOL_MISSING',
			severity: 'error',
			message: `Missing compress tools: ${missing.join(', ')}`,
			fix:
				mode === 'quality'
					? 'Run wave compress install --check to inspect quality tool requirements.'
					: 'Run wave compress install --check to inspect safe tool requirements.',
		},
	];
}

function getRequiredToolsForTypes(
	types: CompressFileType[],
	mode: CompressMode,
): Set<CompressToolName> {
	const required = new Set<CompressToolName>();
	for (const type of new Set(types)) {
		if (mode === 'quality') {
			if (type === 'png') {
				required.add('pngquant');
				continue;
			}
			if (type === 'jpg') {
				required.add('mozjpeg');
				continue;
			}
		}
		if (type === 'png') required.add('oxipng');
		if (type === 'svg') required.add('svgo');
		if (type === 'gif') required.add('gifsicle');
		if (type === 'jpg') {
			required.add('jpegtran');
			required.add('mozjpeg');
		}
	}
	return required;
}

function selectTool(
	type: CompressFileType,
	mode: CompressMode,
	toolStatuses: ToolStatus[],
): { name: CompressToolName; path: string } | null {
	const available = new Map(
		toolStatuses
			.filter((status) => status.path)
			.map((status) => [status.name, status.path as string]),
	);
	if (mode === 'quality') {
		if (type === 'png' && available.has('pngquant')) {
			return { name: 'pngquant', path: available.get('pngquant')! };
		}
		if (type === 'jpg' && available.has('mozjpeg')) {
			return { name: 'mozjpeg', path: available.get('mozjpeg')! };
		}
	}
	if (type === 'png' && available.has('oxipng')) {
		return { name: 'oxipng', path: available.get('oxipng')! };
	}
	if (type === 'svg' && available.has('svgo')) {
		return { name: 'svgo', path: available.get('svgo')! };
	}
	if (type === 'gif' && available.has('gifsicle')) {
		return { name: 'gifsicle', path: available.get('gifsicle')! };
	}
	if (type === 'jpg') {
		if (available.has('jpegtran')) {
			return { name: 'jpegtran', path: available.get('jpegtran')! };
		}
		if (available.has('mozjpeg')) {
			return { name: 'mozjpeg', path: available.get('mozjpeg')! };
		}
	}
	return null;
}

async function compressFile(options: {
	source: string;
	output: string;
	type: CompressFileType;
	mode: CompressMode;
	quality?: number;
	toolName: CompressToolName;
	toolPath: string;
}): Promise<void> {
	const args = buildToolArgs(options);
	const proc = Bun.spawn([options.toolPath, ...args], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(
			`${options.toolName} failed for ${path.basename(options.source)}: ${stderr.trim()}`,
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
	toolName: CompressToolName;
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
