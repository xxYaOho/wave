import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { marked } from 'marked';
import { loadManual } from './loader.ts';
import type {
	LoadedManual,
	ManualData,
	ManualDataPage,
	ManualPage,
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

function renderMarkdown(body: string): string {
	const renderer = new marked.Renderer();
	renderer.html = ({ text }) => escapeHtml(text);
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

function toManualData(source: LoadedManual): ManualData {
	const pageByHref = new Map<string, ManualDataPage>();
	const pages = source.pages.map((page) => {
		const dataPage = pageToData(page);
		pageByHref.set(dataPage.href, dataPage);
		return dataPage;
	});

	return {
		site: source.site,
		home: source.home,
		pages,
		sections: source.sections.map((section) => ({
			title: section.title,
			pages: section.pages.map((page) => pageByHref.get(page.href)!),
		})),
	};
}

export async function buildManualData(
	options: BuildManualDataOptions,
): Promise<ManualData> {
	const source = await loadManual({ rootDir: options.rootDir });
	const data = toManualData(source);

	await fs.mkdir(options.outDir, { recursive: true });
	await fs.writeFile(
		path.join(options.outDir, 'manual-data.json'),
		`${JSON.stringify(data, null, 2)}\n`,
		'utf-8',
	);

	return data;
}
