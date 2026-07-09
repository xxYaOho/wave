import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type {
	GenerateOptions,
	ParameterSet,
	ParsedThemefile,
} from '../../types/index.ts';

export interface ProfileEntry {
	name: string;
	path: string;
	isDefault: boolean;
	nightPath?: string | undefined;
}

export interface ProfileDocument {
	entry: ProfileEntry;
	parsed: ParsedThemefile;
	buildDir: string;
	tokenContent: string;
}

interface ProfileParseOptions {
	defaultParsed?: ParsedThemefile;
	baseParsed?: ParsedThemefile;
	baseDir: string;
}

const PROFILE_STEM_RE = /^[A-Za-z0-9 _-]+$/;
export const NIGHT_SKIP_MESSAGE = 'Night Mode unavailable/invalid and skipped';

type MergeNightResult =
	| { ok: true; tree: Record<string, unknown> }
	| { ok: false; message: typeof NIGHT_SKIP_MESSAGE };

function exists(filePath: string): Promise<boolean> {
	return fs
		.access(filePath)
		.then(() => true)
		.catch(() => false);
}

function toStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	if (typeof value === 'string') return [value];
	return [];
}

function normalizeParameterValue(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is string => typeof item === 'string')
			.join(',');
	}
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return String(value);
	return undefined;
}

function normalizeParameterSet(value: unknown): ParameterSet {
	const params: ParameterSet = {};
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return params;
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		const normalized = normalizeParameterValue(raw);
		if (normalized !== undefined) {
			params[key === 'outputDir' ? 'output' : key] = normalized;
		}
	}
	return params;
}

function resolveLocalParameterPaths(
	params: ParameterSet,
	baseDir: string,
): ParameterSet {
	const output = { ...params };
	if (output.output && !path.isAbsolute(output.output)) {
		output.output = path.resolve(baseDir, output.output);
	}
	return output;
}

function mergeParams(base: ParameterSet, next: ParameterSet): ParameterSet {
	return { ...base, ...next };
}

function mergeGroups(
	baseGroups: ParsedThemefile['groups'],
	localGroups: ParsedThemefile['groups'],
): ParsedThemefile['groups'] {
	const output = [...baseGroups];
	const namedIndex = new Map<string, number>();
	output.forEach((group, index) => {
		if (group.name) namedIndex.set(group.name, index);
	});

	for (const group of localGroups) {
		if (group.name && namedIndex.has(group.name)) {
			const index = namedIndex.get(group.name)!;
			const existing = output[index]!;
			output[index] = {
				name: existing.name,
				PARAMETER: mergeParams(existing.PARAMETER, group.PARAMETER),
			};
		} else {
			if (group.name) namedIndex.set(group.name, output.length);
			output.push(group);
		}
	}

	return output;
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isNightWritablePath(pathParts: string[]): boolean {
	return (
		pathParts[0] === 'theme' &&
		(pathParts[1] === 'color' || pathParts[1] === 'state')
	);
}

function hasPath(root: Record<string, unknown>, pathParts: string[]): boolean {
	let current: unknown = root;
	for (const part of pathParts) {
		if (
			typeof current !== 'object' ||
			current === null ||
			Array.isArray(current)
		) {
			return false;
		}
		if (!(part in current)) return false;
		current = (current as Record<string, unknown>)[part];
	}
	return true;
}

function assignPath(
	root: Record<string, unknown>,
	pathParts: string[],
	value: unknown,
): void {
	let current = root;
	for (const part of pathParts.slice(0, -1)) {
		current = current[part] as Record<string, unknown>;
	}
	const key = pathParts[pathParts.length - 1]!;
	const existing = current[key];
	if (
		typeof existing === 'object' &&
		existing !== null &&
		!Array.isArray(existing) &&
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value)
	) {
		current[key] = { ...existing, ...value };
		return;
	}
	current[key] = value;
}

function walkNightLeaves(
	node: unknown,
	pathParts: string[],
	leaves: Array<{ path: string[]; value: unknown }>,
): void {
	if (
		typeof node !== 'object' ||
		node === null ||
		Array.isArray(node) ||
		'$value' in node
	) {
		leaves.push({ path: pathParts, value: node });
		return;
	}
	for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
		if (key.startsWith('$')) continue;
		walkNightLeaves(child, [...pathParts, key], leaves);
	}
}

export function mergeNightOverlay(
	dayTree: Record<string, unknown>,
	nightTree: Record<string, unknown>,
): MergeNightResult {
	for (const key of Object.keys(nightTree)) {
		if (key === '$schema') continue;
		if (key !== 'theme') return { ok: false, message: NIGHT_SKIP_MESSAGE };
	}

	const leaves: Array<{ path: string[]; value: unknown }> = [];
	walkNightLeaves(nightTree, [], leaves);
	for (const leaf of leaves) {
		if (!isNightWritablePath(leaf.path)) {
			return { ok: false, message: NIGHT_SKIP_MESSAGE };
		}
		if (!hasPath(dayTree, leaf.path)) {
			return { ok: false, message: NIGHT_SKIP_MESSAGE };
		}
	}

	const merged = cloneJson(dayTree);
	for (const leaf of leaves) assignPath(merged, leaf.path, leaf.value);
	return { ok: true, tree: merged };
}

export function normalizeProfileName(stem: string): string {
	const trimmed = stem.trim();
	if (!PROFILE_STEM_RE.test(trimmed)) {
		throw new Error(`Invalid profile name "${stem}"`);
	}
	return trimmed.replaceAll(' ', '_').toLowerCase();
}

export async function discoverProfiles(
	themeDir: string,
): Promise<ProfileEntry[]> {
	const profiles: ProfileEntry[] = [];
	const mainPath = path.join(themeDir, 'main.yaml');
	if (await exists(mainPath)) {
		const mainNightPath = path.join(themeDir, 'main@night.yaml');
		profiles.push({
			name: 'main',
			path: mainPath,
			isDefault: true,
			nightPath: (await exists(mainNightPath)) ? mainNightPath : undefined,
		});
	}

	const profilesDir = path.join(themeDir, 'profiles');
	if (!(await exists(profilesDir))) return profiles;

	const entries = await fs.readdir(profilesDir, { withFileTypes: true });
	const names = new Set(profiles.map((profile) => profile.name));
	for (const entry of entries) {
		if (entry.isDirectory()) {
			throw new Error('Nested profile directories are not supported');
		}
		if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
		const stem = path.basename(entry.name, '.yaml');
		if (stem.endsWith('@night')) continue;
		const name = normalizeProfileName(stem);
		if (names.has(name)) {
			throw new Error(`Duplicate normalized profile name "${name}"`);
		}
		names.add(name);
		const profilePath = path.join(profilesDir, entry.name);
		const nightPath = path.join(profilesDir, `${stem}@night.yaml`);
		profiles.push({
			name,
			path: profilePath,
			isDefault: false,
			nightPath: (await exists(nightPath)) ? nightPath : undefined,
		});
	}

	return profiles.sort((a, b) => {
		if (a.isDefault) return -1;
		if (b.isDefault) return 1;
		return a.name.localeCompare(b.name);
	});
}

export function resolveProfilesToBuild(
	profiles: ProfileEntry[],
	options: GenerateOptions,
): ProfileEntry[] {
	if (options.profile) {
		const selected = profiles.find(
			(profile) => profile.name === normalizeProfileName(options.profile!),
		);
		if (!selected) throw new Error(`Profile not found: ${options.profile}`);
		return [selected];
	}
	if (options.profiles === 'all') return profiles;
	const main = profiles.find((profile) => profile.isDefault);
	if (!main) throw new Error('No main.yaml found');
	return [main];
}

export async function parseProfileDocument(
	entry: ProfileEntry,
	options: ProfileParseOptions,
): Promise<ProfileDocument> {
	const content = await Bun.file(entry.path).text();
	const loaded = yaml.load(content);
	if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
		throw new Error(`${entry.path} root must be an object`);
	}

	const root = loaded as Record<string, unknown>;
	const config = root.$config;
	const configObj =
		config && typeof config === 'object' && !Array.isArray(config)
			? (config as Record<string, unknown>)
			: {};
	if (!entry.isDefault && configObj.theme !== undefined) {
		throw new Error('$config.theme is only supported in main.yaml');
	}

	const defaultParsed = entry.isDefault ? options.defaultParsed : undefined;
	const hasLocalConfig = config !== undefined;
	const inheritedDefaultParsed = hasLocalConfig ? undefined : defaultParsed;
	const baseParsed = options.baseParsed ?? inheritedDefaultParsed;
	const resources = entry.isDefault
		? [...(inheritedDefaultParsed?.resources ?? [])]
		: [...(baseParsed?.resources ?? [])];

	const resourceConfig = configObj.resource;
	if (
		resourceConfig &&
		typeof resourceConfig === 'object' &&
		!Array.isArray(resourceConfig)
	) {
		const profileDir = path.dirname(entry.path);
		for (const [kind, refs] of Object.entries(
			resourceConfig as Record<string, unknown>,
		)) {
			for (const ref of toStringList(refs)) {
				const normalizedRef =
					path.isAbsolute(ref) ||
					(!ref.startsWith('./') && !ref.startsWith('../'))
						? ref
						: path.resolve(profileDir, ref);
				resources.push({ kind, ref: normalizedRef });
			}
		}
	}

	const profileDir = path.dirname(entry.path);
	const localParameter = resolveLocalParameterPaths(
		normalizeParameterSet(configObj.parameter),
		profileDir,
	);
	const parameter = mergeParams(baseParsed?.PARAMETER ?? {}, localParameter);

	const localGroups: ParsedThemefile['groups'] = [];
	const parameterGroup = configObj.parameterGroup;
	if (
		parameterGroup &&
		typeof parameterGroup === 'object' &&
		!Array.isArray(parameterGroup)
	) {
		for (const [name, groupParams] of Object.entries(
			parameterGroup as Record<string, unknown>,
		)) {
			localGroups.push({
				name,
				PARAMETER: resolveLocalParameterPaths(
					normalizeParameterSet(groupParams),
					profileDir,
				),
			});
		}
	}
	const groups = mergeGroups(baseParsed?.groups ?? [], localGroups);

	const tokenRoot = { ...root };
	delete tokenRoot.$config;

	const buildDir = entry.isDefault ? options.baseDir : profileDir;

	return {
		entry,
		buildDir,
		parsed: {
			THEME:
				baseParsed?.THEME ??
				String(configObj.theme ?? path.basename(path.dirname(entry.path))),
			PARAMETER: parameter,
			resources,
			groups,
		},
		tokenContent: yaml.dump(tokenRoot, { lineWidth: -1 }),
	};
}
