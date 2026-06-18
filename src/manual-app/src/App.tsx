import { useEffect, useMemo, useState } from 'react';
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
	return (
		<article
			className="article"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: manual-data.html is generated locally with raw HTML escaped in src/core/manual/build.ts.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function Home({ data }: { data: ManualData }) {
	return (
		<main className="content">
			<p className="eyebrow">Wave Manual</p>
			<h1>{data.site.title}</h1>
			<p className="lede">{data.site.description}</p>
			<div className="homeGrid">
				{data.home.cards.map((card) => (
					<HomeCard key={card.href} card={card} />
				))}
			</div>
		</main>
	);
}

function PageView({ page }: { page: ManualDataPage }) {
	return (
		<main className="content">
			<p className="eyebrow">{page.category}</p>
			<h1 data-testid="manual-page-title">{page.title}</h1>
			<p className="lede">{page.description}</p>
			<div className="commandRow">
				{page.commands.map((command) => (
					<CommandCode key={command} value={command} />
				))}
			</div>
			<ManualHtml html={page.html} />
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
					<PageView page={page} />
				) : (
					<NotFound data={data} />
				)}
			</div>
		</div>
	);
}
