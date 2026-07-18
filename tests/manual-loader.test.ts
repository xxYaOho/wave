import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildManualData } from '../src/core/manual/build.ts';
import { loadManual } from '../src/core/manual/loader.ts';
import { ManualLoadError } from '../src/core/manual/types.ts';

const rootDir = path.resolve(import.meta.dir, '..');

async function withTempManual(
	files: Record<string, string>,
	run: (rootDir: string) => Promise<void>,
) {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-manual-'));
	try {
		for (const [filePath, content] of Object.entries(files)) {
			const fullPath = path.join(tempDir, filePath);
			await fs.mkdir(path.dirname(fullPath), { recursive: true });
			await fs.writeFile(fullPath, content, 'utf-8');
		}
		await run(tempDir);
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}
}

function configYaml(pageOverrides = '') {
	return `site:
  title: Test Manual
  description: Test docs.
  basePath: /
home:
  cards:
    - title: Start
      description: Start here.
      href: /start
      command: wave --help
nav:
  - title: Start
    pages:
      - title: Start
        href: /start
        source: pages/start.md
${pageOverrides}`;
}

const pageMarkdown = `---
title: Start
description: Start page.
category: Start
commands:
  - wave --help
appliesTo:
  - Local CLI
---

## Start

Run Wave locally.
`;

describe('manual loader', () => {
	test('loads current manual source', async () => {
		const manual = await loadManual({ rootDir });

		expect(manual.site.title).toBe('Wave Manual');
		expect(manual.sections.length).toBeGreaterThan(0);
		expect(manual.pages.length).toBe(14);
		expect(manual.pages.map((page) => page.href)).toContain('/quickstart');
		expect(manual.home.cards.every((card) => card.href.startsWith('/'))).toBe(
			true,
		);
	});

	test('loads valid temp manual', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(),
				'manual/pages/start.md': pageMarkdown,
			},
			async (tempDir) => {
				const manual = await loadManual({ rootDir: tempDir });

				expect(manual.pages).toHaveLength(1);
				expect(manual.pages[0]!.title).toBe('Start');
				expect(manual.pages[0]!.body).toContain('Run Wave locally.');
			},
		);
	});

	test('rejects duplicate hrefs', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(`      - title: Other
        href: /start
        source: pages/other.md
`),
				'manual/pages/start.md': pageMarkdown,
				'manual/pages/other.md': pageMarkdown.replace(
					'title: Start',
					'title: Other',
				),
			},
			async (tempDir) => {
				await expect(loadManual({ rootDir: tempDir })).rejects.toThrow(
					/Duplicate href/,
				);
			},
		);
	});

	test('rejects missing frontmatter field', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(),
				'manual/pages/start.md': pageMarkdown.replace(
					'description: Start page.\n',
					'',
				),
			},
			async (tempDir) => {
				await expect(loadManual({ rootDir: tempDir })).rejects.toThrow(
					/Missing required frontmatter "description"/,
				);
			},
		);
	});

	test('rejects missing page file', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(),
			},
			async (tempDir) => {
				await expect(loadManual({ rootDir: tempDir })).rejects.toThrow(
					/Failed to read manual page/,
				);
			},
		);
	});

	test('rejects protocol-relative nav href', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml().replace(
					`      - title: Start
        href: /start
        source: pages/start.md`,
					`      - title: Start
        href: //example.com/start
        source: pages/start.md`,
				),
				'manual/pages/start.md': pageMarkdown,
			},
			async (tempDir) => {
				await expect(loadManual({ rootDir: tempDir })).rejects.toThrow(
					/Invalid manual href/,
				);
			},
		);
	});

	test('rejects protocol-relative home card href', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml().replace(
					'href: /start',
					'href: //example.com/start',
				),
				'manual/pages/start.md': pageMarkdown,
			},
			async (tempDir) => {
				await expect(loadManual({ rootDir: tempDir })).rejects.toThrow(
					/Invalid manual href/,
				);
			},
		);
	});

	test('rejects home card href outside nav', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml().replace(
					'href: /start',
					'href: /missing',
				),
				'manual/pages/start.md': pageMarkdown,
			},
			async (tempDir) => {
				await expect(loadManual({ rootDir: tempDir })).rejects.toThrow(
					/Home card href does not match any nav page/,
				);
			},
		);
	});

	test('exposes ManualLoadError for bad config shape', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': 'site: []\n',
			},
			async (tempDir) => {
				try {
					await loadManual({ rootDir: tempDir });
					throw new Error('expected loadManual to fail');
				} catch (error) {
					expect(error).toBeInstanceOf(ManualLoadError);
				}
			},
		);
	});

	test('builds manual-data json into output directory', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(),
				'manual/pages/start.md': pageMarkdown,
			},
			async (tempDir) => {
				const outDir = path.join(tempDir, 'dist/manual-app');
				const manual = await buildManualData({ rootDir: tempDir, outDir });
				const data = JSON.parse(
					await fs.readFile(path.join(outDir, 'manual-data.json'), 'utf-8'),
				);

				expect(manual.pages[0]!.title).toBe('Start');
				expect(data.pages[0].title).toBe('Start');
				expect(data.pages[0].html).toContain('<h2');
				expect(data.pages[0].searchText).toContain('wave --help');
			},
		);
	});

	test('escapes raw html in generated manual html', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(),
				'manual/pages/start.md': pageMarkdown.replace(
					'Run Wave locally.',
					'<script>alert(1)</script>\n\n<span>raw</span>',
				),
			},
			async (tempDir) => {
				const outDir = path.join(tempDir, 'dist/manual-app');
				const manual = await buildManualData({ rootDir: tempDir, outDir });
				const rawJson = await fs.readFile(
					path.join(outDir, 'manual-data.json'),
					'utf-8',
				);
				const data = JSON.parse(rawJson);
				const html = manual.pages[0]!.html;

				expect(rawJson).not.toContain('<script>');
				expect(rawJson).not.toContain('<span>');
				expect(data.pages[0].body).not.toContain('<script>');
				expect(data.pages[0].searchText).not.toContain('<script>');
				expect(html).not.toContain('<script>');
				expect(html).not.toContain('<span>');
				expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
				expect(html).toContain('&lt;span&gt;raw&lt;/span&gt;');
			},
		);
	});

	test('drops unsafe markdown link and image urls from generated html', async () => {
		await withTempManual(
			{
				'manual/manual.config.yaml': configYaml(),
				'manual/pages/start.md': pageMarkdown.replace(
					'Run Wave locally.',
					[
						'[safe](https://example.com)',
						'[relative](/docs/start)',
						'[unsafe](javascript:alert(1))',
						'[protocol relative](//evil.example/path)',
						'![unsafe image](javascript:alert(2))',
						'![protocol relative image](//evil.example/x.png)',
					].join('\n\n'),
				),
			},
			async (tempDir) => {
				const outDir = path.join(tempDir, 'dist/manual-app');
				const manual = await buildManualData({ rootDir: tempDir, outDir });
				const html = manual.pages[0]!.html;

				expect(html).toContain('<a href="https://example.com">safe</a>');
				expect(html).toContain('<a href="/docs/start">relative</a>');
				expect(html).toContain('unsafe');
				expect(html).toContain('unsafe image');
				expect(html).not.toContain('javascript:');
				expect(html).not.toContain('//evil.example');
				expect(html).not.toContain('<a href="javascript:');
				expect(html).not.toContain('<img src="javascript:');
				expect(html).not.toContain('<a href="//');
				expect(html).not.toContain('<img src="//');
			},
		);
	});
});
