import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	readManualText,
	resolveManualTextRequest,
} from '../src/core/manual/text-reader.ts';

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

async function createFixture(): Promise<string> {
	const appDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-m1-reader-'));
	const routes = [
		{ route: 'quickstart', title: 'Quick start', locale: 'en' },
		{ route: 'design-token/create', title: 'Create a workspace', locale: 'en' },
		{ route: 'quickstart', title: '快速开始', locale: 'zh' },
	];
	const index = routes.map((entry) => ({
		...entry,
		description: `${entry.title} description`,
		category: 'Reference',
		commands: ['wave manual'],
		appliesTo: ['Local CLI'],
		searchText: `${entry.title.toLowerCase()} needle reference`,
	}));
	await writeJson(path.join(appDir, 'manual-metadata.json'), {
		locales: ['zh', 'en'],
		routes,
		sections: [],
		nav: [],
		config: { site: {}, home: {} },
	});
	await writeJson(path.join(appDir, 'search-index.json'), index);
	await writeJson(path.join(appDir, 'pages/en/quickstart.json'), {
		route: 'quickstart',
		locale: 'en',
		rawMarkdown: '## Quick start\n\nExact source\n\n',
	});
	await writeJson(path.join(appDir, 'pages/en/design-token/create.json'), {
		route: 'design-token/create',
		locale: 'en',
		rawMarkdown: '# Create',
	});
	return appDir;
}

describe('M1 manual text reader', () => {
	test('resolves only the manual command and joins multi-word queries', () => {
		expect(resolveManualTextRequest(['manual', '-m'])).toEqual({ query: '' });
		expect(
			resolveManualTextRequest(['manual', '-m', 'Quick', 'start']),
		).toEqual({ query: 'Quick start' });
		expect(resolveManualTextRequest(['token', '-m'])).toBeUndefined();
	});

	test('supports directory, exact page, search, and no-match modes', async () => {
		const appDir = await createFixture();
		try {
			const directory = await readManualText('', appDir);
			expect(directory.exitCode).toBe(0);
			expect(directory.stdout).toBe(
				'quickstart\tQuick start\ndesign-token/create\tCreate a workspace\n',
			);

			const exact = await readManualText('  /QUICK   START/ ', appDir);
			expect(exact.exitCode).toBe(0);
			expect(exact.stdout).toBe('## Quick start\n\nExact source\n');

			const search = await readManualText('needle', appDir);
			expect(search.exitCode).toBe(0);
			expect(search.stdout).toContain('quickstart\tQuick start\t');

			const missing = await readManualText('not present', appDir);
			expect(missing.exitCode).toBe(1);
			expect(missing.stdout).toBe('No matches.\n');
		} finally {
			await fs.rm(appDir, { recursive: true, force: true });
		}
	});

	test('reports ambiguity and missing artifacts deterministically', async () => {
		const appDir = await createFixture();
		try {
			const metadataPath = path.join(appDir, 'manual-metadata.json');
			const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8')) as {
				routes: Array<{ route: string; title: string; locale: string }>;
			};
			metadata.routes.push({
				route: 'other',
				title: 'Quick start',
				locale: 'en',
			});
			await writeJson(metadataPath, metadata);
			const indexPath = path.join(appDir, 'search-index.json');
			const index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) as Array<
				Record<string, unknown>
			>;
			index.push({
				route: 'other',
				locale: 'en',
				title: 'Quick start',
				description: '',
				category: '',
				commands: [],
				appliesTo: [],
				searchText: 'quick start',
			});
			await writeJson(indexPath, index);
			const ambiguity = await readManualText('quick start', appDir);
			expect(ambiguity.exitCode).toBe(1);
			expect(ambiguity.stdout).toBe('');
			expect(ambiguity.stderr).toBe('quickstart\nother\n');

			await fs.rm(path.join(appDir, 'search-index.json'));
			await expect(readManualText('', appDir)).rejects.toThrow(
				'Run pnpm manual:build first.',
			);
		} finally {
			await fs.rm(appDir, { recursive: true, force: true });
		}
	});
});
