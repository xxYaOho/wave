import { useEffect, useMemo, useRef, useState } from 'react';
import type {
	ManualData,
	ManualDataPage,
	ManualHomeCardConfig,
} from '../../core/manual/types.ts';
import { loadManualData } from './manual-data.ts';

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

function ManualHtml({ html }: { html: string }) {
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
			button.textContent = '复制';
			button.setAttribute('aria-label', '复制代码');

			let resetTimer: ReturnType<typeof setTimeout> | undefined;
			const handleClick = async () => {
				const text = code.textContent ?? '';

				try {
					await copyTextToClipboard(text);
					button.textContent = '已复制';
				} catch {
					button.textContent = '复制失败';
				}

				if (resetTimer) clearTimeout(resetTimer);
				resetTimer = setTimeout(() => {
					button.textContent = '复制';
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
	}, [html]);

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

function OnThisPage({ html }: { html: string }) {
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
		<nav className="toc" data-testid="manual-toc" aria-label="本页内容">
			<p className="tocTitle">本页内容</p>
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
}: {
	pages: ManualDataPage[];
	page: ManualDataPage;
}) {
	const index = pages.findIndex((item) => item.href === page.href);
	const previous = index > 0 ? pages[index - 1] : undefined;
	const next =
		index >= 0 && index < pages.length - 1 ? pages[index + 1] : undefined;

	if (!previous && !next) return null;

	return (
		<nav className="pagePager" data-testid="manual-pager" aria-label="上下页">
			{previous ? (
				<button
					type="button"
					className="pagerLink"
					onClick={() => navigate(previous.href)}
				>
					<span className="pagerLabel">上一页</span>
					<span className="pagerTitle">{previous.title}</span>
				</button>
			) : null}
			{next ? (
				<button
					type="button"
					className="pagerLink pagerNext"
					onClick={() => navigate(next.href)}
				>
					<span className="pagerLabel">下一页</span>
					<span className="pagerTitle">{next.title}</span>
				</button>
			) : null}
		</nav>
	);
}

function Home({ data }: { data: ManualData }) {
	return (
		<main className="content">
			<header className="hero">
				<p className="eyebrow">Wave Manual</p>
				<h1>{data.site.title}</h1>
				<p className="lede">{data.site.description}</p>
			</header>
			<div className="homeGrid">
				{data.home.cards.map((card) => (
					<HomeCard key={card.href} card={card} />
				))}
			</div>
			<section className="directory" data-testid="manual-directory">
				<h2 className="directoryTitle">目录</h2>
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
}: {
	pages: ManualDataPage[];
	page: ManualDataPage;
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
				<ManualHtml html={page.html} />
				<PagePager pages={pages} page={page} />
			</div>
			<OnThisPage html={page.html} />
		</main>
	);
}

function NotFound({ data }: { data: ManualData }) {
	return (
		<main className="content">
			<p className="eyebrow">Not Found</p>
			<h1>页面不存在</h1>
			<p className="lede">这个页面不在 {data.site.title} 中。</p>
			<button
				type="button"
				className="primaryButton"
				onClick={() => navigate('/')}
			>
				回到首页
			</button>
		</main>
	);
}

function Sidebar({ data, path }: { data: ManualData; path: string }) {
	return (
		<aside className="sidebar">
			<button type="button" className="brand" onClick={() => navigate('/')}>
				<span className="brandMark">W</span>
				<span>
					<strong>Wave</strong>
					<small>Manual</small>
				</span>
			</button>
			<nav className="navList" aria-label="Manual navigation">
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
}: {
	data: ManualData;
	query: string;
	setQuery: (value: string) => void;
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
				<span>Search</span>
				<input
					value={query}
					placeholder="搜索命令、配置或能力"
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
						<p>没有匹配结果</p>
					)}
				</div>
			) : null}
		</div>
	);
}

export function App() {
	const [data, setData] = useState<ManualData | null>(null);
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
				<p className="eyebrow">Error</p>
				<h1>无法加载手册</h1>
				<p className="lede">{error}</p>
			</main>
		);
	}

	if (!data) {
		return (
			<main className="content standalone">
				<p className="eyebrow">Loading</p>
				<h1>Wave Manual</h1>
			</main>
		);
	}

	const page = data.pages.find((item) => item.href === path);

	return (
		<div className="appShell">
			<Sidebar data={data} path={path} />
			<div className="mainShell">
				<header className="topbar">
					<Search data={data} query={query} setQuery={setQuery} />
				</header>
				{path === '/' ? (
					<Home data={data} />
				) : page ? (
					<PageView pages={data.pages} page={page} />
				) : (
					<NotFound data={data} />
				)}
			</div>
		</div>
	);
}
