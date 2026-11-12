import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	buildManualData,
	type ManualMetadata,
	type ManualRouteData,
	type ManualSearchIndexEntry,
	normalizeManualSearchText,
} from '../src/core/manual/build.ts';
import type { Locale } from '../src/core/manual/types.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const baseline = await Bun.file(
	path.join(import.meta.dir, 'm1-legacy-baseline.json'),
).json();

interface LegacyPage {
	href: string;
	searchText: string;
}

interface LegacyView {
	pages: LegacyPage[];
}

interface LegacyData {
	locales: Record<Locale, LegacyView>;
	pages: LegacyPage[];
	sections: Array<Record<string, unknown>>;
}

async function readJson<T>(filePath: string): Promise<T> {
	return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
}

function routeFromHref(href: string): string {
	return href.replace(/^\/+|\/+$/gu, '') || 'index';
}

function routePath(outDir: string, locale: Locale, route: string): string {
	return `${path.join(outDir, 'pages', locale, ...route.split('/'))}.json`;
}

function rawBodyAfterFrontmatter(source: string): string {
	const delimiter = source.match(
		/^---[ \t]*\r?\n[\s\S]*?^---[ \t]*(?:\r?\n|$)/mu,
	);
	return delimiter ? source.slice(delimiter[0].length) : source;
}

function collectKeys(
	value: unknown,
	keys: Set<string> = new Set(),
): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, keys);
		return keys;
	}
	if (!value || typeof value !== 'object') return keys;
	for (const [key, child] of Object.entries(value)) {
		keys.add(key);
		collectKeys(child, keys);
	}
	return keys;
}

function sha256(value: Uint8Array): string {
	return createHash('sha256').update(value).digest('hex');
}

describe('M1 manual build artifacts', () => {
	test('writes the metadata shell, route chunks, bilingual index, and legacy data', async () => {
		const outDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'wave-m1-artifacts-'),
		);
		try {
			await buildManualData({ rootDir, outDir });
			const metadata = await readJson<ManualMetadata>(
				path.join(outDir, 'manual-metadata.json'),
			);
			const index = await readJson<ManualSearchIndexEntry[]>(
				path.join(outDir, 'search-index.json'),
			);
			const legacyBytes = await fs.readFile(
				path.join(outDir, 'manual-data.json'),
			);
			const legacy = JSON.parse(legacyBytes.toString('utf-8')) as LegacyData;

			expect(
				Buffer.byteLength(JSON.stringify(metadata), 'utf-8'),
			).toBeLessThanOrEqual(50 * 1024);
			expect(collectKeys(metadata)).not.toContain('body');
			expect(collectKeys(metadata)).not.toContain('html');
			expect(collectKeys(metadata)).not.toContain('searchText');
			expect(collectKeys(metadata)).not.toContain('rawMarkdown');
			expect(metadata.locales).toEqual(['zh', 'en']);
			expect(metadata.routes).toHaveLength(legacy.pages.length * 2);
			expect(metadata.sections).toHaveLength(metadata.nav.length);
			expect(index).toHaveLength(legacy.pages.length * 2);

			const expectedRoutes = new Map<Locale, string[]>([
				[
					'zh',
					legacy.locales.zh.pages.map((page: { href: string }) =>
						routeFromHref(page.href),
					),
				],
				[
					'en',
					legacy.locales.en.pages.map((page: { href: string }) =>
						routeFromHref(page.href),
					),
				],
			]);
			for (const locale of ['zh', 'en'] as const) {
				const entries = index.filter((entry) => entry.locale === locale);
				expect(entries.map((entry) => entry.route)).toEqual(
					expectedRoutes.get(locale)!,
				);
				for (const entry of entries) {
					expect(entry.searchText).toBe(
						normalizeManualSearchText(entry.searchText),
					);
					expect(entry.searchText).not.toMatch(/\s{2,}/u);
					const chunk = await readJson<ManualRouteData>(
						routePath(outDir, locale, entry.route),
					);
					expect(Object.keys(chunk).sort()).toEqual(
						[
							'appliesTo',
							'category',
							'commands',
							'description',
							'html',
							'locale',
							'rawMarkdown',
							'route',
							'searchText',
							'title',
						].sort(),
					);
					expect(
						Buffer.byteLength(JSON.stringify(chunk), 'utf-8'),
					).toBeLessThanOrEqual(100 * 1024);
					expect(chunk.locale).toBe(locale);
					expect(chunk.route).toBe(entry.route);
				}
			}

			for (const [locale, source] of [
				['en', 'manual/pages-en/quickstart.md'],
				['zh', 'manual/pages/quickstart.md'],
			] as const) {
				const sourceText = await fs.readFile(
					path.join(rootDir, source),
					'utf-8',
				);
				const chunk = await readJson<ManualRouteData>(
					routePath(outDir, locale, 'quickstart'),
				);
				expect(chunk.rawMarkdown).toBe(rawBodyAfterFrontmatter(sourceText));
			}

			const publicMetadata = await readJson<ManualMetadata>(
				path.join(rootDir, 'src/manual-app/public/manual-metadata.json'),
			);
			expect(publicMetadata).toEqual(metadata);
			const publicLegacy = await fs.readFile(
				path.join(rootDir, 'src/manual-app/public/manual-data.json'),
				'utf-8',
			);
			expect(sha256(Buffer.from(publicLegacy))).toBe(sha256(legacyBytes));
		} finally {
			await fs.rm(outDir, { recursive: true, force: true });
		}
	});

	test('keeps the legacy artifact byte-for-byte stable and aligns fallback search values', async () => {
		const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-m1-legacy-'));
		try {
			const data = await buildManualData({ rootDir, outDir });
			const bytes = await fs.readFile(path.join(outDir, 'manual-data.json'));
			const legacy = JSON.parse(bytes.toString('utf-8')) as LegacyData;

			expect(sha256(bytes)).toBe(baseline.sha256);
			expect(bytes.byteLength).toBe(baseline.bytes);
			expect(Object.keys(legacy)).toEqual(baseline.topLevelKeys);
			expect(Object.keys(legacy.locales.en)).toEqual(baseline.viewKeys);
			expect(Object.keys(legacy.pages[0]!)).toEqual(baseline.pageKeys);
			expect(Object.keys(legacy.sections[0]!)).toEqual(baseline.sectionKeys);
			expect(Object.keys(legacy.locales)).toEqual(baseline.localeKeys);
			expect(legacy.pages).toHaveLength(baseline.pageCount);

			for (const locale of ['zh', 'en'] as const) {
				const chunks = await Promise.all(
					data.locales![locale].pages.map(async (page) =>
						readJson<ManualRouteData>(
							routePath(outDir, locale, routeFromHref(page.href)),
						),
					),
				);
				for (let index = 0; index < chunks.length; index += 1) {
					const chunk = chunks[index]!;
					expect(normalizeManualSearchText(chunk.searchText)).toBe(
						normalizeManualSearchText(
							data.locales![locale].pages[index]!.searchText,
						),
					);
				}
			}
		} finally {
			await fs.rm(outDir, { recursive: true, force: true });
		}
	});
});
