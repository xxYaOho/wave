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
import { buildManualData } from '../src/core/manual/build.ts';
import type { ManualData } from '../src/core/manual/types.ts';
import { App } from '../src/manual-app/src/App.tsx';

const realFetch = globalThis.fetch;

const page = {
	title: 'Design Token',
	description: 'Build tokens.',
	category: '能力',
	commands: ['wave dt doctor'],
	appliesTo: ['Local CLI'],
	href: '/design-token',
	source: 'pages/design-token.md',
	body: '## Usage',
	html: '<h2>Usage</h2><p>Build token output.</p><pre><code>wave dt build -f ./themefile</code></pre>',
	searchText: 'Design Token Build token output wave dt doctor',
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
				command: 'wave dt doctor',
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

function installWindow(path = '/') {
	const window = new Window({ url: `http://127.0.0.1${path}` });

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

async function renderManualApp({
	path = '/',
	ok = true,
	status = 200,
}: {
	path?: string;
	ok?: boolean;
	status?: number;
} = {}) {
	installWindow(path);
	mockFetch({ ok, status });
	const view = render(React.createElement(App));
	await view.findByText('Wave Manual');
	return view;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = realFetch;
});

describe('manual app', () => {
	test('fetches manual data and renders the home cards', async () => {
		const view = await renderManualApp();

		expect(view.getAllByText('Wave Manual').length).toBeGreaterThanOrEqual(1);
		expect(view.getAllByTestId('manual-home-card')).toHaveLength(1);
		expect(view.getByText('wave dt doctor')).toBeTruthy();

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
		await user.click(copyButton);

		expect(copied).toEqual(['wave dt build -f ./themefile']);
		expect(copyButton.textContent).toBe('已复制');
	});

	test('search result navigates to a manual page', async () => {
		const view = await renderManualApp();
		const user = userEvent.setup({ document: window.document });

		await user.type(view.getByRole('textbox', { name: 'Search' }), 'token');

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
			'wave --help',
		);
		expect(pageByHref.get('/design-token')?.searchText).toContain('themefile');
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
