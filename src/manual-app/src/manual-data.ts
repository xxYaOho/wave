import type {
	ManualMetadata,
	ManualRouteData,
	ManualSearchIndexEntry,
} from '../../core/manual/build.ts';
import type {
	Locale,
	ManualData,
	ManualDataPage,
	ManualDataView,
} from '../../core/manual/types.ts';

export type ManualShell = ManualMetadata | ManualData;

let searchIndexPromise: Promise<ManualSearchIndexEntry[]> | null = null;
let searchIndexFetcher: typeof fetch | null = null;

async function readJson<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load ${url}: ${response.status}`);
	}
	return (await response.json()) as T;
}

function hasLegacyShape(value: unknown): value is ManualData {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as { pages?: unknown };
	return (
		Array.isArray(candidate.pages) &&
		candidate.pages.every(
			(page) =>
				page &&
				typeof page === 'object' &&
				typeof (page as { href?: unknown }).href === 'string',
		)
	);
}

function hasMetadataShape(value: unknown): value is ManualMetadata {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<ManualMetadata>;
	return (
		Array.isArray(candidate.locales) &&
		Array.isArray(candidate.routes) &&
		Array.isArray(candidate.sections) &&
		Array.isArray(candidate.nav) &&
		!!candidate.config &&
		typeof candidate.config === 'object'
	);
}

/** Load only the lightweight shell. Legacy payloads remain accepted for old builds. */
export async function loadManualShell(): Promise<ManualShell> {
	const value: unknown = await readJson('/manual-metadata.json');
	if (hasMetadataShape(value) || hasLegacyShape(value)) return value;
	throw new Error('Invalid manual metadata payload');
}

/** Existing callers can still request the legacy all-in-one payload explicitly. */
export async function loadManualData(): Promise<ManualData> {
	return readJson<ManualData>('/manual-data.json');
}

export function routeFromHref(href: string): string {
	return href.replace(/^\/+|\/+$/gu, '') || 'index';
}

export function hrefFromRoute(route: string): string {
	return route === 'index' ? '/' : `/${route}`;
}

export function normalizeManualQuery(value: string): string {
	return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function metadataPage(
	page: ManualMetadata['sections'][number]['pages'][number],
	locale: Locale,
): ManualDataPage {
	return {
		title: locale === 'en' ? page.titleEn : page.title,
		description: '',
		category: '',
		commands: [],
		appliesTo: [],
		href: page.href,
		source: locale === 'en' ? page.sourceEn : page.source,
		body: '',
		html: '',
		searchText: '',
	};
}

/** Project the bilingual metadata shell into the historical view shape used by the UI. */
export function selectMetadataView(
	data: ManualMetadata,
	locale: Locale,
): ManualDataView {
	const sections = data.sections.map((section) => ({
		title: locale === 'en' ? section.titleEn : section.title,
		pages: section.pages.map((page) => metadataPage(page, locale)),
	}));
	const pages = sections.flatMap((section) => section.pages);
	const cards = data.config.home.cards.map((card) => ({
		title: locale === 'en' ? card.titleEn : card.title,
		description: locale === 'en' ? card.descriptionEn : card.description,
		href: card.href,
		command: card.command,
	}));
	return {
		site: {
			title:
				locale === 'en' ? data.config.site.titleEn : data.config.site.title,
			description:
				locale === 'en'
					? data.config.site.descriptionEn
					: data.config.site.description,
			basePath: data.config.site.basePath,
		},
		home: { cards },
		sections,
		nav: sections,
		pages,
	};
}

export function selectManualView(
	data: ManualData,
	locale: Locale,
): ManualDataView | ManualData {
	return data.locales?.[locale] ?? data.locales?.en ?? data;
}

function findMetadataPage(
	metadata: ManualMetadata,
	route: string,
): ManualMetadata['sections'][number]['pages'][number] | undefined {
	return metadata.sections
		.flatMap((section) => section.pages)
		.find((page) => routeFromHref(page.href) === route);
}

function routeDataToPage(
	data: ManualRouteData,
	metadata: ManualMetadata,
): ManualDataPage {
	const metadataPage = findMetadataPage(metadata, data.route);
	return {
		title: data.title,
		description: data.description,
		category: data.category,
		commands: data.commands,
		appliesTo: data.appliesTo,
		href: hrefFromRoute(data.route),
		source:
			data.locale === 'en'
				? (metadataPage?.sourceEn ?? '')
				: (metadataPage?.source ?? ''),
		body: data.rawMarkdown,
		html: data.html,
		searchText: data.searchText,
	};
}

export async function loadManualPage(
	metadata: ManualMetadata,
	locale: Locale,
	route: string,
): Promise<ManualDataPage> {
	const chunkUrl = `/pages/${locale}/${route}.json`;
	try {
		const chunk = await readJson<ManualRouteData>(chunkUrl);
		if (!chunk || chunk.locale !== locale || chunk.route !== route) {
			throw new Error('Invalid manual route payload');
		}
		return routeDataToPage(chunk, metadata);
	} catch (routeError) {
		try {
			const legacy = await loadManualData();
			const view = selectManualView(legacy, locale);
			const page = view.pages.find(
				(candidate) => candidate.href === hrefFromRoute(route),
			);
			if (!page) throw routeError;
			return page;
		} catch {
			throw routeError;
		}
	}
}

export function loadManualSearchIndex(): Promise<ManualSearchIndexEntry[]> {
	if (!searchIndexPromise || searchIndexFetcher !== globalThis.fetch) {
		searchIndexFetcher = globalThis.fetch;
		searchIndexPromise = readJson<ManualSearchIndexEntry[]>(
			'/search-index.json',
		).catch((error) => {
			searchIndexPromise = null;
			searchIndexFetcher = null;
			throw error;
		});
	}
	return searchIndexPromise;
}
