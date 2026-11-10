import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, Option } from 'commander';
import { type CommandDefinition, commandRegistry } from './registry.ts';

export interface ManualPageSummary {
	href: string;
	title: string;
	description: string;
	category?: string;
	commands?: string[];
	appliesTo?: string[];
	body?: string;
}

export interface ManualDataIndex {
	pages: ManualPageSummary[];
}

interface ManualNode {
	path: string[];
	command?: Command;
	label?: string;
	children: ManualNode[];
}

const MANUAL_FLAG = /^--?m(?:anual)?(?:=.*)?$/;

// Values for options that are common to the public command tree. They are only
// used while locating a command path; Commander still owns option validation.
const OPTION_VALUES = new Set([
	'-f',
	'--file',
	'-o',
	'--output',
	'-q',
	'--quality',
	'--type',
	'--fps',
	'--loop',
	'--format',
	'--port',
	'--host',
	'--version',
	'--luminance',
	'--luminance-ev',
	'--scene',
	'--profiles',
	'--platform',
	'--color-space',
	'--filter-layer',
	'--config',
]);

const FALLBACK_PAGES: ManualPageSummary[] = [
	{
		href: '/command-index',
		title: '命令索引',
		description: '按命令层级查找 Wave 的使用合同。',
		category: '参考',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/design-token',
		title: 'Design Token',
		description: '读取 token workspace 并生成设计交付产物。',
		category: 'Design Token',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/design-token/quality-theming',
		title: '质量与主题模式',
		description: '检查 token workspace、对比度和主题模式。',
		category: 'Design Token',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/design-token/extensions-output',
		title: '扩展与输出',
		description: '了解 token 输出格式和扩展字段。',
		category: 'Design Token',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/resources',
		title: '内置资源',
		description: '查看和维护 Wave 的内置资源。',
		category: 'Design Token',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/compress',
		title: '素材压缩',
		description: '压缩设计素材并预览写入计划。',
		category: '素材',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/motion',
		title: '动效生成',
		description: '从 PNG 帧目录生成 GIF 或 APNG。',
		category: '素材',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/workspace',
		title: '工作区创建',
		description: '按本地配置创建设计项目工作区。',
		category: '工作区',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/toolchain',
		title: '安装与工具链',
		description: '检查 Wave 运行环境和推荐工具。',
		category: '开始',
		appliesTo: ['本地 CLI'],
	},
	{
		href: '/quickstart',
		title: '快速开始',
		description: '从安装依赖到运行第一个 Wave 命令。',
		category: '开始',
		appliesTo: ['本地 CLI'],
	},
];

function readEmbeddedManualData(): ManualDataIndex {
	const encoded = process.env.WAVE_MANUAL_DATA;
	if (encoded) {
		try {
			const parsed: unknown = JSON.parse(encoded);
			if (isManualDataIndex(parsed)) return parsed;
		} catch {
			// A malformed build define must not make -m execute business code.
		}
	}

	const sourceDataPath = path.resolve(
		import.meta.dir,
		'../../dist/manual-app/manual-data.json',
	);
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(sourceDataPath, 'utf8'));
		if (isManualDataIndex(parsed)) return normalizeManualData(parsed);
	} catch {
		// The source checkout may not have a manual build yet.
	}

	return { pages: FALLBACK_PAGES };
}

function normalizeManualData(data: ManualDataIndex): ManualDataIndex {
	return {
		pages: data.pages.map((page) => ({
			...page,
			body: page.body
				?.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&amp;/g, '&'),
		})),
	};
}

function isManualDataIndex(value: unknown): value is ManualDataIndex {
	if (!value || typeof value !== 'object') return false;
	const pages = (value as { pages?: unknown }).pages;
	return (
		Array.isArray(pages) &&
		pages.every(
			(page) =>
				page &&
				typeof page === 'object' &&
				typeof (page as { href?: unknown }).href === 'string' &&
				typeof (page as { title?: unknown }).title === 'string',
		)
	);
}

const manualData = readEmbeddedManualData();
const pageByHref = new Map(manualData.pages.map((page) => [page.href, page]));

function commandChildren(command: Command): ManualNode[] {
	return command.commands.map((child) => ({
		path: [],
		command: child,
		children: commandChildren(child),
	}));
}

function buildManualTree(): ManualNode {
	const rootChildren: ManualNode[] = commandRegistry.map(
		(definition: CommandDefinition) => ({
			path: [],
			command: definition.command,
			children: commandChildren(definition.command),
		}),
	);
	rootChildren.push({ path: ['version'], label: 'version', children: [] });
	return { path: [], children: rootChildren };
}

function commandName(command: Command | undefined): string | undefined {
	return command?.name();
}

function assignPaths(node: ManualNode, parentPath: string[] = []): void {
	const ownName = node.label ?? commandName(node.command);
	node.path = ownName ? [...parentPath, ownName] : parentPath;
	for (const child of node.children) assignPaths(child, node.path);
}

const manualTree = buildManualTree();
assignPaths(manualTree);
const nodeByPath = new Map<string, ManualNode>();

function indexNodes(node: ManualNode): void {
	nodeByPath.set(node.path.join(' '), node);
	for (const child of node.children) indexNodes(child);
}

indexNodes(manualTree);

function pathKey(pathParts: readonly string[]): string {
	return pathParts.join(' ');
}

function hasPathPrefix(pathParts: readonly string[]): boolean {
	const key = pathKey(pathParts);
	return Array.from(nodeByPath.keys()).some(
		(candidate) => candidate === key || candidate.startsWith(`${key} `),
	);
}

function optionNeedsValue(token: string): boolean {
	const [name] = token.split('=', 1);
	return OPTION_VALUES.has(name ?? token);
}

/** Locate the command path for an argv containing -m/--manual. */
export function resolveManualPath(
	argv: readonly string[],
): string[] | undefined {
	if (!argv.some((arg) => MANUAL_FLAG.test(arg))) return undefined;

	const pathParts: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index]!;
		if (MANUAL_FLAG.test(token)) continue;
		if (token.startsWith('-')) {
			if (!token.includes('=') && optionNeedsValue(token)) index += 1;
			continue;
		}
		const candidate = [...pathParts, token];
		if (hasPathPrefix(candidate)) {
			pathParts.push(token);
			continue;
		}
		// Positional values (profile names, file names, and frame paths) do not
		// change the command scope once a legal path has been found.
		const current = nodeByPath.get(pathKey(pathParts));
		if ((current?.command?.registeredArguments.length ?? 0) > 0) break;
		return [...pathParts, token];
	}
	return pathParts;
}

export function isValidManualPath(pathParts: readonly string[]): boolean {
	return nodeByPath.has(pathKey(pathParts));
}

function commandUsage(pathParts: readonly string[], command?: Command): string {
	const argumentsText = (command?.registeredArguments ?? [])
		.map((argument) => {
			const name = argument.name();
			if (argument.variadic) {
				return argument.required ? `<${name}...>` : `[${name}...]`;
			}
			return argument.required ? `<${name}>` : `[${name}]`;
		})
		.join(' ');
	const commandText = pathParts.length > 0 ? ` ${pathParts.join(' ')}` : '';
	return `wave${commandText}${argumentsText ? ` ${argumentsText}` : ''} [options]`;
}

function formatOption(option: Option): string {
	const defaultValue =
		option.defaultValue !== undefined
			? `；默认值：\`${String(option.defaultValue)}\``
			: '';
	return `- \`${option.flags}\`：${option.description || '无说明'}${defaultValue}`;
}

function formatSyntheticOption(flags: string, description: string): string {
	return `- \`${flags}\`：${description}`;
}

function titleFor(pathParts: readonly string[]): string {
	if (pathParts.length === 0) return 'Wave CLI';
	const page = pageForPath(pathParts);
	return page?.title ?? `Wave ${pathParts.join(' ')}`;
}

function pageForPath(
	pathParts: readonly string[],
): ManualPageSummary | undefined {
	const root = pathParts[0];
	const group = pathParts[1];
	let href = '/command-index';
	if (root === 'token') {
		const leaf = pathParts[2];
		if (group === 'new') {
			href =
				leaf === 'night'
					? '/design-token/night'
					: '/design-token/create';
		} else if (group === 'show' || group === 'update' || group === 'status') {
			href = '/resources';
		} else if (group === 'doctor' || group === 'wcag' || group === 'ids') {
			href = `/design-token/${group}`;
		} else if (group === 'migrate') {
			href = '/design-token/migrate';
		} else {
			href = '/design-token';
		}
	} else if (root === 'compress') href = '/compress';
	else if (root === 'motion') href = '/motion';
	else if (root === 'workspace') href = '/workspace';
	else if (['doctor', 'install'].includes(root ?? '')) href = '/toolchain';
	else if (root === 'manual' || root === 'version') href = '/quickstart';
	return pageByHref.get(href);
}

function defaultBehavior(pathParts: readonly string[]): string {
	if (pathParts.length === 0)
		return '只输出当前命令范围的 Markdown；不会执行构建、写入、交互或启动服务。';
	if (pathParts.join(' ') === 'manual')
		return '不带 `-m` 时启动已构建的网页手册；带 `-m` 时只输出本页 Markdown。';
	if (pathParts.join(' ') === 'version') return '显示当前 Wave 版本号。';
	if (pathParts[0] === 'token' && pathParts.length === 1)
		return '省略子命令时执行 token build。';
	if (pathParts[0] === 'token' && pathParts[1] === 'migrate')
		return '必须明确选择迁移对象；手册模式不会触发迁移。';
	return '带 `-m` 时只输出说明；不带 `-m` 时执行该命令的默认动作。';
}

function exampleFor(pathParts: readonly string[]): string {
	const command = pathParts.length > 0 ? ` ${pathParts.join(' ')}` : '';
	return `wave${command} --help`;
}

function relatedCommands(node: ManualNode): string[] {
	const parent = node.path.slice(0, -1);
	const siblings =
		(parent.length === 0
			? manualTree
			: nodeByPath.get(pathKey(parent))
		)?.children
			.map((child) => child.path.join(' '))
			.filter((value) => value !== pathKey(node.path))
			.slice(0, 4) ?? [];
	return [...siblings, ...(parent.length > 0 ? [parent.join(' ')] : [])];
}

/** Render a path-scoped, plain Markdown command contract. */
export function renderManualMarkdown(pathParts: readonly string[]): string {
	if (!isValidManualPath(pathParts)) {
		throw new Error(`Unknown command path for --manual: ${pathKey(pathParts)}`);
	}

	const node = nodeByPath.get(pathKey(pathParts))!;
	const command = node.command;
	const page = pageForPath(pathParts);
	const lines: string[] = [
		`# ${pathParts.length ? pathKey(pathParts) : 'wave'}`,
		'',
	];
	lines.push('## 适用范围', '');
	for (const scope of page?.appliesTo ?? ['本地 CLI']) lines.push(`- ${scope}`);
	lines.push('', '## 用法', '', `\`${commandUsage(pathParts, command)}\``, '');

	if (node.children.length > 0) {
		lines.push('## 命令', '');
		for (const child of node.children) {
			const childName = child.path.at(-1)!;
			lines.push(
				`- \`${childName}\`：${child.command?.description() ?? '命令'}`,
			);
		}
		lines.push('');
	}

	const options = command?.options ?? [];
	const optionLines = options.map(formatOption);
	if (!options.some((option) => option.long === '--manual')) {
		optionLines.push(
			formatSyntheticOption('-m, --manual', '输出当前命令范围的 Markdown。'),
		);
	}
	if (pathParts.length === 0) {
		optionLines.push(
			formatSyntheticOption('-h, --help', '显示简洁帮助。'),
			formatSyntheticOption('-v, --version', '显示版本号。'),
		);
	}
	if (optionLines.length > 0) {
		lines.push('## 参数', '', ...optionLines, '');
	}

	lines.push(
		'## 默认行为',
		'',
		page?.description ?? titleFor(pathParts),
		defaultBehavior(pathParts),
		'',
	);
	lines.push('## 示例', '', '```bash', exampleFor(pathParts), '```', '');

	const related = relatedCommands(node);
	if (related.length > 0) {
		lines.push(
			'## 相关命令',
			'',
			...related.map((item) => `- \`wave ${item}\``),
			'',
		);
	}

	if (page?.body?.trim()) {
		lines.push('## 用户手册参考', '', page.body.trim(), '');
	}

	const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
	return `${lines.join('\n').replace(ansiEscape, '').trim()}\n`;
}

export function renderManual(pathParts: readonly string[]): void {
	process.stdout.write(renderManualMarkdown(pathParts));
}

export function listManualPaths(): string[][] {
	return Array.from(nodeByPath.keys()).map((key) =>
		key ? key.split(' ') : [],
	);
}
