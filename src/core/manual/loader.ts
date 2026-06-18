import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { parseManualMarkdown } from './markdown.ts';
import {
	type LoadedManual,
	type LoadManualOptions,
	type ManualConfig,
	type ManualHomeCardConfig,
	ManualLoadError,
	type ManualNavPageConfig,
	type ManualNavSectionConfig,
	type ManualPage,
	type ManualSiteConfig,
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
		description: readString(site, 'description', sourcePath),
		basePath,
	};
}

function parseHomeCard(raw: unknown, sourcePath: string): ManualHomeCardConfig {
	const card = asRecord(raw, 'home.cards item', sourcePath);
	const href = readString(card, 'href', sourcePath);
	assertHref(href, sourcePath);
	return {
		title: readString(card, 'title', sourcePath),
		description: readString(card, 'description', sourcePath),
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
	return {
		title: readString(page, 'title', sourcePath),
		href,
		source,
	};
}

function parseNavSection(
	raw: unknown,
	sourcePath: string,
): ManualNavSectionConfig {
	const section = asRecord(raw, 'nav section', sourcePath);
	return {
		title: readString(section, 'title', sourcePath),
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

export async function loadManual(
	options: LoadManualOptions = {},
): Promise<LoadedManual> {
	const rootDir = options.rootDir ?? process.cwd();
	const manualDir = path.join(rootDir, DEFAULT_MANUAL_DIR);
	const configPath =
		options.configPath ?? path.join(manualDir, DEFAULT_CONFIG_FILE);
	const config = await readYamlConfig(configPath);
	const hrefs = new Map<string, string>();
	const sources = new Map<string, string>();
	const pages: ManualPage[] = [];

	for (const section of config.nav) {
		for (const pageConfig of section.pages) {
			assertUnique(pageConfig.href, hrefs, 'href', pageConfig.source);
			assertUnique(pageConfig.source, sources, 'source', pageConfig.source);
			const sourcePath = path.join(manualDir, pageConfig.source);
			let raw: string;
			try {
				raw = await fs.readFile(sourcePath, 'utf-8');
			} catch (error) {
				throw new ManualLoadError(
					`Failed to read manual page: ${error instanceof Error ? error.message : String(error)}`,
					sourcePath,
				);
			}
			const parsed = parseManualMarkdown(raw, sourcePath);
			if (parsed.frontmatter.title !== pageConfig.title) {
				throw new ManualLoadError(
					`Page title "${parsed.frontmatter.title}" does not match nav title "${pageConfig.title}"`,
					sourcePath,
				);
			}
			pages.push({
				...parsed.frontmatter,
				href: pageConfig.href,
				source: pageConfig.source,
				body: parsed.body,
			});
		}
	}

	for (const card of config.home.cards) {
		if (!hrefs.has(card.href)) {
			throw new ManualLoadError(
				`Home card href does not match any nav page "${card.href}"`,
				configPath,
			);
		}
	}

	let pageIndex = 0;
	return {
		site: config.site,
		home: config.home,
		sections: config.nav.map((section) => ({
			title: section.title,
			pages: section.pages.map(() => pages[pageIndex++]!),
		})),
		pages,
	};
}
