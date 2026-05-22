import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
	CommandRunner,
	PlannedCommand,
	ToolCapability,
	ToolResolver,
	ToolResolution,
} from '../tools/index.ts';
import { readPngSize } from './png.ts';

export type MotionFormat = 'gif' | 'apng';
export type MotionLoop = 'forever' | 'once';

export interface MotionInput {
	format: MotionFormat;
	framesDir: string;
	fps?: number;
	quality?: number;
	loop?: string;
	out?: string;
	overwrite?: boolean;
	dryRun?: boolean;
	cwd?: string;
}

export interface MotionFrame {
	name: string;
	path: string;
	width: number;
	height: number;
}

export interface MotionIssue {
	code: string;
	severity: 'error' | 'warning';
	message: string;
	path?: string;
}

export interface MotionPlan {
	format: MotionFormat;
	framesDir: string;
	frames: MotionFrame[];
	fps: number;
	quality: number;
	loop: MotionLoop;
	durationSeconds: number;
	width: number;
	height: number;
	outputPath: string;
	command: PlannedCommand;
	tool: string;
	issues: MotionIssue[];
}

export interface MotionResult {
	plan: MotionPlan;
	outputSize?: number;
}

export interface MotionDoctorResult {
	format?: MotionFormat;
	toolResolutions: ToolResolution[];
	frames?: MotionFrame[];
	details: string[];
	issues: MotionIssue[];
}

export async function createMotionPlan(
	input: MotionInput,
	toolResolver: ToolResolver,
): Promise<MotionPlan> {
	const fps = input.fps ?? 24;
	const quality = input.quality ?? 80;
	const rawLoop = input.loop ?? 'forever';
	const loop: MotionLoop = rawLoop === 'once' ? 'once' : 'forever';
	const framesDir = path.resolve(input.cwd ?? process.cwd(), input.framesDir);
	const outputPath = resolveOutputPath(input, framesDir);
	const issues: MotionIssue[] = [];

	if (!Number.isFinite(fps) || fps <= 0) {
		issues.push({
			code: 'WMG_FPS_INVALID',
			severity: 'error',
			message: 'fps must be greater than 0',
		});
	}
	if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
		issues.push({
			code: 'WMG_QUALITY_INVALID',
			severity: 'error',
			message: 'quality must be an integer from 1 to 100',
		});
	}
	if (rawLoop !== 'forever' && rawLoop !== 'once') {
		issues.push({
			code: 'WMG_LOOP_INVALID',
			severity: 'error',
			message: 'loop must be either "forever" or "once"',
		});
	}
	if (input.format === 'gif' && loop === 'once') {
		issues.push({
			code: 'WMG_LOOP_UNSUPPORTED',
			severity: 'error',
			message: 'GIF loop mode "once" is not supported by the gifski backend',
		});
	}

	const scanResult = await scanPngFrames(framesDir);
	issues.push(...scanResult.issues);

	const firstFrame = scanResult.frames[0];
	if (scanResult.frames.length < 2) {
		issues.push({
			code: 'WMG_FRAME_COUNT_LOW',
			severity: 'error',
			message: 'motion requires at least 2 PNG frames',
			path: framesDir,
		});
	}

	if (firstFrame) {
		for (const frame of scanResult.frames) {
			if (
				frame.width !== firstFrame.width ||
				frame.height !== firstFrame.height
			) {
				issues.push({
					code: 'WMG_FRAME_SIZE_MISMATCH',
					severity: 'error',
					message: `${frame.name} is ${frame.width}x${frame.height}, expected ${firstFrame.width}x${firstFrame.height}`,
					path: frame.path,
				});
			}
		}
	}

	if (!input.overwrite && (await fileExists(outputPath))) {
		issues.push({
			code: 'WMG_OUTPUT_EXISTS',
			severity: 'error',
			message: `output already exists: ${outputPath}`,
			path: outputPath,
		});
	}

	const toolResolution = await toolResolver.resolveCapability({
		capability: capabilityForFormat(input.format),
		mode: 'encode',
	});
	if (!toolResolution.selected) {
		issues.push({
			code: 'WMG_TOOL_MISSING',
			severity: 'error',
			message: toolResolution.missingReason ?? 'motion encoder is missing',
		});
	}

	const tool =
		toolResolution.selected?.command ?? toolNameForFormat(input.format);
	const command = buildCommand({
		format: input.format,
		tool,
		frames: scanResult.frames,
		fps,
		quality,
		loop,
		outputPath,
	});

	return {
		format: input.format,
		framesDir,
		frames: scanResult.frames,
		fps,
		quality,
		loop,
		durationSeconds: fps > 0 ? scanResult.frames.length / fps : 0,
		width: firstFrame?.width ?? 0,
		height: firstFrame?.height ?? 0,
		outputPath,
		command,
		tool,
		issues,
	};
}

export async function encodeMotionPlan(
	plan: MotionPlan,
	runner: CommandRunner,
): Promise<MotionResult> {
	const blocking = plan.issues.filter((issue) => issue.severity === 'error');
	if (blocking.length > 0) {
		throw new Error(blocking[0]?.message ?? 'motion plan has errors');
	}

	await fs.mkdir(path.dirname(plan.outputPath), { recursive: true });
	const result = await runner.run(plan.command);
	if (result.exitCode !== 0) {
		throw new Error(
			result.stderr.trim() || result.stdout.trim() || 'encode failed',
		);
	}
	if (!(await fileExists(plan.outputPath))) {
		throw new Error(`encoder did not create output: ${plan.outputPath}`);
	}

	const stat = await fs.stat(plan.outputPath);
	return { plan, outputSize: stat.size };
}

export async function runMotionDoctor(
	framesDir: string | undefined,
	toolResolver: ToolResolver,
): Promise<MotionDoctorResult> {
	const toolResolutions = await Promise.all([
		toolResolver.resolveCapability({
			capability: 'encode-gif',
			mode: 'encode',
		}),
		toolResolver.resolveCapability({
			capability: 'encode-apng',
			mode: 'encode',
		}),
	]);
	const issues: MotionIssue[] = [];
	const details: string[] = [];

	for (const resolution of toolResolutions) {
		if (!resolution.selected) {
			issues.push({
				code: 'WMG_TOOL_MISSING',
				severity: 'warning',
				message: resolution.missingReason ?? 'motion encoder is missing',
			});
		}
	}

	if (!framesDir) {
		return { toolResolutions, details, issues };
	}

	const resolvedFramesDir = path.resolve(process.cwd(), framesDir);
	const scanResult = await scanPngFrames(resolvedFramesDir);
	issues.push(...scanResult.issues);
	const firstFrame = scanResult.frames[0];

	if (scanResult.frames.length < 2) {
		issues.push({
			code: 'WMG_FRAME_COUNT_LOW',
			severity: 'error',
			message: 'motion requires at least 2 PNG frames',
			path: resolvedFramesDir,
		});
	}

	if (firstFrame) {
		for (const frame of scanResult.frames) {
			if (
				frame.width !== firstFrame.width ||
				frame.height !== firstFrame.height
			) {
				issues.push({
					code: 'WMG_FRAME_SIZE_MISMATCH',
					severity: 'error',
					message: `${frame.name} is ${frame.width}x${frame.height}, expected ${firstFrame.width}x${firstFrame.height}`,
					path: frame.path,
				});
			}
		}
		details.push(
			`${scanResult.frames.length} frames, ${firstFrame.width}x${firstFrame.height}, duration ${(scanResult.frames.length / 24).toFixed(2)}s at 24 fps`,
		);
	}

	return {
		toolResolutions,
		frames: scanResult.frames,
		details,
		issues,
	};
}

export function hasBlockingMotionIssues(issues: MotionIssue[]): boolean {
	return issues.some((issue) => issue.severity === 'error');
}

async function scanPngFrames(
	framesDir: string,
): Promise<{ frames: MotionFrame[]; issues: MotionIssue[] }> {
	const issues: MotionIssue[] = [];
	let entries: string[];
	try {
		entries = await fs.readdir(framesDir);
	} catch {
		return {
			frames: [],
			issues: [
				{
					code: 'WMG_FRAME_DIR_MISSING',
					severity: 'error',
					message: `frame directory not found: ${framesDir}`,
					path: framesDir,
				},
			],
		};
	}

	const sorted = entries.toSorted((a, b) =>
		a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
	);
	const frames: MotionFrame[] = [];

	for (const entry of sorted) {
		const fullPath = path.join(framesDir, entry);
		const stat = await fs.stat(fullPath);
		if (!stat.isFile()) continue;
		if (!entry.toLowerCase().endsWith('.png')) {
			issues.push({
				code: 'WMG_NON_PNG_IGNORED',
				severity: 'warning',
				message: `${entry} is ignored; motion v1 only supports PNG frames`,
				path: fullPath,
			});
			continue;
		}
		let size: Awaited<ReturnType<typeof readPngSize>>;
		try {
			size = await readPngSize(fullPath);
		} catch (error) {
			issues.push({
				code: 'WMG_FRAME_FORMAT_UNSUPPORTED',
				severity: 'error',
				message:
					error instanceof Error
						? error.message
						: `${entry} is not a readable PNG file`,
				path: fullPath,
			});
			continue;
		}
		frames.push({
			name: entry,
			path: fullPath,
			width: size.width,
			height: size.height,
		});
	}

	return { frames, issues };
}

function resolveOutputPath(input: MotionInput, framesDir: string): string {
	if (input.out) {
		return path.resolve(input.cwd ?? process.cwd(), input.out);
	}
	const parsed = path.parse(framesDir);
	const extension = input.format === 'gif' ? '.gif' : '.png';
	return path.join(parsed.dir, `${parsed.name}${extension}`);
}

function capabilityForFormat(format: MotionFormat): ToolCapability {
	return format === 'gif' ? 'encode-gif' : 'encode-apng';
}

function toolNameForFormat(format: MotionFormat): string {
	return format === 'gif' ? 'gifski' : 'apngasm';
}

function buildCommand(args: {
	format: MotionFormat;
	tool: string;
	frames: MotionFrame[];
	fps: number;
	quality: number;
	loop: 'forever' | 'once';
	outputPath: string;
}): PlannedCommand {
	if (args.format === 'gif') {
		return {
			command: args.tool,
			args: [
				'--fps',
				String(args.fps),
				'--quality',
				String(args.quality),
				'--output',
				args.outputPath,
				...args.frames.map((frame) => frame.path),
			],
		};
	}

	return {
		command: args.tool,
		args: [
			'-o',
			args.outputPath,
			...args.frames.map((frame) => frame.path),
			'-d',
			String(Math.round(1000 / args.fps)),
			'-l',
			args.loop === 'forever' ? '0' : '1',
		],
	};
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}
