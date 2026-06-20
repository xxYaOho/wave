import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

export type WorkspaceErrorCode =
	| 'WWK_CONFIG_PARSE_FAILED'
	| 'WWK_CONFIG_INVALID'
	| 'WWK_NAME_PART_UNKNOWN'
	| 'WWK_TITLE_REQUIRED'
	| 'WWK_TYPE_EMPTY'
	| 'WWK_TYPE_DEFAULT_INVALID'
	| 'WWK_FOLDER_PATH_INVALID'
	| 'WWK_WORKSPACE_EXISTS'
	| 'WWK_CREATE_FAILED';

export type WorkspaceNamePart = 'type' | 'title' | 'version' | 'date' | 'tags';

export interface WorkspaceTypeOption {
	code: string;
	label: string;
}

export interface WorkspaceFolderConfig {
	path: string;
	placeholder?: string;
}

export interface WorkspaceConfig {
	baseDir: string;
	openAfterCreate: boolean;
	name: {
		separator: string;
		parts: WorkspaceNamePart[];
	};
	type: {
		enabled: boolean;
		default?: string;
		content: WorkspaceTypeOption[];
	};
	title: {
		enabled: boolean;
		required: boolean;
	};
	version: {
		enabled: boolean;
		default?: string;
		prefix: string;
	};
	date: {
		enabled: boolean;
		format: 'YYYYMMDD';
	};
	tags: {
		enabled: boolean;
		style: 'bracket';
	};
	folders: WorkspaceFolderConfig[];
}

export interface WorkspaceAnswers {
	type?: string;
	title: string;
	version?: string;
	tags?: string;
	date?: Date;
}

export interface WorkspacePlan {
	config: WorkspaceConfig;
	workspaceName: string;
	targetDir: string;
	displayPath: string;
	type?: string;
	title: string;
	version?: string;
	date?: string;
	tags: string[];
	folders: WorkspaceFolderConfig[];
}

export interface WorkspaceCreateResult extends WorkspacePlan {
	placeholderFiles: string[];
	readmePath: string;
	opened: boolean;
	openWarning?: string;
}

export class WorkspaceError extends Error {
	constructor(
		public code: WorkspaceErrorCode,
		message: string,
		public override cause?: unknown,
	) {
		super(`${code}: ${message}`);
		this.name = 'WorkspaceError';
	}
}

const KNOWN_NAME_PARTS = new Set<WorkspaceNamePart>([
	'type',
	'title',
	'version',
	'date',
	'tags',
]);

const folderSchema = z
	.object({
		path: z.string().min(1),
		placeholder: z.string().min(1).optional(),
	})
	.strict();

const rawConfigSchema = z
	.object({
		baseDir: z.string().min(1),
		openAfterCreate: z.boolean().default(true),
		name: z
			.object({
				separator: z.string(),
				parts: z.array(z.string()).min(1),
			})
			.strict(),
		type: z
			.object({
				enabled: z.boolean(),
				default: z.string().optional(),
				content: z
					.array(
						z
							.object({
								code: z.string().min(1),
								label: z.string().min(1),
							})
							.strict(),
					)
					.default([]),
			})
			.strict(),
		title: z
			.object({
				enabled: z.boolean(),
				required: z.boolean(),
			})
			.strict(),
		version: z
			.object({
				enabled: z.boolean(),
				default: z.string().optional(),
				prefix: z.string().default('v'),
			})
			.strict(),
		date: z
			.object({
				enabled: z.boolean(),
				format: z.literal('YYYYMMDD'),
			})
			.strict(),
		tags: z
			.object({
				enabled: z.boolean(),
				style: z.literal('bracket'),
			})
			.strict(),
		folders: z.array(folderSchema).default([]),
	})
	.strict();

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
	baseDir: '~/Documents/Work',
	openAfterCreate: true,
	name: {
		separator: '_',
		parts: ['type', 'title', 'version', 'date', 'tags'],
	},
	type: {
		enabled: true,
		default: 'FEAT',
		content: [
			{ code: 'FEAT', label: '新功能开发' },
			{ code: 'VIZ', label: '可视化项目' },
			{ code: 'BUG', label: 'Bug 修复' },
			{ code: 'OPT', label: '优化项目' },
		],
	},
	title: {
		enabled: true,
		required: true,
	},
	version: {
		enabled: true,
		default: 'v1.0.0',
		prefix: 'v',
	},
	date: {
		enabled: true,
		format: 'YYYYMMDD',
	},
	tags: {
		enabled: true,
		style: 'bracket',
	},
	folders: [
		{ path: '1.Docs', placeholder: '_需求文档或其他资料' },
		{ path: '2.Public', placeholder: '_静态素材' },
		{ path: '3.Reference', placeholder: '_参考资料' },
		{ path: '4.Output', placeholder: '_对外发送' },
		{ path: '9.Archive', placeholder: '_归档' },
	],
};

export function workspaceConfigPath(env = process.env): string {
	const configured = env.WAVE_WORKSPACE_CONFIG;
	if (configured?.trim()) return expandHome(configured);
	return path.join(os.homedir(), '.config', 'wave', 'workspace.yaml');
}

export async function loadWorkspaceConfig(
	configPath = workspaceConfigPath(),
): Promise<WorkspaceConfig> {
	if (!(await fileExists(configPath))) {
		return DEFAULT_WORKSPACE_CONFIG;
	}

	let raw: unknown;
	try {
		raw = yaml.load(await fs.readFile(configPath, 'utf-8'));
	} catch (error) {
		throw new WorkspaceError(
			'WWK_CONFIG_PARSE_FAILED',
			`Could not parse workspace config at ${configPath}.`,
			error,
		);
	}

	return validateWorkspaceConfig(raw);
}

export function validateWorkspaceConfig(raw: unknown): WorkspaceConfig {
	const parsed = rawConfigSchema.safeParse(raw);
	if (!parsed.success) {
		throw new WorkspaceError(
			'WWK_CONFIG_INVALID',
			parsed.error.issues[0]?.message ?? 'Workspace config is invalid.',
			parsed.error,
		);
	}

	const config = parsed.data as WorkspaceConfig;
	validateNameParts(config);
	if (!config.title.enabled || !config.title.required) {
		throw new WorkspaceError(
			'WWK_TITLE_REQUIRED',
			'title must remain enabled and required.',
		);
	}
	if (config.type.enabled && config.type.content.length === 0) {
		throw new WorkspaceError(
			'WWK_TYPE_EMPTY',
			'type.content must contain at least one entry.',
		);
	}
	if (
		config.type.enabled &&
		config.type.default &&
		!config.type.content.some((entry) => entry.code === config.type.default)
	) {
		throw new WorkspaceError(
			'WWK_TYPE_DEFAULT_INVALID',
			'type.default must match one type.content code.',
		);
	}
	validateNameSeparator(config.name.separator);
	validateVersionPrefix(config.version.prefix);
	for (const entry of config.type.content)
		validateNameSegment(entry.code, 'type code');
	for (const folder of config.folders) {
		validateFolderPath(folder.path);
		if (folder.placeholder) validatePlaceholderName(folder.placeholder);
	}

	return config;
}

export function buildWorkspacePlan(
	config: WorkspaceConfig,
	answers: WorkspaceAnswers,
	options: { cwd?: string } = {},
): WorkspacePlan {
	const cwd = options.cwd ?? process.cwd();
	const title = answers.title.trim();
	if (!title) {
		throw new WorkspaceError(
			'WWK_TITLE_REQUIRED',
			'Project title is required.',
		);
	}

	const date = formatWorkspaceDate(answers.date ?? new Date());
	const selectedType = config.type.enabled
		? normalizeType(
				answers.type ?? config.type.default ?? config.type.content[0]?.code,
			)
		: undefined;
	const version = config.version.enabled
		? normalizeVersion(
				answers.version?.trim() || config.version.default || '',
				config.version.prefix,
			)
		: undefined;
	const tags = config.tags.enabled ? parseTags(answers.tags ?? '') : [];

	const values: Record<WorkspaceNamePart, string | undefined> = {
		type: selectedType,
		title,
		version,
		date: config.date.enabled ? date : undefined,
		tags: tags.length > 0 ? tags.map((tag) => `[${tag}]`).join('') : undefined,
	};
	const nameParts = config.name.parts
		.filter((part) => isPartEnabled(config, part))
		.map((part) => values[part]?.trim())
		.filter((value): value is string => !!value);
	for (const part of nameParts)
		validateNameSegment(part, 'workspace name part');
	const workspaceName = nameParts.join(config.name.separator);
	const baseDir = resolveWorkspacePath(config.baseDir, cwd);
	const targetDir = path.join(baseDir, workspaceName);
	assertInsideDirectory(baseDir, targetDir, 'workspace target');

	return {
		config,
		workspaceName,
		targetDir,
		displayPath: formatFriendlyPath(targetDir, cwd),
		type: selectedType,
		title,
		version,
		date: config.date.enabled ? date : undefined,
		tags,
		folders: config.folders,
	};
}

export async function createWorkspace(
	plan: WorkspacePlan,
	options: {
		openWorkspace?: (targetDir: string) => Promise<void>;
	} = {},
): Promise<WorkspaceCreateResult> {
	if (await fileExists(plan.targetDir)) {
		throw new WorkspaceError(
			'WWK_WORKSPACE_EXISTS',
			`Workspace already exists: ${plan.targetDir}`,
		);
	}

	const placeholderFiles: string[] = [];
	try {
		await fs.mkdir(path.dirname(plan.targetDir), { recursive: true });
		await fs.mkdir(plan.targetDir);
		for (const folder of plan.folders) {
			const folderPath = path.join(plan.targetDir, folder.path);
			await fs.mkdir(folderPath, { recursive: true });
			if (folder.placeholder) {
				const placeholderPath = path.join(folderPath, folder.placeholder);
				assertInsideDirectory(plan.targetDir, placeholderPath, 'placeholder');
				await fs.writeFile(placeholderPath, '', 'utf-8');
				placeholderFiles.push(placeholderPath);
			}
		}
		const readmePath = path.join(plan.targetDir, 'README.md');
		await fs.writeFile(readmePath, renderWorkspaceReadme(plan), 'utf-8');

		let opened = false;
		let openWarning: string | undefined;
		if (plan.config.openAfterCreate) {
			try {
				await (options.openWorkspace ?? openInFinder)(plan.targetDir);
				opened = true;
			} catch (error) {
				openWarning = error instanceof Error ? error.message : String(error);
			}
		}

		return { ...plan, placeholderFiles, readmePath, opened, openWarning };
	} catch (error) {
		if (error instanceof WorkspaceError) throw error;
		throw new WorkspaceError(
			'WWK_CREATE_FAILED',
			error instanceof Error ? error.message : 'Workspace creation failed.',
			error,
		);
	}
}

export function sanitizeCustomType(input: string): string {
	return input
		.trim()
		.toUpperCase()
		.replace(/\s+/g, '_')
		.replace(/[^\p{L}\p{N}_-]/gu, '');
}

export function formatWorkspaceDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}${month}${day}`;
}

export function formatFriendlyPath(input: string, cwd = process.cwd()): string {
	const normalizedInput = path.resolve(input);
	const relativeToCwd = path.relative(cwd, normalizedInput);
	if (relativeToCwd === '') return '.';
	if (!relativeToCwd.startsWith('..') && !path.isAbsolute(relativeToCwd)) {
		return `./${relativeToCwd}`;
	}

	const home = os.homedir();
	const relativeToHome = path.relative(home, normalizedInput);
	if (relativeToHome === '') return '~';
	if (!relativeToHome.startsWith('..') && !path.isAbsolute(relativeToHome)) {
		return `~/${relativeToHome}`;
	}

	return normalizedInput;
}

function validateNameParts(config: WorkspaceConfig): void {
	for (const part of config.name.parts) {
		if (!KNOWN_NAME_PARTS.has(part as WorkspaceNamePart)) {
			throw new WorkspaceError(
				'WWK_NAME_PART_UNKNOWN',
				`Unknown workspace name part: ${part}`,
			);
		}
	}
}

function validateFolderPath(folderPath: string): void {
	if (
		path.isAbsolute(folderPath) ||
		folderPath.split(/[\\/]+/).includes('..')
	) {
		throw new WorkspaceError(
			'WWK_FOLDER_PATH_INVALID',
			`Folder path must be relative and stay inside the workspace: ${folderPath}`,
		);
	}
}

function validateNameSeparator(separator: string): void {
	if (separator === '') return;
	if (hasPathBoundarySyntax(separator)) {
		throw new WorkspaceError(
			'WWK_FOLDER_PATH_INVALID',
			`Workspace name separator must not contain path syntax: ${separator}`,
		);
	}
}

function validateVersionPrefix(prefix: string): void {
	if (prefix === '') return;
	if (hasPathBoundarySyntax(prefix)) {
		throw new WorkspaceError(
			'WWK_FOLDER_PATH_INVALID',
			`Version prefix must not contain path syntax: ${prefix}`,
		);
	}
}

function validateNameSegment(segment: string, label: string): void {
	if (!segment.trim() || hasPathBoundarySyntax(segment)) {
		throw new WorkspaceError(
			'WWK_FOLDER_PATH_INVALID',
			`${label} must not contain path syntax: ${segment}`,
		);
	}
}

function validatePlaceholderName(placeholder: string): void {
	if (
		placeholder !== path.basename(placeholder) ||
		hasPathBoundarySyntax(placeholder)
	) {
		throw new WorkspaceError(
			'WWK_FOLDER_PATH_INVALID',
			`Placeholder must be a basename inside its folder: ${placeholder}`,
		);
	}
}

function hasPathBoundarySyntax(value: string): boolean {
	return (
		path.isAbsolute(value) ||
		value.split(/[\\/]+/).includes('..') ||
		value.includes('/') ||
		value.includes('\\')
	);
}

function assertInsideDirectory(
	parentDir: string,
	childPath: string,
	label: string,
): void {
	const relative = path.relative(parentDir, childPath);
	if (
		relative === '' ||
		relative.startsWith('..') ||
		path.isAbsolute(relative)
	) {
		throw new WorkspaceError(
			'WWK_FOLDER_PATH_INVALID',
			`${label} must stay inside ${parentDir}: ${childPath}`,
		);
	}
}

function isPartEnabled(
	config: WorkspaceConfig,
	part: WorkspaceNamePart,
): boolean {
	if (part === 'type') return config.type.enabled;
	if (part === 'title') return config.title.enabled;
	if (part === 'version') return config.version.enabled;
	if (part === 'date') return config.date.enabled;
	if (part === 'tags') return config.tags.enabled;
	return false;
}

function normalizeType(input: string | undefined): string | undefined {
	if (!input) return undefined;
	return sanitizeCustomType(input);
}

function normalizeVersion(input: string, prefix: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;
	if (!prefix) return trimmed;
	return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
}

function parseTags(input: string): string[] {
	return input
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function resolveWorkspacePath(input: string, cwd: string): string {
	const expanded = expandHome(input);
	return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

function expandHome(input: string): string {
	if (input === '~') return os.homedir();
	if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
	return input;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function renderWorkspaceReadme(plan: WorkspacePlan): string {
	const lines = [`# ${plan.title}`, '', `- Type: ${plan.type ?? '-'}`];
	if (plan.version) lines.push(`- Version: ${plan.version}`);
	if (plan.date) lines.push(`- Date: ${plan.date}`);
	lines.push(`- Tags: ${plan.tags.length > 0 ? plan.tags.join(', ') : '-'}`);
	lines.push('', '## Folders', '');
	for (const folder of plan.folders) {
		lines.push(`- ${folder.path}`);
	}
	lines.push('');
	return lines.join('\n');
}

async function openInFinder(targetDir: string): Promise<void> {
	const proc = Bun.spawn(['open', targetDir], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(stderr.trim() || 'Finder open failed.');
	}
}
