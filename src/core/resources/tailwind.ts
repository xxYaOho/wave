import * as path from 'node:path';
import * as yaml from 'js-yaml';

export type TailwindRequest = 'latest' | '3' | '4';

export interface TailwindResourceResult {
	content: string;
	requestedVersion: string;
	resolvedVersion: string;
	activeMajor: number;
}

type TailwindColorTree = Record<string, unknown>;

function normalizeVersion(version: string | undefined): TailwindRequest {
	if (!version || version === 'latest') return 'latest';
	if (version === '3' || version.startsWith('3.')) return '3';
	if (version === '4' || version.startsWith('4.')) return '4';
	throw new Error(
		`Unsupported Tailwind CSS version "${version}". Use latest, 3, or 4.`,
	);
}

function fixtureRoot(): string | undefined {
	return process.env.WAVE_TAILWIND_FIXTURE_DIR;
}

async function readFixture(request: TailwindRequest): Promise<string | null> {
	const root = fixtureRoot();
	if (!root) return null;
	const filename = request === '3' ? 'tailwind-v3.js' : 'tailwind-v4.css';
	const filePath = path.join(root, filename);
	const file = Bun.file(filePath);
	if (!(await file.exists())) return null;
	return await file.text();
}

async function resolveNpmVersion(request: TailwindRequest): Promise<string> {
	if (fixtureRoot()) return request === '3' ? '3.4.17' : '4.1.0';
	const url = 'https://registry.npmjs.org/tailwindcss';
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to resolve tailwindcss: HTTP ${response.status} ${response.statusText}`,
		);
	}
	const payload = (await response.json()) as {
		'dist-tags'?: Record<string, string>;
		versions?: Record<string, unknown>;
	};
	if (request === 'latest') {
		const latest = payload['dist-tags']?.latest;
		if (!latest) {
			throw new Error('Failed to resolve tailwindcss@latest: missing dist-tag');
		}
		return latest;
	}
	const prefix = `${request}.`;
	const versions = Object.keys(payload.versions ?? {})
		.filter((version) => version.startsWith(prefix))
		.sort(compareSemver);
	const resolved = versions.at(-1);
	if (!resolved) {
		throw new Error(
			`Failed to resolve tailwindcss@${request}: no matching version`,
		);
	}
	return resolved;
}

function compareSemver(a: string, b: string): number {
	const pa = a.split('.').map((part) => Number.parseInt(part, 10));
	const pb = b.split('.').map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < Math.max(pa.length, pb.length); index++) {
		const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

async function fetchPackageFile(
	version: string,
	candidates: string[],
): Promise<string> {
	if (fixtureRoot()) {
		const major = version.startsWith('3.') ? '3' : '4';
		const fixture = await readFixture(major as TailwindRequest);
		if (fixture) return fixture;
	}

	for (const candidate of candidates) {
		const url = `https://unpkg.com/tailwindcss@${version}/${candidate}`;
		const response = await fetch(url);
		if (response.ok) return await response.text();
	}
	throw new Error(
		`Failed to fetch Tailwind CSS ${version} source (${candidates.join(', ')})`,
	);
}

async function fetchPackageFileCandidates(
	version: string,
	candidates: string[],
): Promise<string[]> {
	if (fixtureRoot()) return [await fetchPackageFile(version, candidates)];
	const sources: string[] = [];
	for (const candidate of candidates) {
		const url = `https://unpkg.com/tailwindcss@${version}/${candidate}`;
		const response = await fetch(url);
		if (response.ok) sources.push(await response.text());
	}
	return sources;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function tokenFromHex(value: string): { $value: string } {
	return { $value: value };
}

function convertTailwindObject(
	value: unknown,
): Record<string, unknown> | { $value: string } | null {
	if (typeof value === 'string') return tokenFromHex(value);
	if (!isPlainObject(value)) return null;
	const out: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		const converted = convertTailwindObject(child);
		if (converted) out[key] = converted;
	}
	return out;
}

function toTailwindYaml(
	colors: TailwindColorTree,
	pretokenized = false,
): string {
	const color = pretokenized ? colors : convertTailwindObject(colors);
	return yaml.dump(
		{
			tailwindcss: {
				color: {
					$type: 'color',
					...(isPlainObject(color) ? color : {}),
				},
			},
		},
		{ lineWidth: -1, noRefs: true },
	);
}

function stripLineComments(source: string): string {
	return source.replace(/\/\/.*$/gm, '');
}

function findMatchingBrace(source: string, start: number): number {
	let depth = 0;
	let quote: '"' | "'" | '`' | null = null;
	let escaped = false;

	for (let index = start; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '{') depth++;
		if (char === '}') {
			depth--;
			if (depth === 0) return index;
		}
	}

	return -1;
}

function quoteObjectKeys(source: string): string {
	return source.replace(
		/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*|[0-9]+)(\s*:)/g,
		'$1"$2"$3',
	);
}

function removeWarnCalls(source: string): string {
	return source.replace(/warn\(\{[\s\S]*?\}\),?/g, '');
}

function extractGetterAliases(
	source: string,
): Array<{ alias: string; target: string }> {
	return Array.from(
		source.matchAll(
			/get\s+([A-Za-z_$][A-Za-z0-9_$]*)\(\)\s*\{[\s\S]*?return\s+this\.([A-Za-z_$][A-Za-z0-9_$]*)[\s\S]*?\},?/g,
		),
	).map((match) => ({ alias: match[1]!, target: match[2]! }));
}

function removeGetterAliases(source: string): string {
	return source.replace(
		/get\s+[A-Za-z_$][A-Za-z0-9_$]*\(\)\s*\{[\s\S]*?return\s+this\.[A-Za-z_$][A-Za-z0-9_$]*[\s\S]*?\},?/g,
		'',
	);
}

function parseTailwindV3Colors(source: string): TailwindColorTree | null {
	const exportIndex = source.indexOf('export default');
	if (exportIndex === -1) return null;
	const objectStart = source.indexOf('{', exportIndex);
	if (objectStart === -1) return null;
	const objectEnd = findMatchingBrace(source, objectStart);
	if (objectEnd === -1) return null;

	const objectSource = stripLineComments(
		source.slice(objectStart, objectEnd + 1),
	);
	const aliases = extractGetterAliases(objectSource);
	const objectLiteral = removeGetterAliases(removeWarnCalls(objectSource))
		.replace(/'/g, '"')
		.replace(/,\s*([}\]])/g, '$1');
	const parsed = JSON.parse(quoteObjectKeys(objectLiteral)) as unknown;
	if (!isPlainObject(parsed)) {
		throw new Error('Tailwind v3 colors source did not contain an object');
	}
	for (const { alias, target } of aliases) {
		const targetValue = parsed[target];
		if (targetValue !== undefined) parsed[alias] = targetValue;
	}
	return parsed;
}

function tokenFromCssValue(value: string): { $value: unknown } {
	const normalized = value.trim();
	if (normalized.startsWith('oklch(') && normalized.endsWith(')')) {
		const inner = normalized.slice(6, -1).trim();
		const parts = inner.split(/\s+/).map((part, index) => {
			if (index === 0 && part.endsWith('%')) {
				return roundOklchComponent(Number(part.slice(0, -1)) / 100);
			}
			return roundOklchComponent(Number(part));
		});
		if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
			return {
				$value: {
					colorSpace: 'oklch',
					components: parts,
				},
			};
		}
	}
	return { $value: normalized };
}

function roundOklchComponent(value: number): number {
	return Number(value.toFixed(3));
}

function parseThemeCss(source: string): TailwindColorTree {
	const colors: TailwindColorTree = {};
	const pattern = /--color-([a-z0-9-]+):\s*([^;]+);/g;
	for (const match of source.matchAll(pattern)) {
		const name = match[1];
		const value = match[2];
		if (!name || !value) continue;
		const segments = name.split('-');
		const family = segments[0];
		const shade = segments.slice(1).join('-');
		if (!family) continue;
		if (!shade) {
			colors[family] = tokenFromCssValue(value);
			continue;
		}
		const bucket = isPlainObject(colors[family])
			? (colors[family] as Record<string, unknown>)
			: {};
		bucket[shade] = tokenFromCssValue(value);
		colors[family] = bucket;
	}
	if (Object.keys(colors).length === 0) {
		throw new Error(
			'Tailwind v4 theme.css did not contain --color-* variables',
		);
	}
	return colors;
}

export async function buildTailwindResource(
	version: string | undefined,
): Promise<TailwindResourceResult> {
	const request = normalizeVersion(version);
	const resolvedVersion = await resolveNpmVersion(request);
	const major = Number(resolvedVersion.split('.')[0]);
	if (major !== 3 && major !== 4) {
		throw new Error(
			`Tailwind CSS ${resolvedVersion} is not supported yet. Use --version 4 explicitly.`,
		);
	}
	if (request !== 'latest' && major !== Number(request)) {
		throw new Error(
			`Requested Tailwind CSS v${request}, but npm resolved ${resolvedVersion}.`,
		);
	}

	if (major === 3) {
		const sources = await fetchPackageFileCandidates(resolvedVersion, [
			'src/public/colors.js',
		]);
		let colors: TailwindColorTree | null = null;
		for (const source of sources) {
			colors = parseTailwindV3Colors(source);
			if (colors && Object.keys(colors).length > 0) break;
		}
		if (!colors) {
			throw new Error(`Failed to parse Tailwind CSS ${resolvedVersion} colors`);
		}
		return {
			content: toTailwindYaml(colors),
			requestedVersion: request,
			resolvedVersion,
			activeMajor: major,
		};
	}

	const source = await fetchPackageFile(resolvedVersion, ['theme.css']);
	return {
		content: toTailwindYaml(parseThemeCss(source), true),
		requestedVersion: request,
		resolvedVersion,
		activeMajor: major,
	};
}
