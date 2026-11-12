import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { marked } from 'marked';
import { loadManualLocales } from './loader.ts';
import type {
	Locale,
	ManualData,
	ManualDataPage,
	ManualDataView,
	ManualPage,
	ManualView,
} from './types.ts';

export interface BuildManualDataOptions {
	rootDir: string;
	outDir: string;
}

/** The lightweight document consumed before a route body is requested. */
export interface ManualMetadata {
	locales: Locale[];
	routes: Array<{ route: string; title: string; locale: Locale }>;
	sections: ManualMetadataSection[];
	nav: ManualMetadataSection[];
	config: {
		site: {
			title: string;
			titleEn: string;
			description: string;
			descriptionEn: string;
			basePath: string;
		};
		home: {
			cards: Array<{
				title: string;
				titleEn: string;
				description: string;
				descriptionEn: string;
				href: string;
				command: string;
			}>;
		};
	};
}

export interface ManualMetadataSection {
	title: string;
	titleEn: string;
	pages: Array<{
		title: string;
		titleEn: string;
		href: string;
		source: string;
		sourceEn: string;
	}>;
}

export interface ManualRouteData {
	route: string;
	locale: Locale;
	title: string;
	description: string;
	category: string;
	commands: string[];
	appliesTo: string[];
	html: string;
	searchText: string;
	rawMarkdown: string;
}

export interface ManualSearchIndexEntry {
	route: string;
	locale: Locale;
	title: string;
	description: string;
	category: string;
	commands: string[];
	appliesTo: string[];
	searchText: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeMarkdownUrl(value: string): string | null {
	const trimmed = value.trim();
	const lower = trimmed.toLowerCase();

	if (
		lower.startsWith('http://') ||
		lower.startsWith('https://') ||
		lower.startsWith('mailto:') ||
		trimmed.startsWith('#') ||
		(trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
		trimmed.startsWith('./') ||
		trimmed.startsWith('../')
	) {
		return escapeHtml(trimmed);
	}

	return null;
}

function safeTitleAttribute(value?: string | null): string {
	return value ? ` title="${escapeHtml(value)}"` : '';
}

function renderMarkdown(body: string): string {
	const renderer = new marked.Renderer();
	renderer.html = ({ text }) => escapeHtml(text);
	renderer.link = ({ href, title, tokens }) => {
		const text = renderer.parser.parseInline(tokens);
		const safeHref = safeMarkdownUrl(href);
		if (!safeHref) return text;

		return `<a href="${safeHref}"${safeTitleAttribute(title)}>${text}</a>`;
	};
	renderer.image = ({ href, title, text, tokens }) => {
		const alt = tokens
			? renderer.parser.parseInline(tokens, renderer.parser.textRenderer)
			: text;
		const safeHref = safeMarkdownUrl(href);
		if (!safeHref) return escapeHtml(alt);

		return `<img src="${safeHref}" alt="${escapeHtml(alt)}"${safeTitleAttribute(title)}>`;
	};

	return marked.parse(body, { async: false, renderer }) as string;
}

function stripRawHtml(value: string): string {
	return value.replace(/<[^>]*>/g, ' ');
}

/**
 * Keep the legacy search source intact and normalize only the index copy.
 * NFKC makes full-width punctuation and compatibility forms searchable using
 * the same query as their canonical equivalents.
 */
export function normalizeManualSearchText(value: string): string {
	return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function routeFromHref(href: string): string {
	const route = href.replace(/^\/+|\/+$/gu, '');
	return route || 'index';
}

function routeFilePath(outDir: string, locale: Locale, route: string): string {
	const routeSegments = route.split('/').filter(Boolean);
	return `${path.join(outDir, 'pages', locale, ...routeSegments)}.json`;
}

/**
 * The markdown parser intentionally trims the body for HTML rendering. The
 * terminal reader needs the exact source slice after the closing frontmatter
 * delimiter, so extract that slice independently.
 */
function extractRawMarkdown(source: string): string {
	let cursor = source.startsWith('\uFEFF') ? 1 : 0;
	const firstLineEnd = source.indexOf('\n', cursor);
	if (firstLineEnd < 0) return source;
	const firstLine = source
		.slice(cursor, firstLineEnd)
		.replace(/\r$/u, '')
		.trim();
	if (firstLine !== '---') return source;

	cursor = firstLineEnd + 1;
	while (cursor <= source.length) {
		const lineEnd = source.indexOf('\n', cursor);
		const end = lineEnd < 0 ? source.length : lineEnd;
		const line = source.slice(cursor, end).replace(/\r$/u, '').trim();
		if (line === '---') {
			return source.slice(lineEnd < 0 ? source.length : lineEnd + 1);
		}
		if (lineEnd < 0) break;
		cursor = lineEnd + 1;
	}

	return source;
}

function pageToData(page: ManualPage): ManualDataPage {
	const safeBody = escapeHtml(page.body);
	const searchText = [
		page.title,
		page.description,
		page.category,
		...page.commands,
		...page.appliesTo,
		stripRawHtml(page.body),
	].join('\n');

	return {
		...page,
		body: safeBody,
		html: renderMarkdown(page.body),
		searchText,
	};
}

function toManualDataView(source: ManualView): ManualDataView {
	const pageByHref = new Map<string, ManualDataPage>();
	const pages = source.pages.map((page) => {
		const dataPage = pageToData(page);
		pageByHref.set(dataPage.href, dataPage);
		return dataPage;
	});

	const sections = source.sections.map((section) => ({
		title: section.title,
		pages: section.pages.map((page) => pageByHref.get(page.href)!),
	}));

	return {
		site: source.site,
		home: source.home,
		pages,
		sections,
		nav: sections,
	};
}

function buildMetadataSections(
	zh: ManualView,
	en: ManualView,
): ManualMetadataSection[] {
	return zh.sections.map((section, sectionIndex) => {
		const englishSection = en.sections[sectionIndex];
		return {
			title: section.title,
			titleEn: englishSection?.title ?? section.title,
			pages: section.pages.map((page, pageIndex) => {
				const englishPage = englishSection?.pages[pageIndex];
				return {
					title: page.title,
					titleEn: englishPage?.title ?? page.title,
					href: page.href,
					source: page.source,
					sourceEn: englishPage?.source ?? page.source,
				};
			}),
		};
	});
}

function buildMetadataConfig(
	zh: ManualView,
	en: ManualView,
): ManualMetadata['config'] {
	return {
		site: {
			title: zh.site.title,
			titleEn: en.site.title,
			description: zh.site.description,
			descriptionEn: en.site.description,
			basePath: zh.site.basePath,
		},
		home: {
			cards: zh.home.cards.map((card, index) => {
				const englishCard = en.home.cards[index];
				return {
					title: card.title,
					titleEn: englishCard?.title ?? card.title,
					description: card.description,
					descriptionEn: englishCard?.description ?? card.description,
					href: card.href,
					command: card.command,
				};
			}),
		},
	};
}

function buildMetadata(views: Record<Locale, ManualView>): ManualMetadata {
	const locales: Locale[] = ['zh', 'en'];
	const sections = buildMetadataSections(views.zh, views.en);
	const routes = locales.flatMap((locale) =>
		views[locale].pages.map((page) => ({
			route: routeFromHref(page.href),
			title: page.title,
			locale,
		})),
	);

	return {
		locales,
		routes,
		sections,
		nav: sections,
		config: buildMetadataConfig(views.zh, views.en),
	};
}

async function buildRouteArtifacts(
	rootDir: string,
	views: Record<Locale, ManualView>,
	data: ManualData,
): Promise<{
	routes: ManualRouteData[];
	index: ManualSearchIndexEntry[];
}> {
	const routes: ManualRouteData[] = [];
	const index: ManualSearchIndexEntry[] = [];

	for (const locale of ['zh', 'en'] as const) {
		const dataView = data.locales?.[locale];
		if (!dataView) continue;
		for (
			let pageIndex = 0;
			pageIndex < views[locale].pages.length;
			pageIndex += 1
		) {
			const page = views[locale].pages[pageIndex]!;
			const dataPage = dataView.pages[pageIndex]!;
			const sourcePath = path.join(rootDir, 'manual', page.source);
			const source = await fs.readFile(sourcePath, 'utf-8');
			const route = routeFromHref(page.href);
			const routeData: ManualRouteData = {
				route,
				locale,
				title: dataPage.title,
				description: dataPage.description,
				category: dataPage.category,
				commands: dataPage.commands,
				appliesTo: dataPage.appliesTo,
				html: dataPage.html,
				searchText: dataPage.searchText,
				rawMarkdown: extractRawMarkdown(source),
			};
			routes.push(routeData);
			index.push({
				route,
				locale,
				title: dataPage.title,
				description: dataPage.description,
				category: dataPage.category,
				commands: dataPage.commands,
				appliesTo: dataPage.appliesTo,
				searchText: normalizeManualSearchText(dataPage.searchText),
			});
		}
	}

	return { routes, index };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function writeSplitArtifacts(
	rootDir: string,
	outDir: string,
	views: Record<Locale, ManualView>,
	data: ManualData,
	legacyJson: string,
): Promise<void> {
	const metadata = buildMetadata(views);
	const { routes, index } = await buildRouteArtifacts(rootDir, views, data);
	const targets = [outDir, path.join(rootDir, 'src/manual-app/public')];

	for (const target of targets) {
		await fs.mkdir(target, { recursive: true });
		await fs.writeFile(
			path.join(target, 'manual-data.json'),
			legacyJson,
			'utf-8',
		);
		await writeJson(path.join(target, 'manual-metadata.json'), metadata);
		await writeJson(path.join(target, 'search-index.json'), index);
		for (const routeData of routes) {
			await writeJson(
				routeFilePath(target, routeData.locale, routeData.route),
				routeData,
			);
		}
	}
}

export async function createManualData(rootDir: string): Promise<ManualData> {
	const source = await loadManualLocales({ rootDir });
	const locales = {
		zh: toManualDataView(source.zh),
		en: toManualDataView(source.en),
	};

	return {
		...locales.en,
		locales,
	};
}

export async function buildManualData(
	options: BuildManualDataOptions,
): Promise<ManualData> {
	const data = await createManualData(options.rootDir);
	const source = await loadManualLocales({ rootDir: options.rootDir });
	const legacyJson = `${JSON.stringify(data, null, 2)}\n`;

	await fs.mkdir(options.outDir, { recursive: true });
	await writeSplitArtifacts(
		options.rootDir,
		options.outDir,
		source,
		data,
		legacyJson,
	);

	return data;
}
