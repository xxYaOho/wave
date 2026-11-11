import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { marked } from 'marked';
import { loadManualLocales } from './loader.ts';
import type {
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

	await fs.mkdir(options.outDir, { recursive: true });
	await fs.writeFile(
		path.join(options.outDir, 'manual-data.json'),
		`${JSON.stringify(data, null, 2)}\n`,
		'utf-8',
	);

	return data;
}
