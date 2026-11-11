import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import matter from 'gray-matter';

const rootDir = path.resolve(import.meta.dir, '..');
const pagesDir = path.join(rootDir, 'manual', 'pages');
const pagesEnDir = path.join(rootDir, 'manual', 'pages-en');

const cjkPattern = /[　-〿㐀-䶿一-鿿]/;
const internalHrefPattern = /\]\((\/[a-z0-9/-]+)\)/g;

async function listPageNames(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir);
	return entries.filter((name) => name.endsWith('.md')).sort();
}

async function readPage(dir: string, name: string): Promise<string> {
	return fs.readFile(path.join(dir, name), 'utf-8');
}

function extractInternalHrefs(body: string): string[] {
	return [...body.matchAll(internalHrefPattern)]
		.map((match) => match[1])
		.sort();
}

function stripLanguageSwitchLines(content: string): string {
	return content
		.split('\n')
		.filter(
			(line) =>
				!line.includes('](./README.md)') && !line.includes('](./README.en.md)'),
		)
		.join('\n');
}

function extractFencedWaveCommands(content: string): string[] {
	const commands: string[] = [];
	for (const block of content.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
		for (const rawLine of block[1].split('\n')) {
			const line = rawLine.trim();
			if (!line.startsWith('wave ')) {
				continue;
			}
			const command = line
				.replace(/\s+#.*$/, '')
				.replace(/<[^>]+>/g, '<>')
				.trim();
			commands.push(command);
		}
	}
	return commands.sort();
}

describe('manual bilingual equivalence', () => {
	test('pages-en mirrors pages one-to-one', async () => {
		const [zh, en] = await Promise.all([
			listPageNames(pagesDir),
			listPageNames(pagesEnDir),
		]);
		expect(en).toEqual(zh);
	});

	test('page frontmatter aligns across locales', async () => {
		const names = await listPageNames(pagesDir);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const [zh, en] = await Promise.all([
				readPage(pagesDir, name),
				readPage(pagesEnDir, name),
			]);
			const zhMeta = matter(zh).data as Record<string, unknown>;
			const enMeta = matter(en).data as Record<string, unknown>;

			expect(Object.keys(enMeta).sort()).toEqual(Object.keys(zhMeta).sort());
			expect(enMeta.commands).toEqual(zhMeta.commands);

			const zhAppliesTo = zhMeta.appliesTo as string[];
			const enAppliesTo = enMeta.appliesTo as string[];
			expect(enAppliesTo).toEqual(
				zhAppliesTo.map((v) => (v === '本地 CLI' ? 'Local CLI' : v)),
			);
			expect(enAppliesTo).not.toContain('本地 CLI');

			expect(typeof enMeta.title).toBe('string');
			expect((enMeta.title as string).length).toBeGreaterThan(0);
			expect(typeof enMeta.description).toBe('string');
			expect(typeof enMeta.category).toBe('string');
		}
	});

	test('internal hrefs are identical across locales', async () => {
		const names = await listPageNames(pagesDir);
		for (const name of names) {
			const [zh, en] = await Promise.all([
				readPage(pagesDir, name),
				readPage(pagesEnDir, name),
			]);
			expect(extractInternalHrefs(en)).toEqual(extractInternalHrefs(zh));
		}
	});

	test('fenced wave commands match across locales', async () => {
		const names = await listPageNames(pagesDir);
		for (const name of names) {
			const [zh, en] = await Promise.all([
				readPage(pagesDir, name),
				readPage(pagesEnDir, name),
			]);
			expect(
				extractFencedWaveCommands(en),
				`${name} fenced wave commands diverge`,
			).toEqual(extractFencedWaveCommands(zh));
		}
	});

	test('english pages contain no chinese residue', async () => {
		const names = await listPageNames(pagesEnDir);
		for (const name of names) {
			const content = await readPage(pagesEnDir, name);
			const match = cjkPattern.exec(content);
			expect(
				match,
				`${name} contains CJK character ${match?.[0] ?? ''}`,
			).toBeNull();
		}
	});
});

describe('bilingual README contract', () => {
	test('readme files exist and cross-link each other', async () => {
		const [zh, en] = await Promise.all([
			fs.readFile(path.join(rootDir, 'README.md'), 'utf-8'),
			fs.readFile(path.join(rootDir, 'README.en.md'), 'utf-8'),
		]);
		expect(zh).toContain('](./README.en.md)');
		expect(en).toContain('](./README.md)');
	});

	test('english readme contains no chinese residue', async () => {
		const en = await fs.readFile(path.join(rootDir, 'README.en.md'), 'utf-8');
		const match = cjkPattern.exec(stripLanguageSwitchLines(en));
		expect(
			match,
			`README.en.md contains CJK character ${match?.[0] ?? ''}`,
		).toBeNull();
	});
});
