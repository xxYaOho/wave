import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	type Document,
	isMap,
	isScalar,
	Pair,
	parseDocument,
	Scalar,
	type YAMLMap,
} from 'yaml';
import {
	collectThemeIdentityReport,
	type IdentityFileInput,
	type ThemeIdentityReport,
} from '../doctor/identity.ts';
import { detectWriteOptions } from '../migrate/extensions.ts';

/**
 * `wave dt ids` — token identity fill/generate/sync across a workspace
 * (Milestone-3, Decisions 2 / 4 / 12).
 *
 * Load surface: main.yaml + profiles/*.yaml (day files). Night overlays are
 * not part of the ids surface: override identity is inherited from the base
 * at load time (Milestone-1) and never physically written.
 *
 * Diff semantics per dotted token path (workspace view):
 * - committed `$id` (non-empty) stays; it is the authority for its path;
 * - empty `$id` slots and tokens without `$id` adopt the path's committed
 *   authority (`main` wins as the workspace authority), counted as synced;
 * - paths with no committed identity anywhere get one freshly generated id
 *   (`crypto.randomBytes(16).toString('hex')`) at the path's origin
 *   occurrence (counted as added); every later occurrence of the path in
 *   the same run adopts it (counted as synced), keeping one identity per
 *   logical token across files;
 * - the same id registered at distinct paths inside a single file is
 *   repaired (document-order first occurrence keeps the id, the rest are
 *   reissued fresh and reported); the same id at distinct paths across
 *   files, or one path with distinct ids across files, is a conflict.
 *
 * Report counters: `added` = freshly generated identity origins written;
 * `synced` = occurrences adopting an authority id; `warnings` = advisory
 * findings (non-canonical id form, unverifiable git state). `added +
 * synced` equals the number of `$id` lines inserted or value-filled,
 * including the document-root `$id` of main.yaml, which participates as a
 * document-level slot.
 *
 * Conflicts are hard blockers: any blocker yields ZERO writes across the
 * whole workspace (all-or-nothing, mirroring the M2 migration posture).
 *
 * Write-back reuses the single shared surgical mechanism from M2
 * (`detectWriteOptions` + yaml Document in-place editing): comments, blank
 * lines, indentation and key order are preserved; a second run is a no-op.
 */

type WriteOptions = Parameters<Document['toString']>[0];

export class IdsEntryError extends Error {
	readonly code: 'ENTRY_NOT_FOUND' | 'ENTRY_NOT_MAIN';
	constructor(code: 'ENTRY_NOT_FOUND' | 'ENTRY_NOT_MAIN', message: string) {
		super(message);
		this.code = code;
	}
}

export interface IdsChange {
	/** Display path relative to the workspace directory. */
	file: string;
	/** Dotted token path. */
	tokenPath: string;
	/** `generate` counts under `added`; `sync` counts under `synced`. */
	kind: 'generate' | 'sync';
	/** insert = new `$id` key; fill = empty slot; reissue = duplicate repair. */
	mode: 'insert' | 'fill' | 'reissue';
	id: string;
	/** For `sync`: display path of the file the committed id came from. */
	source?: string;
}

export interface IdsWarning {
	file?: string | undefined;
	tokenPath?: string | undefined;
	message: string;
}

export interface IdsProblem {
	message: string;
}

export interface IdsFileResult {
	file: string;
	status: 'clean' | 'pending' | 'written';
	added: number;
	synced: number;
}

export interface IdsWorkspaceReport {
	write: boolean;
	/** Whether files were actually written (only with `write` and no blocker). */
	written: boolean;
	/** Freshly generated ids written (inserts, slot fills, reissues). */
	added: number;
	/** Ids adopted from an existing committed authority. */
	synced: number;
	changes: IdsChange[];
	warnings: IdsWarning[];
	/** Hard blockers; non-empty means nothing was (or will be) written. */
	problems: IdsProblem[];
	files: IdsFileResult[];
	git: 'clean' | 'dirty' | 'unavailable' | 'unchecked';
	/** Present when `--write` was refused by the git cleanliness gate. */
	refusal?: 'dirty-worktree';
}

interface ScannedToken {
	tokenPath: string;
	node: YAMLMap;
	/** Index of the `$value` pair; the insertion anchor for `$id`. */
	valueIndex: number;
	/** Existing `$id` pair, when present. */
	idPair?: Pair | undefined;
}

interface ScannedFile {
	label: string;
	abs: string;
	source: string;
	doc: Document;
	/** Serialisation options under which the doc round-trips byte-identically. */
	options: WriteOptions | undefined;
	tokens: ScannedToken[];
}

type IdSlotState =
	| { kind: 'committed'; id: string }
	| { kind: 'empty' }
	| { kind: 'none' };

function pairKey(pair: Pair): string | undefined {
	const value = (pair.key as Scalar | undefined)?.value;
	return typeof value === 'string' ? value : undefined;
}

function findPair(node: YAMLMap, key: string): Pair | undefined {
	return node.items.find((item) => pairKey(item) === key);
}

function idSlotState(tokenPath: string, node: YAMLMap): IdSlotState {
	const pair = findPair(node, '$id');
	if (!pair) return { kind: 'none' };
	const value = (pair.value as Scalar | undefined)?.value;
	if (value === null || value === undefined) return { kind: 'empty' };
	if (typeof value !== 'string') {
		throw new Error(
			`token "${tokenPath}": $id must be a string or null, got ${typeof value}`,
		);
	}
	if (value.trim() === '') return { kind: 'empty' };
	return { kind: 'committed', id: value };
}

/**
 * Collect token nodes (maps carrying `$value`) in document order, mirroring
 * the doctor identity walk: `$`-prefixed keys are skipped everywhere, the
 * root-level `doctor` config key is skipped, and a token node is a leaf.
 */
function collectTokenNodes(
	node: unknown,
	prefix: string,
	out: ScannedToken[],
): void {
	if (!isMap(node)) return;
	for (const item of node.items) {
		const key = pairKey(item);
		if (key === undefined || key.startsWith('$')) continue;
		if (prefix === '' && key === 'doctor') continue;
		const child = item.value;
		if (!isMap(child)) continue;
		const childPath = prefix === '' ? key : `${prefix}.${key}`;
		const valueIndex = child.items.findIndex(
			(candidate) => pairKey(candidate) === '$value',
		);
		if (valueIndex >= 0) {
			out.push({
				tokenPath: childPath,
				node: child,
				valueIndex,
				idPair: findPair(child, '$id'),
			});
			continue;
		}
		collectTokenNodes(child, childPath, out);
	}
}

async function resolveIdsTargets(
	entry: string,
): Promise<{ dir: string; files: string[] }> {
	const absolute = path.resolve(entry);
	if (path.basename(absolute) !== 'main.yaml') {
		throw new IdsEntryError(
			'ENTRY_NOT_MAIN',
			`ids entry must be a main.yaml file, got "${entry}"`,
		);
	}
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(absolute);
	} catch {
		throw new IdsEntryError(
			'ENTRY_NOT_FOUND',
			`main.yaml not found at "${entry}"`,
		);
	}
	if (!stat.isFile()) {
		throw new IdsEntryError(
			'ENTRY_NOT_FOUND',
			`main.yaml not found at "${entry}"`,
		);
	}

	const dir = path.dirname(absolute);
	const files = [absolute];
	try {
		const profilesDir = path.join(dir, 'profiles');
		const entries = await fs.readdir(profilesDir);
		for (const name of entries.sort()) {
			// Night overlays are outside the ids surface (identity is inherited
			// from the base file at load time, Milestone-1).
			if (name.endsWith('.yaml') && !name.endsWith('@night.yaml')) {
				files.push(path.join(profilesDir, name));
			}
		}
	} catch {
		// No profiles directory: single-file workspace.
	}
	return { dir, files };
}

async function scanWorkspaceFiles(
	dir: string,
	files: string[],
): Promise<ScannedFile[]> {
	const scanned: ScannedFile[] = [];
	for (const abs of files) {
		const source = await fs.readFile(abs, 'utf8');
		const doc = parseDocument(source);
		const root = doc.toJS();
		if (root === null || typeof root !== 'object' || Array.isArray(root)) {
			throw new Error(`${path.relative(dir, abs)}: root must be a mapping`);
		}
		const tokens: ScannedToken[] = [];
		collectTokenNodes(doc.contents, '', tokens);
		scanned.push({
			label: path.relative(dir, abs),
			abs,
			source,
			doc,
			options: detectWriteOptions(source),
			tokens,
		});
	}
	return scanned;
}

function identityInputsOf(scanned: ScannedFile[]): IdentityFileInput[] {
	return scanned.map((file) => ({
		file: file.label,
		tree: file.doc.toJS() as Record<string, unknown>,
	}));
}

interface PathAuthority {
	id: string;
	file: string;
}

function generateId(): string {
	// Decision 2: 32 lowercase hex, equivalent to `openssl rand -hex 16`.
	return randomBytes(16).toString('hex');
}

/** Sentinel token path for the main.yaml document-root `$id` slot. */
const DOCUMENT_PATH = '(theme)';

type RootIdSlotState =
	| { kind: 'committed' }
	| { kind: 'empty'; pair: Pair }
	| { kind: 'none' }
	| { kind: 'invalid'; value: unknown };

/**
 * The main.yaml document root carries the theme identity (Decision 1).
 * Missing or empty roots are document-level slots this command fills; a
 * committed root is never reassigned.
 */
function rootIdSlotState(doc: Document): RootIdSlotState {
	const root = doc.contents;
	if (!isMap(root)) return { kind: 'committed' };
	const pair = findPair(root, '$id');
	if (!pair) return { kind: 'none' };
	const value = (pair.value as Scalar | undefined)?.value;
	if (value === null || value === undefined) return { kind: 'empty', pair };
	if (typeof value !== 'string') return { kind: 'invalid', value };
	if (value.trim() === '') return { kind: 'empty', pair };
	return { kind: 'committed' };
}

export interface IdsRunOptions {
	write?: boolean;
	allowDirty?: boolean;
}

function gitStatus(dir: string): Promise<'clean' | 'dirty' | 'unavailable'> {
	return (async () => {
		try {
			const proc = Bun.spawn(['git', '-C', dir, 'status', '--porcelain'], {
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const [out, code] = await Promise.all([
				new Response(proc.stdout).text(),
				proc.exited,
			]);
			if (code !== 0) return 'unavailable';
			return out.trim() === '' ? 'clean' : 'dirty';
		} catch {
			return 'unavailable';
		}
	})();
}

const MAX_LISTED_CHANGES = 40;

/**
 * Plan (and, with `write`, surgically apply) token `$id` changes for a whole
 * workspace. All-or-nothing: any conflict, invalid file or unsupported
 * format blocks every write.
 */
export async function runIdsWorkspace(
	entry: string,
	options: IdsRunOptions = {},
): Promise<IdsWorkspaceReport> {
	const write = options.write === true;
	const allowDirty = options.allowDirty === true;
	const report: IdsWorkspaceReport = {
		write,
		written: false,
		added: 0,
		synced: 0,
		changes: [],
		warnings: [],
		problems: [],
		files: [],
		git: 'unchecked',
	};

	const { dir, files } = await resolveIdsTargets(entry);
	const scanned = await scanWorkspaceFiles(dir, files);
	const identity: ThemeIdentityReport = collectThemeIdentityReport(
		identityInputsOf(scanned),
	);

	// --- Blockers: identity conflicts (doctor-aligned three-way semantics) ---
	for (const conflict of identity.conflicts) {
		if (
			conflict.kind === 'duplicate-id' &&
			conflict.crossFile === false &&
			conflict.occurrences.length > 1
		) {
			// Single-file duplicate: repairable, handled below.
			continue;
		}
		const detail = conflict.occurrences
			.map((occurrence) => `${occurrence.file}:${occurrence.path}`)
			.join(', ');
		report.problems.push({
			message:
				conflict.kind === 'duplicate-id'
					? `Cross-file token $id conflict "${conflict.id}": ${detail}`
					: `Token $id conflict at "${conflict.occurrences[0]?.path ?? ''}": ${detail} (${(conflict.ids ?? []).map((id) => `"${id}"`).join(' vs ')})`,
		});
	}

	// --- Repair plan: single-file duplicate ids ---
	const reissueByPath = new Map<string, string>();
	for (const conflict of identity.conflicts) {
		if (conflict.kind !== 'duplicate-id' || conflict.crossFile) continue;
		const [, ...duplicates] = conflict.occurrences;
		for (const occurrence of duplicates ?? []) {
			reissueByPath.set(`${occurrence.file}\n${occurrence.path}`, '');
		}
	}

	// --- Path authority map ---
	const authorityByPath = new Map<string, PathAuthority>();
	for (const file of scanned) {
		for (const token of file.tokens) {
			const state = idSlotState(token.tokenPath, token.node);
			if (state.kind !== 'committed') continue;
			const reissue = reissueByPath.get(`${file.label}\n${token.tokenPath}`);
			if (reissue !== undefined) {
				// Duplicate repair: this occurrence is reissued below.
				continue;
			}
			if (!authorityByPath.has(token.tokenPath)) {
				authorityByPath.set(token.tokenPath, {
					id: state.id,
					file: file.label,
				});
			}
		}
	}
	// Reissued duplicates get their fresh identity here so other files
	// sharing the path adopt it.
	for (const conflict of identity.conflicts) {
		if (conflict.kind !== 'duplicate-id' || conflict.crossFile) continue;
		const [, ...duplicates] = conflict.occurrences;
		for (const occurrence of duplicates ?? []) {
			const key = `${occurrence.file}\n${occurrence.path}`;
			const fresh = generateId();
			reissueByPath.set(key, fresh);
			authorityByPath.set(occurrence.path, {
				id: fresh,
				file: occurrence.file,
			});
		}
	}

	const reissuedKeys = new Set(
		[...reissueByPath.entries()]
			.filter(([, id]) => id !== '')
			.map(([key]) => key),
	);

	// --- Warnings: non-canonical committed ids (advisory only) ---
	for (const occurrence of identity.nonCanonical) {
		if (reissuedKeys.has(`${occurrence.file}\n${occurrence.path}`)) continue;
		report.warnings.push({
			file: occurrence.file,
			tokenPath: occurrence.path,
			message: `id "${occurrence.id}" is not in the generated 32-hex form (hint: check for typos)`,
		});
	}

	// --- Document slot: main.yaml root `$id` (theme identity, Decision 1) ---
	const main = scanned[0];
	let rootChange: IdsChange | undefined;
	if (main) {
		const rootState = rootIdSlotState(main.doc);
		if (rootState.kind === 'invalid') {
			report.problems.push({
				message: `${main.label}: root $id must be a string or null, got ${typeof rootState.value}`,
			});
		} else if (rootState.kind !== 'committed') {
			rootChange = {
				file: main.label,
				tokenPath: DOCUMENT_PATH,
				kind: 'generate',
				mode: rootState.kind === 'empty' ? 'fill' : 'insert',
				id: generateId(),
			};
		}
	}

	if (report.problems.length > 0) {
		fillFileResults(report, scanned, new Map());
		return report;
	}

	// --- Change plan (canonical file order, document order per file) ---
	// Counter semantics: `added` counts the origin occurrence of a freshly
	// generated identity; `synced` counts every occurrence adopting the
	// path's authority id — an already committed one, or the fresh id minted
	// at the path's origin occurrence earlier in the same run.
	const freshByPath = new Map<string, PathAuthority>();
	const changesByFile = new Map<string, IdsChange[]>();
	for (const file of scanned) {
		for (const token of file.tokens) {
			const state = idSlotState(token.tokenPath, token.node);
			const key = `${file.label}\n${token.tokenPath}`;
			if (state.kind === 'committed') {
				const reissue = reissueByPath.get(key);
				if (reissue === undefined) continue; // healthy, untouched
				recordChange(changesByFile, {
					file: file.label,
					tokenPath: token.tokenPath,
					kind: 'generate',
					mode: 'reissue',
					id: reissue,
				});
				continue;
			}
			const authority = authorityByPath.get(token.tokenPath);
			if (authority) {
				recordChange(changesByFile, {
					file: file.label,
					tokenPath: token.tokenPath,
					kind: 'sync',
					mode: state.kind === 'empty' ? 'fill' : 'insert',
					id: authority.id,
					source: authority.file,
				});
				continue;
			}
			let fresh = freshByPath.get(token.tokenPath);
			if (fresh === undefined) {
				fresh = { id: generateId(), file: file.label };
				freshByPath.set(token.tokenPath, fresh);
				recordChange(changesByFile, {
					file: file.label,
					tokenPath: token.tokenPath,
					kind: 'generate',
					mode: state.kind === 'empty' ? 'fill' : 'insert',
					id: fresh.id,
				});
				continue;
			}
			recordChange(changesByFile, {
				file: file.label,
				tokenPath: token.tokenPath,
				kind: 'sync',
				mode: state.kind === 'empty' ? 'fill' : 'insert',
				id: fresh.id,
				source: fresh.file,
			});
		}
	}

	// Document root precedes every token in document order.
	if (rootChange) {
		const list = changesByFile.get(rootChange.file);
		if (list) list.unshift(rootChange);
		else changesByFile.set(rootChange.file, [rootChange]);
	}

	const changes = [...changesByFile.values()].flat();
	report.changes = changes.slice(0, MAX_LISTED_CHANGES);
	report.added = changes.filter((change) => change.kind === 'generate').length;
	report.synced = changes.filter((change) => change.kind === 'sync').length;

	if (changes.length === 0) {
		fillFileResults(report, scanned, changesByFile);
		return report;
	}

	// --- Serialisation (surgical, shared M2 mechanism) ---
	const outputs = new Map<string, string>();
	for (const file of scanned) {
		const fileChanges = changesByFile.get(file.label);
		if (!fileChanges || fileChanges.length === 0) continue;
		if (file.options === undefined) {
			report.problems.push({
				message: `${file.label}: file format does not round-trip byte-identically (folded block scalars, mixed flow conventions, or irregular whitespace); migrate this file manually before running ids`,
			});
			continue;
		}
		for (const change of fileChanges) {
			if (change.tokenPath === DOCUMENT_PATH) {
				applyRootIdChange(file.doc, change.id);
				continue;
			}
			const token = file.tokens.find(
				(candidate) => candidate.tokenPath === change.tokenPath,
			);
			if (!token) continue;
			applyIdChange(token, change.id);
		}
		outputs.set(file.abs, file.doc.toString(file.options));
	}
	if (report.problems.length > 0) {
		fillFileResults(report, scanned, changesByFile);
		return report;
	}

	fillFileResults(report, scanned, changesByFile);

	if (!write) return report;

	// --- Git cleanliness gate (write only) ---
	const git = await gitStatus(dir);
	report.git = git;
	if (git === 'dirty' && !allowDirty) {
		report.refusal = 'dirty-worktree';
		return report;
	}
	if (git === 'unavailable') {
		report.warnings.push({
			message:
				'git status unavailable; workspace cleanliness could not be verified',
		});
	}

	// --- Write back (all plans already serialised: all-or-nothing) ---
	for (const file of scanned) {
		const content = outputs.get(file.abs);
		if (content === undefined) continue;
		await fs.writeFile(file.abs, content, 'utf8');
		report.written = true;
	}
	for (const result of report.files) {
		if (result.status === 'pending') result.status = 'written';
	}
	return report;
}

function recordChange(
	changesByFile: Map<string, IdsChange[]>,
	change: IdsChange,
): void {
	const list = changesByFile.get(change.file) ?? [];
	list.push(change);
	changesByFile.set(change.file, list);
}

/** In-place CST edit: fill the empty `$id` scalar or insert `$id` before `$value`. */
function applyIdChange(token: ScannedToken, id: string): void {
	if (token.idPair) {
		const value = token.idPair.value;
		if (isScalar(value)) {
			value.value = id;
			value.type = Scalar.PLAIN;
		} else {
			token.idPair.value = new Scalar(id);
		}
		return;
	}
	token.node.items.splice(
		token.valueIndex,
		0,
		new Pair(new Scalar('$id'), new Scalar(id)),
	);
}

/** In-place CST edit: fill the root `$id` scalar or insert it as the first document key. */
function applyRootIdChange(doc: Document, id: string): void {
	const root = doc.contents;
	if (!isMap(root)) return;
	const pair = findPair(root, '$id');
	if (pair) {
		const value = pair.value;
		if (isScalar(value)) {
			value.value = id;
			value.type = Scalar.PLAIN;
		} else {
			pair.value = new Scalar(id);
		}
		return;
	}
	// Insertion keeps the `$schema` declaration first when present (the
	// document-level precedent for `$` keys), otherwise the very top.
	const schemaIndex = root.items.findIndex(
		(item) => pairKey(item) === '$schema',
	);
	const atIndex = schemaIndex >= 0 ? schemaIndex + 1 : 0;
	root.items.splice(atIndex, 0, new Pair(new Scalar('$id'), new Scalar(id)));
}

function fillFileResults(
	report: IdsWorkspaceReport,
	scanned: ScannedFile[],
	changesByFile: Map<string, IdsChange[]>,
): void {
	report.files = scanned.map((file) => {
		const fileChanges = changesByFile.get(file.label) ?? [];
		return {
			file: file.label,
			status:
				fileChanges.length === 0 ? ('clean' as const) : ('pending' as const),
			added: fileChanges.filter((change) => change.kind === 'generate').length,
			synced: fileChanges.filter((change) => change.kind === 'sync').length,
		};
	});
}
