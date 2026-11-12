import { afterEach, describe, expect, test } from 'bun:test';
import {
	cleanup,
	fireEvent,
	render,
	waitFor,
	within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Window } from 'happy-dom';
import React from 'react';
import type {
	ManualMetadata,
	ManualRouteData,
	ManualSearchIndexEntry,
} from '../src/core/manual/build.ts';
import { buildManualData } from '../src/core/manual/build.ts';
import type { ManualData, ManualDataView } from '../src/core/manual/types.ts';
import { App } from '../src/manual-app/src/App.tsx';

const realFetch = globalThis.fetch;

const page = {
	title: 'Design Token',
	description: 'Build tokens.',
	category: '能力',
	commands: ['wave token doctor'],
	appliesTo: ['Local CLI'],
	href: '/design-token',
	source: 'pages/design-token.md',
	body: '## Usage',
	html: '<h2>Usage</h2><p>Build token output.</p><pre><code>wave token build -f ./main.yaml</code></pre>',
	searchText: 'Design Token Build token output wave token doctor',
};

const compressPage = {
	title: '素材压缩',
	description: 'Compress local assets.',
	category: '素材',
	commands: ['wave compress'],
	appliesTo: ['Local CLI'],
	href: '/compress',
	source: 'pages/compress.md',
	body: '## Compress',
	html: '<h2>Compress</h2><p>Compress local assets.</p>',
	searchText: '素材压缩 Compress local assets wave compress',
};

const manualData: ManualData = {
	site: {
		title: 'Wave Manual',
		description: 'Local manual.',
		basePath: '/',
	},
	home: {
		cards: [
			{
				title: 'Design Token',
				description: 'Build tokens.',
				href: '/design-token',
				command: 'wave token doctor',
			},
		],
	},
	pages: [page, compressPage],
	sections: [
		{
			title: '能力',
			pages: [page],
		},
		{
			title: '素材',
			pages: [compressPage],
		},
	],
};

const zhView: ManualDataView = {
	site: {
		title: 'Wave 手册',
		description: '中文手册。',
		basePath: '/',
	},
	home: {
		cards: [
			{
				title: '设计令牌',
				description: '构建令牌。',
				href: '/design-token',
				command: 'wave token doctor',
			},
		],
	},
	pages: [
		{
			...page,
			title: '设计令牌',
			description: '构建令牌。',
			searchText: '设计令牌 构建令牌',
		},
		{ ...compressPage, title: '素材压缩', searchText: '素材压缩' },
	],
	sections: [
		{ title: '能力', pages: [{ ...page, title: '设计令牌' }] },
		{ title: '素材', pages: [{ ...compressPage, title: '素材压缩' }] },
	],
	nav: [],
};
zhView.nav = zhView.sections;

const enView: ManualDataView = {
	site: {
		title: 'Wave Manual',
		description: 'English manual.',
		basePath: '/',
	},
	home: manualData.home,
	pages: manualData.pages,
	sections: manualData.sections,
	nav: manualData.sections,
};

const bilingualManualData: ManualData = {
	...enView,
	locales: { zh: zhView, en: enView },
};

function installWindow(path = '/', language = 'zh-CN') {
	const window = new Window({ url: `http://127.0.0.1${path}` });
	Object.defineProperty(window.navigator, 'language', {
		configurable: true,
		value: language,
	});

	Object.assign(globalThis, {
		window,
		document: window.document,
		navigator: window.navigator,
		HTMLElement: window.HTMLElement,
		HTMLButtonElement: window.HTMLButtonElement,
		HTMLInputElement: window.HTMLInputElement,
		Event: window.Event,
		InputEvent: window.InputEvent,
		MouseEvent: window.MouseEvent,
		PopStateEvent: window.PopStateEvent,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
}

function mockFetch({
	data = manualData,
	ok = true,
	status = 200,
}: {
	data?: ManualData;
	ok?: boolean;
	status?: number;
} = {}) {
	globalThis.fetch = (() =>
		Promise.resolve({
			ok,
			status,
			json: () => Promise.resolve(data),
		} as Response)) as unknown as typeof fetch;
}

const splitMetadata: ManualMetadata = {
	locales: ['zh', 'en'],
	routes: [
		{ route: 'design-token', title: 'Design Token', locale: 'en' },
		{ route: 'design-token', title: '设计令牌', locale: 'zh' },
	],
	sections: [
		{
			title: '能力',
			titleEn: 'Capabilities',
			pages: [
				{
					title: '设计令牌',
					titleEn: 'Design Token',
					href: '/design-token',
					source: 'pages/design-token.md',
					sourceEn: 'pages-en/design-token.md',
				},
			],
		},
	],
	nav: [],
	config: {
		site: {
			title: 'Wave 手册',
			titleEn: 'Wave Manual',
			description: '中文手册。',
			descriptionEn: 'English manual.',
			basePath: '/',
		},
		home: {
			cards: [
				{
					title: '设计令牌',
					titleEn: 'Design Token',
					description: '构建令牌。',
					descriptionEn: 'Build tokens.',
					href: '/design-token',
					command: 'wave token',
				},
			],
		},
	},
};
splitMetadata.nav = splitMetadata.sections;

const splitChunk: ManualRouteData = {
	route: 'design-token',
	locale: 'en',
	title: 'Design Token',
	description: 'Build tokens.',
	category: 'Capabilities',
	commands: ['wave token doctor'],
	appliesTo: ['Local CLI'],
	html: '<h2>Usage</h2><p>Split token output.</p>',
	searchText: 'Design Token Build tokens wave token doctor Split token output.',
	rawMarkdown: '## Usage\n\nSplit token output.\n',
};

const splitIndex: ManualSearchIndexEntry[] = [
	{
		route: 'design-token',
		locale: 'en',
		title: 'Design Token',
		description: 'Build tokens.',
		category: 'Capabilities',
		commands: ['wave token doctor'],
		appliesTo: ['Local CLI'],
		searchText:
			'design token build tokens wave token doctor split token output.',
	},
	{
		route: 'design-token',
		locale: 'zh',
		title: '设计令牌',
		description: '构建令牌。',
		category: '能力',
		commands: ['wave token doctor'],
		appliesTo: ['本地 CLI'],
		searchText: '设计令牌 构建令牌',
	},
];

function mockSplitFetch({
	chunkOk = true,
	legacy = manualData,
}: {
	chunkOk?: boolean;
	legacy?: ManualData;
} = {}) {
	const calls: string[] = [];
	globalThis.fetch = ((input: RequestInfo | URL) => {
		const url = String(input);
		calls.push(url);
		if (url === '/manual-metadata.json') {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(splitMetadata),
			} as Response);
		}
		if (url === '/search-index.json') {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(splitIndex),
			} as Response);
		}
		if (url === '/pages/en/design-token.json' && chunkOk) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(splitChunk),
			} as Response);
		}
		if (url === '/pages/en/design-token.json') {
			return Promise.resolve({
				ok: false,
				status: 503,
				json: () => Promise.resolve({}),
			} as Response);
		}
		if (url === '/manual-data.json') {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(legacy),
			} as Response);
		}
		return Promise.reject(new Error(`Unexpected fetch ${url}`));
	}) as typeof fetch;
	return calls;
}

async function renderManualApp({
	path = '/',
	ok = true,
	status = 200,
	language = 'zh-CN',
	data = manualData,
}: {
	path?: string;
	ok?: boolean;
	status?: number;
	language?: string;
	data?: ManualData;
} = {}) {
	installWindow(path, language);
	mockFetch({ data, ok, status });
	const view = render(React.createElement(App));
	await view.findByText(/Wave (Manual|手册)/);
	return view;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = realFetch;
});

describe('manual app', () => {
	test('metadata protocol keeps the initial request shell-only', async () => {
		installWindow('/', 'en-US');
		const calls = mockSplitFetch();
		const view = render(React.createElement(App));
		await view.findByText('Wave Manual');
		expect(calls).toEqual(['/manual-metadata.json']);
		expect(view.getByTestId('manual-directory')).toBeTruthy();
	});

	test('metadata protocol fetches exactly one route chunk on navigation', async () => {
		installWindow('/design-token', 'en-US');
		const calls = mockSplitFetch();
		const view = render(React.createElement(App));
		expect((await view.findByTestId('manual-page-title')).textContent).toBe(
			'Design Token',
		);
		expect(calls).toEqual([
			'/manual-metadata.json',
			'/pages/en/design-token.json',
		]);
	});

	test('route chunk failure falls back to legacy data and renders the page', async () => {
		installWindow('/design-token', 'en-US');
		const calls = mockSplitFetch({ chunkOk: false });
		const view = render(React.createElement(App));
		expect((await view.findByTestId('manual-page-title')).textContent).toBe(
			'Design Token',
		);
		expect(calls).toEqual([
			'/manual-metadata.json',
			'/pages/en/design-token.json',
			'/manual-data.json',
		]);
	});

	test('metadata search loads the bilingual index on demand', async () => {
		installWindow('/', 'en-US');
		const calls = mockSplitFetch();
		const view = render(React.createElement(App));
		await view.findByText('Wave Manual');
		const user = userEvent.setup({ document: window.document });
		await user.type(view.getByRole('textbox', { name: 'Search' }), 'Design');
		expect(
			(await view.findByTestId('manual-search-result')).textContent,
		).toContain('Design Token');
		expect(calls).toEqual(['/manual-metadata.json', '/search-index.json']);
	});

	test('selects the browser primary language for home, deep links, and search', async () => {
		const zhViewResult = await renderManualApp({
			data: bilingualManualData,
			path: '/design-token',
			language: 'zh-TW',
		});
		expect(zhViewResult.getByText('Wave 手册')).toBeTruthy();
		expect(zhViewResult.getByTestId('manual-page-title').textContent).toBe(
			'设计令牌',
		);

		cleanup();
		const enViewResult = await renderManualApp({
			data: bilingualManualData,
			path: '/design-token',
			language: 'fr-FR',
		});
		expect(enViewResult.getByTestId('manual-page-title').textContent).toBe(
			'Design Token',
		);
		const user = userEvent.setup({ document: window.document });
		await user.type(
			enViewResult.getByRole('textbox', { name: 'Search' }),
			'Design',
		);
		expect(
			(await enViewResult.findByTestId('manual-search-result')).textContent,
		).toContain('Design Token');
	});

	test('fetches manual data and renders the home cards', async () => {
		const view = await renderManualApp();

		expect(view.getAllByText('Wave Manual').length).toBeGreaterThanOrEqual(1);
		const cards = view.getAllByTestId('manual-home-card');
		expect(cards).toHaveLength(1);
		expect(
			within(cards[0] as HTMLElement).getByText('Design Token'),
		).toBeTruthy();
		expect(
			within(cards[0] as HTMLElement).queryByText('wave token doctor'),
		).toBeNull();

		const directory = view.getByTestId('manual-directory');
		expect(within(directory).getByText('目录')).toBeTruthy();
		expect(within(directory).getByText('能力')).toBeTruthy();
		expect(within(directory).getByText('素材')).toBeTruthy();
	});

	test('renders a page route from manual data', async () => {
		const view = await renderManualApp({ path: '/design-token' });

		expect(view.getByTestId('manual-page-title').textContent).toBe(
			'Design Token',
		);
		expect(view.getByText('Build token output.')).toBeTruthy();

		const toc = view.getByTestId('manual-toc');
		expect(within(toc).getByText('本页内容')).toBeTruthy();
		expect(within(toc).getByText('Usage')).toBeTruthy();

		const pager = view.getByTestId('manual-pager');
		expect(within(pager).getByText('下一页')).toBeTruthy();
		expect(within(pager).queryByText('上一页')).toBeNull();
	});

	test('copies code blocks from manual pages', async () => {
		const copied: string[] = [];
		const view = await renderManualApp({ path: '/design-token' });
		const user = userEvent.setup({ document: window.document });

		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string) => {
					copied.push(text);
				},
			},
		});

		const copyButton = await view.findByRole('button', { name: '复制代码' });
		expect(copyButton.querySelector('svg')).not.toBeNull();
		await user.click(copyButton);

		expect(copied).toEqual(['wave token build -f ./main.yaml']);
		await waitFor(() =>
			expect(copyButton.getAttribute('aria-label')).toBe('已复制'),
		);
	});

	test('search result navigates to a manual page', async () => {
		const view = await renderManualApp();
		const user = userEvent.setup({ document: window.document });

		await user.type(view.getByRole('textbox', { name: '搜索' }), 'token');

		const result = await view.findByTestId('manual-search-result');
		expect(result.textContent).toContain('Design Token');

		fireEvent.click(result);
		await waitFor(() => {
			expect(window.location.pathname).toBe('/design-token');
		});
		expect(view.getByTestId('manual-page-title').textContent).toBe(
			'Design Token',
		);
	});

	test('renders not found for unknown routes', async () => {
		const view = await renderManualApp({ path: '/missing' });

		expect(view.getByText('页面不存在')).toBeTruthy();
	});

	test('renders load errors when manual data cannot be fetched', async () => {
		installWindow();
		mockFetch({ ok: false, status: 404 });
		const view = render(React.createElement(App));

		expect(await view.findByText('无法加载手册')).toBeTruthy();
		expect(view.getByText(/404/)).toBeTruthy();
	});

	test('built manual data excludes internal docs and contains core pages', async () => {
		const data = await buildManualData({
			rootDir: process.cwd(),
			outDir: '/tmp/wave-manual-app-test',
		});
		const pageHrefs = data.pages.map((page) => page.href);
		const homeHrefs = data.home.cards.map((card) => card.href);
		const pageByHref = new Map(data.pages.map((page) => [page.href, page]));
		const text = JSON.stringify(data);

		for (const href of [
			'/quickstart',
			'/toolchain',
			'/design-token',
			'/design-token/create',
			'/design-token/night',
			'/design-token/migrate',
			'/design-token/doctor',
			'/design-token/wcag',
			'/design-token/ids',
			'/design-token/main-yaml',
			'/design-token/color-typography',
			'/design-token/extensions-output',
			'/design-token/quality-theming',
			'/compress',
			'/motion',
			'/workspace',
			'/command-index',
			'/troubleshooting',
		]) {
			expect(pageHrefs).toContain(href);
		}
		for (const href of [
			'/design-token',
			'/compress',
			'/motion',
			'/workspace',
		]) {
			expect(homeHrefs).toContain(href);
		}
		expect(pageByHref.get('/toolchain')?.commands).toContain('wave doctor');
		expect(pageByHref.get('/compress')?.searchText).toContain('wave compress');
		expect(pageByHref.get('/motion')?.searchText).toContain('wave motion');
		expect(pageByHref.get('/workspace')?.searchText).toContain(
			'wave workspace',
		);
		expect(pageByHref.get('/command-index')?.searchText).toContain(
			'wave token new night',
		);
		expect(pageByHref.get('/design-token')?.searchText).toContain('main.yaml');
		expect(pageByHref.get('/design-token')?.searchText).not.toContain(
			'themefile',
		);
		expect(
			pageByHref.get('/design-token/extensions-output')?.searchText,
		).toContain('$extensions');
		expect(
			pageByHref.get('/design-token/extensions-output')?.searchText,
		).toContain('sketch.property');
		expect(text).not.toContain('SWISS_KNIFE_REFACTOR');
		expect(text).not.toContain('graphify');
		expect(text).not.toContain('agent 必读');
		expect(text).not.toContain('Manual Authoring Guide');
		expect(text).not.toContain('Manual 维护规范');
		expect(text).not.toContain('AGENTS.md');
	});
});
