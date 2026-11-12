import { Check, Copy } from 'lucide-react';
import {
	memo,
	type ReactNode,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import type {
	ManualMetadata,
	ManualSearchIndexEntry,
} from '../../core/manual/build.ts';
import { localeFromPrimaryLanguage } from '../../core/manual/locale.ts';
import type {
	Locale,
	ManualData,
	ManualDataPage,
	ManualDataView,
	ManualHomeCardConfig,
} from '../../core/manual/types.ts';
import { BrandMark } from './BrandMark.tsx';
import {
	hrefFromRoute,
	loadManualPage,
	loadManualSearchIndex,
	loadManualShell,
	normalizeManualQuery,
	routeFromHref,
	selectManualView,
	selectMetadataView,
} from './manual-data.ts';

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
		searchPlaceholder: '搜索',
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
		searchPlaceholder: 'Search',
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

function shortcutLabel(): string {
	if (typeof navigator === 'undefined') return 'Ctrl K';
	const platform = navigator.platform || navigator.userAgent || '';
	return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘K' : 'Ctrl K';
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

function useCopiedFlag() {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const markCopied = () => {
		setCopied(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setCopied(false), 1600);
	};

	return { copied, markCopied };
}

function CopyIconButton({
	text,
	label,
	copiedLabel,
	failedLabel,
	className,
}: {
	text: string;
	label: string;
	copiedLabel: string;
	failedLabel: string;
	className: string;
}) {
	const { copied, markCopied } = useCopiedFlag();
	const [failed, setFailed] = useState(false);

	const handleCopy = async () => {
		try {
			await copyTextToClipboard(text);
			setFailed(false);
			markCopied();
		} catch {
			setFailed(true);
		}
	};

	const state = failed ? failedLabel : copied ? copiedLabel : label;

	return (
		<button
			type="button"
			className={className}
			aria-label={state}
			title={state}
			data-copied={copied || undefined}
			onClick={handleCopy}
		>
			{copied ? (
				<Check size={14} strokeWidth={1.75} aria-hidden="true" />
			) : (
				<Copy size={14} strokeWidth={1.5} aria-hidden="true" />
			)}
		</button>
	);
}

function CopyableCommand({
	value,
	copy,
}: {
	value: string;
	copy: ManualUiText;
}) {
	return (
		<span className="commandChip">
			<code className="commandCode">{value}</code>
			<CopyIconButton
				text={value}
				label={`${copy.copy} ${value}`}
				copiedLabel={copy.copied}
				failedLabel={copy.copyFailed}
				className="commandCopyButton"
			/>
		</span>
	);
}

function HomeCard({
	card,
	index,
}: {
	card: ManualHomeCardConfig;
	index: number;
}) {
	return (
		<button
			type="button"
			data-testid="manual-home-card"
			className="homeCard"
			onClick={() => navigate(card.href)}
		>
			<span className="homeCardIndex">
				{String(index + 1).padStart(2, '0')}
			</span>
			<span className="homeCardTitle">{card.title}</span>
			<span className="homeCardDescription">{card.description}</span>
		</button>
	);
}

interface CodeCopyTarget {
	host: HTMLElement;
	text: string;
}

const ManualArticle = memo(function ManualArticle({
	html,
	articleRef,
}: {
	html: string;
	articleRef: RefObject<HTMLElement | null>;
}) {
	return (
		<article
			ref={articleRef}
			className="article"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: manual-data.html is generated locally with raw HTML escaped in src/core/manual/build.ts.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
});

function ManualHtml({ html, copy }: { html: string; copy: ManualUiText }) {
	const articleRef = useRef<HTMLElement | null>(null);
	const [targets, setTargets] = useState<CodeCopyTarget[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: html changes remount rendered manual content via dangerouslySetInnerHTML, so copy buttons must be rebound after route changes.
	useEffect(() => {
		const article = articleRef.current;
		if (!article) return;

		const next: CodeCopyTarget[] = [];
		const doc = article.ownerDocument;

		for (const pre of article.querySelectorAll('pre')) {
			const code = pre.querySelector('code');
			if (!code) continue;

			const text = code.textContent ?? '';
			if (!/\n/.test(text.trim())) pre.classList.add('commandPre');

			let host = pre.querySelector<HTMLElement>('.copyCodeHost');
			if (!host) {
				host = doc.createElement('span');
				host.className = 'copyCodeHost';
				pre.appendChild(host);
			}
			next.push({ host, text });
		}

		// Some snapshot tables are wider than the reading column; give them their own scroller.
		for (const table of article.querySelectorAll('table')) {
			if (table.parentElement?.classList.contains('tableScroll')) continue;
			const wrap = doc.createElement('div');
			wrap.className = 'tableScroll';
			table.replaceWith(wrap);
			wrap.appendChild(table);
		}

		setTargets(next);
	}, [copy, html]);

	return (
		<>
			<ManualArticle html={html} articleRef={articleRef} />
			{targets.map((target, index) =>
				createPortal(
					<CopyIconButton
						text={target.text}
						label={copy.copyCode}
						copiedLabel={copy.copied}
						failedLabel={copy.copyFailed}
						className="copyCodeButton"
					/>,
					target.host,
					`copy-${index}`,
				),
			)}
		</>
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

	const [active, setActive] = useState<string | null>(
		headings[0]?.text ?? null,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: html changes update .article in place via dangerouslySetInnerHTML, so the scroll-spy observer must rebind after route changes.
	useEffect(() => {
		const article = document.querySelector('.article');
		if (!article) return;

		const headingEls = [...article.querySelectorAll<HTMLElement>('h2, h3')];
		if (headingEls.length === 0) return;

		setActive(headingEls[0]?.textContent?.trim() ?? null);

		if (typeof IntersectionObserver === 'undefined') return;

		const visible = new Map<Element, boolean>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					visible.set(entry.target, entry.isIntersecting);
				}

				const current = headingEls.find((el) => visible.get(el));
				if (current) {
					setActive(current.textContent?.trim() ?? null);
				}
			},
			{ rootMargin: '-96px 0px -55% 0px', threshold: [0, 1] },
		);

		for (const el of headingEls) observer.observe(el);
		return () => observer.disconnect();
	}, [html]);

	if (headings.length === 0) return null;

	const scrollToHeading = (text: string) => {
		const article = document.querySelector('.article');
		if (!article) return;

		for (const heading of article.querySelectorAll('h2, h3')) {
			if (heading.textContent?.trim() === text) {
				heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
				setActive(text);
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
					className={[
						'tocLink',
						heading.depth === 3 ? 'tocLinkNested' : '',
						heading.text === active ? 'active' : '',
					]
						.filter(Boolean)
						.join(' ')}
					aria-current={heading.text === active ? 'location' : undefined}
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
				<div className="heroMeta">
					<span>Wave CLI</span>
					<span>Spec 00</span>
				</div>
				<h1>{data.site.title}</h1>
				<p className="lede">{data.site.description}</p>
			</header>
			<div className="homeGrid">
				{data.home.cards.map((card, index) => (
					<HomeCard key={card.href} card={card} index={index} />
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
							<CopyableCommand key={command} value={command} copy={copy} />
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
	search,
}: {
	data: ManualRenderableData;
	path: string;
	copy: ManualUiText;
	search: ReactNode;
}) {
	return (
		<aside className="sidebar">
			<button type="button" className="brand" onClick={() => navigate('/')}>
				<BrandMark className="brandMark" />
				<span>
					<strong>Wave</strong>
					<small>{copy.manualWord}</small>
				</span>
			</button>
			{search}
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
	locale,
	searchIndex,
	searchLoading,
}: {
	data: ManualRenderableData;
	query: string;
	setQuery: (value: string) => void;
	copy: ManualUiText;
	locale: Locale;
	searchIndex?: ManualSearchIndexEntry[];
	searchLoading?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const results = useMemo(() => {
		const normalized = normalizeManualQuery(query);
		if (!normalized) return [];
		if (searchIndex) {
			return searchIndex
				.filter((entry) => entry.locale === locale)
				.filter((entry) => entry.searchText.includes(normalized))
				.slice(0, 8)
				.map((entry) => ({
					...entry,
					href: hrefFromRoute(entry.route),
					body: '',
					html: '',
					source: '',
				}));
		}
		return data.pages
			.filter((page) => page.searchText.toLowerCase().includes(normalized))
			.slice(0, 8);
	}, [data.pages, locale, query, searchIndex]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const isShortcut =
				(event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
			if (isShortcut) {
				event.preventDefault();
				inputRef.current?.focus();
				inputRef.current?.select();
				return;
			}
			if (
				event.key === 'Escape' &&
				document.activeElement === inputRef.current
			) {
				setQuery('');
				inputRef.current?.blur();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [setQuery]);

	return (
		<div className="searchWrap">
			<label className="searchBox">
				<svg
					className="searchIcon"
					width="14"
					height="14"
					viewBox="0 0 16 16"
					fill="none"
					aria-hidden="true"
				>
					<circle
						cx="7"
						cy="7"
						r="4.5"
						stroke="currentColor"
						strokeWidth="1.25"
					/>
					<path
						d="M10.5 10.5L14 14"
						stroke="currentColor"
						strokeWidth="1.25"
						strokeLinecap="round"
					/>
				</svg>
				<input
					ref={inputRef}
					value={query}
					aria-label={copy.searchLabel}
					placeholder={copy.searchPlaceholder}
					autoComplete="off"
					onChange={(event) => setQuery(event.currentTarget.value)}
				/>
				<kbd className="searchShortcut">{shortcutLabel()}</kbd>
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
						<p>{searchLoading ? copy.loading : copy.noResults}</p>
					)}
				</div>
			) : null}
		</div>
	);
}

export function App() {
	const [legacyData, setLegacyData] = useState<ManualData | null>(null);
	const [metadata, setMetadata] = useState<ManualMetadata | null>(null);
	const [locale] = useState<Locale>(() =>
		localeFromPrimaryLanguage(
			typeof navigator === 'undefined' ? undefined : navigator.language,
		),
	);
	const [path, setPath] = useState(currentPath);
	const [query, setQuery] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pageData, setPageData] = useState<ManualDataPage | null>(null);
	const [pageLoading, setPageLoading] = useState(false);
	const [pageError, setPageError] = useState<string | null>(null);
	const [searchIndex, setSearchIndex] = useState<
		ManualSearchIndexEntry[] | undefined
	>();
	const [searchLoading, setSearchLoading] = useState(false);

	useEffect(() => {
		loadManualShell()
			.then((shell) => {
				if ('pages' in shell) {
					setLegacyData(shell);
					return;
				}
				setMetadata(shell);
			})
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

	useEffect(() => {
		if (!metadata || path === '/') {
			setPageData(null);
			setPageLoading(false);
			setPageError(null);
			return;
		}

		const route = routeFromHref(path);
		const view = selectMetadataView(metadata, locale);
		if (!view.pages.some((page) => page.href === path)) {
			setPageData(null);
			setPageLoading(false);
			setPageError(null);
			return;
		}

		let cancelled = false;
		setPageData(null);
		setPageLoading(true);
		setPageError(null);
		loadManualPage(metadata, locale, route)
			.then((page) => {
				if (!cancelled) setPageData(page);
			})
			.catch((loadError) => {
				if (!cancelled) {
					setPageError(
						loadError instanceof Error ? loadError.message : String(loadError),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setPageLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [locale, metadata, path]);

	useEffect(() => {
		if (!metadata || !query.trim()) return;
		let cancelled = false;
		setSearchLoading(true);
		loadManualSearchIndex()
			.then((index) => {
				if (!cancelled) setSearchIndex(index);
			})
			.catch(() => {
				if (!cancelled) setSearchIndex([]);
			})
			.finally(() => {
				if (!cancelled) setSearchLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [metadata, query]);

	if (error) {
		return (
			<main className="content standalone">
				<p className="eyebrow">{UI_TEXT[locale].error}</p>
				<h1>{UI_TEXT[locale].loadError}</h1>
				<p className="lede">{error}</p>
			</main>
		);
	}

	if (!legacyData && !metadata) {
		return (
			<main className="content standalone">
				<p className="eyebrow">{UI_TEXT[locale].loading}</p>
				<h1>{UI_TEXT[locale].manual}</h1>
			</main>
		);
	}

	const copy = UI_TEXT[locale];
	const view = legacyData
		? (selectManualView(legacyData, locale) as ManualDataView)
		: selectMetadataView(metadata!, locale);
	const page = view.pages.find((item) => item.href === path);
	const loadedPage = legacyData ? page : pageData;

	return (
		<div className="appShell">
			<Sidebar
				data={view}
				path={path}
				copy={copy}
				search={
					<Search
						data={view}
						query={query}
						setQuery={setQuery}
						copy={copy}
						locale={locale}
						searchIndex={legacyData ? undefined : searchIndex}
						searchLoading={searchLoading}
					/>
				}
			/>
			<div className="mainShell">
				<div className="frameMarks" aria-hidden="true">
					<span className="mark markTl" />
					<span className="mark markTr" />
					<span className="mark markBl" />
					<span className="mark markBr" />
				</div>
				{path === '/' ? (
					<Home data={view} copy={copy} />
				) : page && loadedPage ? (
					<PageView pages={view.pages} page={loadedPage} copy={copy} />
				) : pageLoading ? (
					<main className="content standalone">
						<p className="eyebrow">{copy.loading}</p>
						<h1>{copy.manual}</h1>
					</main>
				) : pageError ? (
					<main className="content standalone">
						<p className="eyebrow">{copy.error}</p>
						<h1>{copy.loadError}</h1>
						<p className="lede">{pageError}</p>
					</main>
				) : (
					<NotFound data={view} copy={copy} />
				)}
			</div>
		</div>
	);
}
