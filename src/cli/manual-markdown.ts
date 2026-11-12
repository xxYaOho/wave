import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command, Option } from 'commander';
import type { ManualDataView } from '../core/manual/types.ts';
import {
	type CommandDefinition,
	commandManual,
	commandRegistry,
} from './registry.ts';

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
	locales?: Record<'zh' | 'en', ManualDataView>;
}

interface ManualNode {
	path: string[];
	command?: Command;
	label?: string;
	children: ManualNode[];
}

const MANUAL_FLAG = /^--?m(?:anual)?(?:=.*)?$/;

const MANUAL_TEXT_FLAG = /^--?m(?:anual)?(?:=(.*))?$/u;

export interface ManualTextRequest {
	query: string;
}

export interface ManualTextResult {
	stdout: string;
	stderr?: string;
	exitCode: 0 | 1;
}

export class ManualTextReaderError extends Error {
	constructor(message = 'Run pnpm manual:build first.') {
		super(message);
		this.name = 'ManualTextReaderError';
	}
}

/** Detect only `wave manual -m [query]`; all other command -m paths are unchanged. */
export function resolveManualTextRequest(
	argv: readonly string[],
): ManualTextRequest | undefined {
	const manualIndex = argv.indexOf('manual');
	if (manualIndex !== 0) return undefined;

	let flagIndex = -1;
	let inlineQuery = '';
	for (let index = manualIndex + 1; index < argv.length; index += 1) {
		const match = MANUAL_TEXT_FLAG.exec(argv[index]!);
		if (!match) continue;
		flagIndex = index;
		inlineQuery = match[1] ?? '';
		break;
	}
	if (flagIndex < 0) return undefined;

	const queryTokens = argv.slice(manualIndex + 1).filter((token, index) => {
		const absoluteIndex = manualIndex + 1 + index;
		if (absoluteIndex === flagIndex) return false;
		return !token.startsWith('-');
	});
	const query = [inlineQuery, ...queryTokens].filter(Boolean).join(' ').trim();
	return { query };
}

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
		title: 'Command index',
		description: 'Find the Wave usage contract by command level.',
		category: 'Reference',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/design-token',
		title: 'Design Token',
		description: 'Build design delivery outputs from a token workspace.',
		category: 'Design Token',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/design-token/quality-theming',
		title: 'Profile and Night Model',
		description: 'Check token workspace quality, contrast, and theme models.',
		category: 'Design Token',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/design-token/extensions-output',
		title: 'Extensions and Outputs',
		description: 'Review token output formats and extension fields.',
		category: 'Design Token',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/resources',
		title: 'Built-in Resources',
		description: 'Inspect and maintain Wave built-in resources.',
		category: 'Design Token',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/compress',
		title: 'Asset compression',
		description: 'Compress design assets and preview the write plan.',
		category: 'Assets',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/motion',
		title: 'Motion generation',
		description: 'Create GIF or APNG output from a PNG frame directory.',
		category: 'Assets',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/workspace',
		title: 'Workspace creation',
		description: 'Create a design project workspace from local configuration.',
		category: 'Workspace',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/toolchain',
		title: 'Installation and toolchain',
		description: 'Check the Wave runtime and recommended tools.',
		category: 'Getting started',
		appliesTo: ['Local CLI'],
	},
	{
		href: '/quickstart',
		title: 'Quick start',
		description: 'Go from installing dependencies to your first Wave command.',
		category: 'Getting started',
		appliesTo: ['Local CLI'],
	},
];

function readEmbeddedManualData(): ManualDataIndex {
	const encoded = process.env.WAVE_MANUAL_DATA;
	if (encoded) {
		try {
			const parsed: unknown = JSON.parse(encoded);
			if (isManualDataIndex(parsed)) return normalizeManualData(parsed);
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
	const english = data.locales?.en;
	const selected = english ?? data;
	return {
		pages: selected.pages.map((page) => ({
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
	const candidate = value as { pages?: unknown; locales?: unknown };
	const locales = candidate.locales;
	if (locales && typeof locales === 'object' && !Array.isArray(locales)) {
		const english = (locales as { en?: unknown }).en;
		if (isManualDataIndex(english)) {
			return true;
		}
	}
	const pages = candidate.pages;
	return (
		Array.isArray(pages) &&
		!/[\u4e00-\u9fff]/u.test(JSON.stringify(pages)) &&
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

function commandChildren(definition: CommandDefinition): ManualNode[] {
	return definition.children.map((child) => ({
		path: [],
		command: child.command,
		children: commandChildren(child),
	}));
}

function buildManualTree(): ManualNode {
	const rootChildren: ManualNode[] = commandRegistry.map(
		(definition: CommandDefinition) =>
			definition.name === 'version'
				? { path: [], label: 'version', children: [] }
				: {
						path: [],
						command: definition.command,
						children: commandChildren(definition),
					},
	);
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
			? `; default: \`${String(option.defaultValue)}\``
			: '';
	return `- \`${option.flags}\`: ${option.description || 'No description'}${defaultValue}`;
}

function formatSyntheticOption(flags: string, description: string): string {
	return `- \`${flags}\`: ${description}`;
}

function titleFor(pathParts: readonly string[]): string {
	if (pathParts.length === 0) return 'Wave CLI';
	const page = pageForPath(pathParts);
	return page?.title ?? `Wave ${pathParts.join(' ')}`;
}

function pageForPath(
	pathParts: readonly string[],
): ManualPageSummary | undefined {
	const href = commandManual(pathParts)?.href ?? '/command-index';
	return pageByHref.get(href);
}

function defaultBehavior(pathParts: readonly string[]): string {
	if (pathParts.length === 0)
		return 'Prints Markdown for the current command scope without building, writing, prompting, or starting a service.';
	if (pathParts.join(' ') === 'manual')
		return 'Without `-m`, starts the built web manual; with `-m`, prints only this command page.';
	if (pathParts.join(' ') === 'version')
		return 'Displays the current Wave version.';
	if (pathParts[0] === 'token' && pathParts.length === 1)
		return 'Runs token build when no subcommand is provided.';
	if (pathParts[0] === 'token' && pathParts[1] === 'migrate')
		return 'Requires an explicit migration target; manual mode never runs a migration.';
	return 'With `-m`, prints documentation only; without it, runs the command default.';
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
	lines.push('## Scope', '');
	for (const scope of page?.appliesTo ?? ['Local CLI'])
		lines.push(`- ${scope}`);
	lines.push('', '## Usage', '', `\`${commandUsage(pathParts, command)}\``, '');

	if (node.children.length > 0) {
		lines.push('## Commands', '');
		for (const child of node.children) {
			const childName = child.path.at(-1)!;
			lines.push(
				`- \`${childName}\`: ${child.command?.description() ?? 'Command'}`,
			);
		}
		lines.push('');
	}

	const options = command?.options ?? [];
	const optionLines = options.map(formatOption);
	if (!options.some((option) => option.long === '--manual')) {
		optionLines.push(
			formatSyntheticOption('-m, --manual', 'Print Markdown for this command.'),
		);
	}
	if (pathParts.length === 0) {
		optionLines.push(
			formatSyntheticOption('-h, --help', 'Show concise help.'),
			formatSyntheticOption('-v, --version', 'Show the version.'),
		);
	}
	if (optionLines.length > 0) {
		lines.push('## Options', '', ...optionLines, '');
	}

	lines.push(
		'## Default behavior',
		'',
		page?.description ?? titleFor(pathParts),
		defaultBehavior(pathParts),
		'',
	);
	lines.push('## Example', '', '```bash', exampleFor(pathParts), '```', '');

	const related = relatedCommands(node);
	if (related.length > 0) {
		lines.push(
			'## Related commands',
			'',
			...related.map((item) => `- \`wave ${item}\``),
			'',
		);
	}

	if (page?.body?.trim()) {
		lines.push('## Manual reference', '', page.body.trim(), '');
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

type ManualTextLocale = 'zh' | 'en';

interface ManualTextMetadata {
	locales: ManualTextLocale[];
	routes: Array<{ route: string; title: string; locale: ManualTextLocale }>;
}

interface ManualTextSearchEntry {
	route: string;
	locale: ManualTextLocale;
	title: string;
	description: string;
	category: string;
	commands: string[];
	appliesTo: string[];
	searchText: string;
}

interface ManualTextRouteChunk {
	route: string;
	locale: ManualTextLocale;
	rawMarkdown: string;
}

export function normalizeManualText(value: string): string {
	return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function manualTextRouteSegments(route: string): string[] {
	return route.split('/').filter(Boolean);
}

function manualTextChunkPath(
	appDir: string,
	locale: ManualTextLocale,
	route: string,
): string {
	return `${path.join(appDir, 'pages', locale, ...manualTextRouteSegments(route))}.json`;
}

async function readManualTextJson<T>(filePath: string): Promise<T> {
	try {
		return JSON.parse(await fs.promises.readFile(filePath, 'utf-8')) as T;
	} catch {
		throw new ManualTextReaderError();
	}
}

async function manualTextDirectoryExists(directory: string): Promise<boolean> {
	try {
		return (await fs.promises.stat(directory)).isDirectory();
	} catch {
		return false;
	}
}

/** Find the packaged manual first, then the repository development output. */
export async function resolveManualTextAppDir(): Promise<string> {
	const executableDir = path.dirname(process.execPath);
	const candidates = [
		path.join(executableDir, 'manual-app'),
		path.resolve(process.cwd(), 'dist/manual-app'),
		path.resolve(import.meta.dir, '../../dist/manual-app'),
	];
	for (const candidate of candidates) {
		if (await manualTextDirectoryExists(candidate)) return candidate;
	}
	throw new ManualTextReaderError();
}

function ensureSingleTrailingNewline(value: string): string {
	return `${value.replace(/(?:\r\n|\r|\n)+$/gu, '')}\n`;
}

async function readManualTextArtifacts(appDir: string): Promise<{
	metadata: ManualTextMetadata;
	index: ManualTextSearchEntry[];
}> {
	const [metadata, index] = await Promise.all([
		readManualTextJson<ManualTextMetadata>(
			path.join(appDir, 'manual-metadata.json'),
		),
		readManualTextJson<ManualTextSearchEntry[]>(
			path.join(appDir, 'search-index.json'),
		),
	]);
	if (
		!Array.isArray(metadata.routes) ||
		!metadata.routes.every(
			(entry) =>
				entry &&
				typeof entry.route === 'string' &&
				typeof entry.title === 'string' &&
				(entry.locale === 'en' || entry.locale === 'zh'),
		) ||
		!Array.isArray(index) ||
		!index.every(
			(entry) =>
				entry &&
				typeof entry.route === 'string' &&
				typeof entry.title === 'string' &&
				typeof entry.searchText === 'string' &&
				(entry.locale === 'en' || entry.locale === 'zh'),
		)
	) {
		throw new ManualTextReaderError();
	}
	return { metadata, index };
}

function englishManualTextRoutes(
	metadata: ManualTextMetadata,
): Array<{ route: string; title: string }> {
	return metadata.routes
		.filter((entry) => entry.locale === 'en')
		.map(({ route, title }) => ({ route, title }));
}

function exactManualTextMatches(
	entries: ManualTextSearchEntry[],
	query: string,
): ManualTextSearchEntry[] {
	const normalized = normalizeManualText(query).replace(/^\/+|\/+$/gu, '');
	return entries.filter((entry) => {
		if (entry.locale !== 'en') return false;
		const route = normalizeManualText(entry.route).replace(/^\/+|\/+$/gu, '');
		return (
			route === normalized || normalizeManualText(entry.title) === normalized
		);
	});
}

function manualTextSnippet(searchText: string, query: string): string {
	const start = searchText.indexOf(query);
	if (start < 0) return searchText.slice(0, 60);
	const end = Math.min(searchText.length, start + 60);
	return `${searchText.slice(start, end)}${end < searchText.length ? '…' : ''}`;
}

export async function readManualText(
	query = '',
	appDir?: string,
): Promise<ManualTextResult> {
	const resolvedAppDir = appDir ?? (await resolveManualTextAppDir());
	const { metadata, index } = await readManualTextArtifacts(resolvedAppDir);
	const englishIndex = index.filter((entry) => entry.locale === 'en');
	const normalizedQuery = normalizeManualText(query);

	if (!normalizedQuery) {
		const lines = englishManualTextRoutes(metadata).map(
			({ route, title }) => `${route}\t${title}`,
		);
		return {
			stdout: `${lines.join('\n')}\n`,
			exitCode: 0,
		};
	}

	const matches = exactManualTextMatches(englishIndex, normalizedQuery);
	if (matches.length === 1) {
		const match = matches[0]!;
		const chunk = await readManualTextJson<ManualTextRouteChunk>(
			manualTextChunkPath(resolvedAppDir, 'en', match.route),
		);
		if (
			!chunk ||
			chunk.route !== match.route ||
			chunk.locale !== 'en' ||
			typeof chunk.rawMarkdown !== 'string'
		) {
			throw new ManualTextReaderError();
		}
		return {
			stdout: ensureSingleTrailingNewline(chunk.rawMarkdown),
			exitCode: 0,
		};
	}
	if (matches.length > 1) {
		return {
			stdout: '',
			stderr: `${matches.map((entry) => entry.route).join('\n')}\n`,
			exitCode: 1,
		};
	}

	const hits = englishIndex
		.filter((entry) => entry.searchText.includes(normalizedQuery))
		.slice(0, 8)
		.map(
			(entry) =>
				`${entry.route}\t${entry.title}\t${manualTextSnippet(entry.searchText, normalizedQuery)}`,
		);
	if (hits.length === 0) return { stdout: 'No matches.\n', exitCode: 1 };
	return { stdout: `${hits.join('\n')}\n`, exitCode: 0 };
}
