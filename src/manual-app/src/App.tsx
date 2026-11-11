import { useEffect, useMemo, useRef, useState } from 'react';
import { localeFromPrimaryLanguage } from '../../core/manual/locale.ts';
import type {
	Locale,
	ManualData,
	ManualDataPage,
	ManualDataView,
	ManualHomeCardConfig,
} from '../../core/manual/types.ts';
import { loadManualData, selectManualView } from './manual-data.ts';

type ManualRenderableData = Pick<
	ManualDataView,
	'site' | 'home' | 'sections' | 'pages'
>;

interface ManualUiText {
	manual: string;
	manualWord: string;
	directory: string;
	toc: string;
	copy: string;
	copyCode: string;
	copied: string;
	copyFailed: string;
	previous: string;
	next: string;
	searchLabel: string;
	searchPlaceholder: string;
	noResults: string;
	notFound: string;
	notFoundEyebrow: string;
	notFoundDescription: string;
	backHome: string;
	error: string;
	loadError: string;
	loading: string;
}

const UI_TEXT: Record<Locale, ManualUiText> = {
	zh: {
		manual: 'Wave 手册',
		manualWord: '手册',
		directory: '目录',
		toc: '本页内容',
		copy: '复制',
		copyCode: '复制代码',
		copied: '已复制',
		copyFailed: '复制失败',
		previous: '上一页',
		next: '下一页',
		searchLabel: '搜索',
		searchPlaceholder: '搜索命令、配置或能力',
		noResults: '没有匹配结果',
		notFound: '页面不存在',
		notFoundEyebrow: '找不到页面',
		notFoundDescription: '这个页面不在 {title} 中。',
		backHome: '回到首页',
		error: '错误',
		loadError: '无法加载手册',
		loading: '加载中',
	},
	en: {
		manual: 'Wave Manual',
		manualWord: 'Manual',
		directory: 'Directory',
		toc: 'On this page',
		copy: 'Copy',
		copyCode: 'Copy code',
		copied: 'Copied',
		copyFailed: 'Copy failed',
		previous: 'Previous',
		next: 'Next',
		searchLabel: 'Search',
		searchPlaceholder: 'Search commands, configuration, or capabilities',
		noResults: 'No matching results',
		notFound: 'Page not found',
		notFoundEyebrow: 'Not Found',
		notFoundDescription: 'This page is not in {title}.',
		backHome: 'Back to home',
		error: 'Error',
		loadError: 'Unable to load the manual',
		loading: 'Loading',
	},
};

function currentPath(): string {
	const path = window.location.pathname;
	if (path === '/') return '/';
	return path.replace(/\/$/, '');
}

function navigate(href: string): void {
	window.history.pushState({}, '', href);
	window.dispatchEvent(new PopStateEvent('popstate'));
}

function CommandCode({ value }: { value: string }) {
	return <code className="commandCode">{value}</code>;
}

async function copyTextToClipboard(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
	document.body.appendChild(textarea);
	textarea.select();

	try {
		if (!document.execCommand?.('copy')) {
			throw new Error('Copy command failed');
		}
	} finally {
		textarea.remove();
	}
}

function HomeCard({ card }: { card: ManualHomeCardConfig }) {
	return (
		<button
			type="button"
			data-testid="manual-home-card"
			className="homeCard"
			onClick={() => navigate(card.href)}
		>
			<span className="homeCardTitle">{card.title}</span>
			<span className="homeCardDescription">{card.description}</span>
			<CommandCode value={card.command} />
		</button>
	);
}

function ManualHtml({ html, copy }: { html: string; copy: ManualUiText }) {
	const articleRef = useRef<HTMLElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: html changes remount rendered manual content via dangerouslySetInnerHTML, so copy buttons must be rebound after route changes.
	useEffect(() => {
		const article = articleRef.current;
		if (!article) return;

		const cleanupFns: Array<() => void> = [];

		for (const pre of article.querySelectorAll('pre')) {
			if (pre.querySelector('.copyCodeButton')) continue;
			const code = pre.querySelector('code');
			if (!code) continue;

			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'copyCodeButton';
			button.textContent = copy.copy;
			button.setAttribute('aria-label', copy.copyCode);

			let resetTimer: ReturnType<typeof setTimeout> | undefined;
			const handleClick = async () => {
				const text = code.textContent ?? '';

				try {
					await copyTextToClipboard(text);
					button.textContent = copy.copied;
				} catch {
					button.textContent = copy.copyFailed;
				}

				if (resetTimer) clearTimeout(resetTimer);
				resetTimer = setTimeout(() => {
					button.textContent = copy.copy;
				}, 1600);
			};

			button.addEventListener('click', handleClick);
			pre.appendChild(button);
			cleanupFns.push(() => {
				if (resetTimer) clearTimeout(resetTimer);
				button.removeEventListener('click', handleClick);
			});
		}

		return () => {
			for (const cleanup of cleanupFns) cleanup();
		};
	}, [copy, html]);

	return (
		<article
			ref={articleRef}
			className="article"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: manual-data.html is generated locally with raw HTML escaped in src/core/manual/build.ts.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

interface TocHeading {
	id: string;
	depth: 2 | 3;
	text: string;
}

function OnThisPage({ html, copy }: { html: string; copy: ManualUiText }) {
	const headings = useMemo<TocHeading[]>(() => {
		const doc = new window.DOMParser().parseFromString(html, 'text/html');
		const seen = new Map<string, number>();
		const items: TocHeading[] = [];

		for (const heading of doc.querySelectorAll('h2, h3')) {
			const text = heading.textContent?.trim() ?? '';
			if (!text) continue;
			const count = seen.get(text) ?? 0;
			seen.set(text, count + 1);
			items.push({
				id: count > 0 ? `${text} (${count})` : text,
				depth: heading.tagName === 'H3' ? 3 : 2,
				text,
			});
		}

		return items;
	}, [html]);

	if (headings.length === 0) return null;

	const scrollToHeading = (text: string) => {
		const article = document.querySelector('.article');
		if (!article) return;

		for (const heading of article.querySelectorAll('h2, h3')) {
			if (heading.textContent?.trim() === text) {
				heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
				return;
			}
		}
	};

	return (
		<nav className="toc" data-testid="manual-toc" aria-label={copy.toc}>
			<p className="tocTitle">{copy.toc}</p>
			{headings.map((heading) => (
				<button
					key={heading.id}
					type="button"
					className={heading.depth === 3 ? 'tocLink tocLinkNested' : 'tocLink'}
					onClick={() => scrollToHeading(heading.text)}
				>
					{heading.text}
				</button>
			))}
		</nav>
	);
}

function PagePager({
	pages,
	page,
	copy,
}: {
	pages: ManualDataPage[];
	page: ManualDataPage;
	copy: ManualUiText;
}) {
	const index = pages.findIndex((item) => item.href === page.href);
	const previous = index > 0 ? pages[index - 1] : undefined;
	const next =
		index >= 0 && index < pages.length - 1 ? pages[index + 1] : undefined;

	if (!previous && !next) return null;

	return (
		<nav
			className="pagePager"
			data-testid="manual-pager"
			aria-label={`${copy.previous}/${copy.next}`}
		>
			{previous ? (
				<button
					type="button"
					className="pagerLink"
					onClick={() => navigate(previous.href)}
				>
					<span className="pagerLabel">{copy.previous}</span>
					<span className="pagerTitle">{previous.title}</span>
				</button>
			) : null}
			{next ? (
				<button
					type="button"
					className="pagerLink pagerNext"
					onClick={() => navigate(next.href)}
				>
					<span className="pagerLabel">{copy.next}</span>
					<span className="pagerTitle">{next.title}</span>
				</button>
			) : null}
		</nav>
	);
}

function Home({
	data,
	copy,
}: {
	data: ManualRenderableData;
	copy: ManualUiText;
}) {
	return (
		<main className="content">
			<header className="hero">
				<p className="eyebrow">{copy.manual}</p>
				<h1>{data.site.title}</h1>
				<p className="lede">{data.site.description}</p>
			</header>
			<div className="homeGrid">
				{data.home.cards.map((card) => (
					<HomeCard key={card.href} card={card} />
				))}
			</div>
			<section className="directory" data-testid="manual-directory">
				<h2 className="directoryTitle">{copy.directory}</h2>
				<div className="directoryGrid">
					{data.sections.map((section) => (
						<div key={section.title} className="directorySection">
							<p className="directorySectionTitle">{section.title}</p>
							{section.pages.map((page) => (
								<button
									key={page.href}
									type="button"
									className="directoryLink"
									onClick={() => navigate(page.href)}
								>
									{page.title}
								</button>
							))}
						</div>
					))}
				</div>
			</section>
		</main>
	);
}

function PageView({
	pages,
	page,
	copy,
}: {
	pages: ManualDataPage[];
	page: ManualDataPage;
	copy: ManualUiText;
}) {
	return (
		<main className="pageBody">
			<div className="pageMain">
				<header className="pageHeader">
					<p className="eyebrow">{page.category}</p>
					<h1 data-testid="manual-page-title">{page.title}</h1>
					<p className="lede">{page.description}</p>
					<div className="commandRow">
						{page.commands.map((command) => (
							<CommandCode key={command} value={command} />
						))}
					</div>
				</header>
				<ManualHtml html={page.html} copy={copy} />
				<PagePager pages={pages} page={page} copy={copy} />
			</div>
			<OnThisPage html={page.html} copy={copy} />
		</main>
	);
}

function NotFound({
	data,
	copy,
}: {
	data: ManualRenderableData;
	copy: ManualUiText;
}) {
	return (
		<main className="content">
			<p className="eyebrow">{copy.notFoundEyebrow}</p>
			<h1>{copy.notFound}</h1>
			<p className="lede">
				{copy.notFoundDescription.replace('{title}', data.site.title)}
			</p>
			<button
				type="button"
				className="primaryButton"
				onClick={() => navigate('/')}
			>
				{copy.backHome}
			</button>
		</main>
	);
}

function Sidebar({
	data,
	path,
	copy,
}: {
	data: ManualRenderableData;
	path: string;
	copy: ManualUiText;
}) {
	return (
		<aside className="sidebar">
			<button type="button" className="brand" onClick={() => navigate('/')}>
				<span className="brandMark">W</span>
				<span>
					<strong>Wave</strong>
					<small>{copy.manualWord}</small>
				</span>
			</button>
			<nav className="navList" aria-label={copy.directory}>
				{data.sections.map((section) => (
					<div key={section.title} className="navSection">
						<p>{section.title}</p>
						{section.pages.map((page) => (
							<button
								key={page.href}
								type="button"
								className={page.href === path ? 'navLink active' : 'navLink'}
								onClick={() => navigate(page.href)}
							>
								{page.title}
							</button>
						))}
					</div>
				))}
			</nav>
			<footer className="sidebarFooter">{data.site.title}</footer>
		</aside>
	);
}

function Search({
	data,
	query,
	setQuery,
	copy,
}: {
	data: ManualRenderableData;
	query: string;
	setQuery: (value: string) => void;
	copy: ManualUiText;
}) {
	const results = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return [];
		return data.pages
			.filter((page) => page.searchText.toLowerCase().includes(normalized))
			.slice(0, 8);
	}, [data.pages, query]);

	return (
		<div className="searchWrap">
			<label className="searchBox">
				<span>{copy.searchLabel}</span>
				<input
					value={query}
					placeholder={copy.searchPlaceholder}
					onChange={(event) => setQuery(event.currentTarget.value)}
				/>
			</label>
			{query.trim() ? (
				<div className="searchResults">
					{results.length ? (
						results.map((page) => (
							<button
								type="button"
								data-testid="manual-search-result"
								key={page.href}
								onClick={() => {
									setQuery('');
									navigate(page.href);
								}}
							>
								<strong>{page.title}</strong>
								<span>{page.description}</span>
							</button>
						))
					) : (
						<p>{copy.noResults}</p>
					)}
				</div>
			) : null}
		</div>
	);
}

export function App() {
	const [data, setData] = useState<ManualData | null>(null);
	const [locale] = useState<Locale>(() =>
		localeFromPrimaryLanguage(
			typeof navigator === 'undefined' ? undefined : navigator.language,
		),
	);
	const [path, setPath] = useState(currentPath);
	const [query, setQuery] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadManualData()
			.then(setData)
			.catch((loadError) => {
				setError(
					loadError instanceof Error ? loadError.message : String(loadError),
				);
			});
	}, []);

	useEffect(() => {
		const listener = () => setPath(currentPath());
		window.addEventListener('popstate', listener);
		return () => window.removeEventListener('popstate', listener);
	}, []);

	if (error) {
		return (
			<main className="content standalone">
				<p className="eyebrow">{UI_TEXT[locale].error}</p>
				<h1>{UI_TEXT[locale].loadError}</h1>
				<p className="lede">{error}</p>
			</main>
		);
	}

	if (!data) {
		return (
			<main className="content standalone">
				<p className="eyebrow">{UI_TEXT[locale].loading}</p>
				<h1>{UI_TEXT[locale].manual}</h1>
			</main>
		);
	}

	const copy = UI_TEXT[locale];
	const view = selectManualView(data, locale);
	const page = view.pages.find((item) => item.href === path);

	return (
		<div className="appShell">
			<Sidebar data={view} path={path} copy={copy} />
			<div className="mainShell">
				<header className="topbar">
					<Search data={view} query={query} setQuery={setQuery} copy={copy} />
				</header>
				{path === '/' ? (
					<Home data={view} copy={copy} />
				) : page ? (
					<PageView pages={view.pages} page={page} copy={copy} />
				) : (
					<NotFound data={view} copy={copy} />
				)}
			</div>
		</div>
	);
}
