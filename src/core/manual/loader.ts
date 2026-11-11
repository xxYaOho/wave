import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { parseManualMarkdown } from './markdown.ts';
import {
	type LoadedManual,
	type LoadManualOptions,
	type Locale,
	type ManualConfig,
	type ManualHomeCardConfig,
	ManualLoadError,
	type ManualNavPageConfig,
	type ManualNavSectionConfig,
	type ManualPage,
	type ManualSiteConfig,
	type ManualView,
} from './types.ts';

const DEFAULT_MANUAL_DIR = 'manual';
const DEFAULT_CONFIG_FILE = 'manual.config.yaml';

function asRecord(value: unknown, label: string, sourcePath: string) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ManualLoadError(`${label} must be an object`, sourcePath);
	}
	return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string, sourcePath: string) {
	if (!Array.isArray(value) || value.length === 0) {
		throw new ManualLoadError(`${label} must be a non-empty array`, sourcePath);
	}
	return value;
}

function readString(
	data: Record<string, unknown>,
	key: string,
	sourcePath: string,
): string {
	const value = data[key];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ManualLoadError(`Missing required config "${key}"`, sourcePath);
	}
	return value.trim();
}

function readLocalizedString(
	data: Record<string, unknown>,
	key: string,
	fallbackKey: string,
	sourcePath: string,
): string {
	const value = data[key];
	if (value === undefined) return readString(data, fallbackKey, sourcePath);
	return readString(data, key, sourcePath);
}

function assertHref(href: string, sourcePath: string) {
	if (!href.startsWith('/') || href.startsWith('//') || href.includes('..')) {
		throw new ManualLoadError(`Invalid manual href "${href}"`, sourcePath);
	}
}

function assertSource(source: string, sourcePath: string) {
	if (
		source.startsWith('/') ||
		source.includes('..') ||
		!source.endsWith('.md')
	) {
		throw new ManualLoadError(`Invalid manual source "${source}"`, sourcePath);
	}
}

function parseSite(raw: unknown, sourcePath: string): ManualSiteConfig {
	const site = asRecord(raw, 'site', sourcePath);
	const basePath = readString(site, 'basePath', sourcePath);
	if (!basePath.startsWith('/')) {
		throw new ManualLoadError('site.basePath must start with "/"', sourcePath);
	}
	return {
		title: readString(site, 'title', sourcePath),
		titleEn: readLocalizedString(site, 'titleEn', 'title', sourcePath),
		description: readString(site, 'description', sourcePath),
		descriptionEn: readLocalizedString(
			site,
			'descriptionEn',
			'description',
			sourcePath,
		),
		basePath,
	};
}

function parseHomeCard(raw: unknown, sourcePath: string): ManualHomeCardConfig {
	const card = asRecord(raw, 'home.cards item', sourcePath);
	const href = readString(card, 'href', sourcePath);
	assertHref(href, sourcePath);
	return {
		title: readString(card, 'title', sourcePath),
		titleEn: readLocalizedString(card, 'titleEn', 'title', sourcePath),
		description: readString(card, 'description', sourcePath),
		descriptionEn: readLocalizedString(
			card,
			'descriptionEn',
			'description',
			sourcePath,
		),
		href,
		command: readString(card, 'command', sourcePath),
	};
}

function parseNavPage(raw: unknown, sourcePath: string): ManualNavPageConfig {
	const page = asRecord(raw, 'nav page', sourcePath);
	const href = readString(page, 'href', sourcePath);
	const source = readString(page, 'source', sourcePath);
	assertHref(href, sourcePath);
	assertSource(source, sourcePath);
	const sourceEn = readLocalizedString(page, 'sourceEn', 'source', sourcePath);
	assertSource(sourceEn, sourcePath);
	return {
		title: readString(page, 'title', sourcePath),
		titleEn: readLocalizedString(page, 'titleEn', 'title', sourcePath),
		href,
		source,
		sourceEn,
	};
}

function parseNavSection(
	raw: unknown,
	sourcePath: string,
): ManualNavSectionConfig {
	const section = asRecord(raw, 'nav section', sourcePath);
	return {
		title: readString(section, 'title', sourcePath),
		titleEn: readLocalizedString(section, 'titleEn', 'title', sourcePath),
		pages: asArray(section.pages, 'nav section pages', sourcePath).map((page) =>
			parseNavPage(page, sourcePath),
		),
	};
}

function parseConfig(raw: unknown, sourcePath: string): ManualConfig {
	const root = asRecord(raw, 'manual config', sourcePath);
	const home = asRecord(root.home, 'home', sourcePath);
	return {
		site: parseSite(root.site, sourcePath),
		home: {
			cards: asArray(home.cards, 'home.cards', sourcePath).map((card) =>
				parseHomeCard(card, sourcePath),
			),
		},
		nav: asArray(root.nav, 'nav', sourcePath).map((section) =>
			parseNavSection(section, sourcePath),
		),
	};
}

async function readYamlConfig(configPath: string): Promise<ManualConfig> {
	try {
		const raw = await fs.readFile(configPath, 'utf-8');
		return parseConfig(yaml.load(raw), configPath);
	} catch (error) {
		if (error instanceof ManualLoadError) throw error;
		throw new ManualLoadError(
			`Failed to load manual config: ${error instanceof Error ? error.message : String(error)}`,
			configPath,
		);
	}
}

function assertUnique(
	value: string,
	seen: Map<string, string>,
	label: string,
	sourcePath: string,
) {
	const previous = seen.get(value);
	if (previous) {
		throw new ManualLoadError(
			`Duplicate ${label} "${value}" in ${previous} and ${sourcePath}`,
		);
	}
	seen.set(value, sourcePath);
}

async function loadLocale(
	rootDir: string,
	config: ManualConfig,
	locale: Locale,
): Promise<ManualView> {
	const manualDir = path.join(rootDir, DEFAULT_MANUAL_DIR);
	const hrefs = new Map<string, string>();
	const sources = new Map<string, string>();
	const pages: ManualPage[] = [];
	for (const section of config.nav) {
		for (const pageConfig of section.pages) {
			const source =
				locale === 'en'
					? (pageConfig.sourceEn ?? pageConfig.source)
					: pageConfig.source;
			assertUnique(pageConfig.href, hrefs, 'href', source);
			assertUnique(source, sources, 'source', source);
			const sourcePath = path.join(manualDir, source);
			let raw: string;
			try {
				raw = await fs.readFile(sourcePath, 'utf-8');
			} catch (error) {
				if (
					locale === 'en' &&
					(pageConfig.sourceEn ?? pageConfig.source) === pageConfig.source
				) {
					// Legacy or temporary configs without an English source keep the
					// original loader contract; the production config always declares
					// distinct pages-en sources.
					raw = await fs.readFile(
						path.join(manualDir, pageConfig.source),
						'utf-8',
					);
				} else {
					throw new ManualLoadError(
						`Failed to read manual page: ${error instanceof Error ? error.message : String(error)}`,
						sourcePath,
					);
				}
			}
			const parsed = parseManualMarkdown(raw, sourcePath);
			const expectedTitle =
				locale === 'en'
					? (pageConfig.titleEn ?? pageConfig.title)
					: pageConfig.title;
			if (parsed.frontmatter.title !== expectedTitle) {
				throw new ManualLoadError(
					`Page title "${parsed.frontmatter.title}" does not match nav title "${expectedTitle}"`,
					sourcePath,
				);
			}
			pages.push({
				...parsed.frontmatter,
				href: pageConfig.href,
				source,
				body: parsed.body,
			});
		}
	}

	const cards = config.home.cards.map((card) => ({
		title: locale === 'en' ? (card.titleEn ?? card.title) : card.title,
		description:
			locale === 'en'
				? (card.descriptionEn ?? card.description)
				: card.description,
		href: card.href,
		command: card.command,
	}));
	for (const card of cards) {
		if (!hrefs.has(card.href)) {
			throw new ManualLoadError(
				`Home card href does not match any nav page "${card.href}"`,
				path.join(manualDir, DEFAULT_CONFIG_FILE),
			);
		}
	}

	let pageIndex = 0;
	const sections = config.nav.map((section) => ({
		title: locale === 'en' ? (section.titleEn ?? section.title) : section.title,
		pages: section.pages.map(() => pages[pageIndex++]!),
	}));
	return {
		site: {
			title:
				locale === 'en'
					? (config.site.titleEn ?? config.site.title)
					: config.site.title,
			description:
				locale === 'en'
					? (config.site.descriptionEn ?? config.site.description)
					: config.site.description,
			basePath: config.site.basePath,
		},
		home: { cards },
		sections,
		nav: sections,
		pages: pages as ManualView['pages'],
	};
}

export async function loadManual(
	options: LoadManualOptions = {},
): Promise<LoadedManual> {
	const rootDir = options.rootDir ?? process.cwd();
	const configPath =
		options.configPath ??
		path.join(rootDir, DEFAULT_MANUAL_DIR, DEFAULT_CONFIG_FILE);
	const config = await readYamlConfig(configPath);
	const [zh, en] = await Promise.all([
		loadLocale(rootDir, config, 'zh'),
		loadLocale(rootDir, config, 'en'),
	]);
	return { ...zh, locales: { zh, en } };
}

export async function loadManualLocales(
	options: LoadManualOptions = {},
): Promise<Record<Locale, ManualView>> {
	const rootDir = options.rootDir ?? process.cwd();
	const configPath =
		options.configPath ??
		path.join(rootDir, DEFAULT_MANUAL_DIR, DEFAULT_CONFIG_FILE);
	const config = await readYamlConfig(configPath);
	const [zh, en] = await Promise.all([
		loadLocale(rootDir, config, 'zh'),
		loadLocale(rootDir, config, 'en'),
	]);
	return { zh, en };
}
