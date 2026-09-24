import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	type Document,
	isMap,
	isSeq,
	type Node,
	Pair,
	parseDocument,
	Scalar,
	YAMLMap,
} from 'yaml';

/**
 * One-shot mechanical migration of the legacy `$extensions` sketch family to
 * the redesigned form (Decision 9):
 *
 *   $extensions.sketch.*   -> $extensions.platform.sketch.*
 *   $extensions.outline    -> $extensions.platform.sketch.outline
 *
 * `typography` stays top-level and is never touched. The rewrite is surgical:
 * a per-file round-trip preflight guarantees untouched regions stay
 * byte-identical (comments, blank lines, indentation, key order), and a
 * second run is a no-op (idempotent). Files mixing legacy and new keys are
 * reported as errors — never guessed or partially merged.
 *
 * This module is the single write-back mechanism shared by `wave dt
 * migrate-extensions` (M2) and the M3 ids write-back.
 */

type WriteOptions = Parameters<Document['toString']>[0];

/**
 * Probe serialization options under which an UNMODIFIED document stringifies
 * byte-identically. Returns undefined when the file uses a construct the
 * writer cannot reproduce (folded block scalars, mixed flow-padding
 * conventions, indent-only blank lines, CRLF) — such files must not be
 * written surgically.
 */
export function detectWriteOptions(source: string): WriteOptions | undefined {
	const candidates: WriteOptions[] = [
		{ lineWidth: 0 },
		{ lineWidth: 0, flowCollectionPadding: false },
	];
	for (const options of candidates) {
		if (parseDocument(source).toString(options) === source) return options;
	}
	return undefined;
}

function collectExtensionMaps(
	node: Node | null,
	out: YAMLMap[] = [],
): YAMLMap[] {
	if (isMap(node)) {
		for (const item of node.items) {
			if (
				(item.key as Scalar | undefined)?.value === '$extensions' &&
				isMap(item.value)
			) {
				out.push(item.value);
			}
			collectExtensionMaps((item.value as Node | null) ?? null, out);
		}
	} else if (isSeq(node)) {
		for (const item of node.items) collectExtensionMaps(item as Node, out);
	}
	return out;
}

function extensionNodePaths(doc: Document): {
	legacy: string[];
	platform: string[];
} {
	const legacy: string[] = [];
	const platform: string[] = [];
	const visit = (node: Node | null, path: string[]): void => {
		if (isMap(node)) {
			for (const item of node.items) {
				const key = String((item.key as Scalar | undefined)?.value);
				if (key === '$extensions' && isMap(item.value)) {
					const keys = item.value.items.map((it) =>
						String((it.key as Scalar | undefined)?.value),
					);
					const display =
						path.length > 0 ? `${path.join('.')}.$extensions` : '$extensions';
					if (keys.includes('sketch') || keys.includes('outline')) {
						legacy.push(display);
					}
					if (keys.includes('platform')) {
						platform.push(display);
					}
				}
				visit((item.value as Node | null) ?? null, [...path, key]);
			}
		} else if (isSeq(node)) {
			node.items.forEach((item, index) => {
				visit(item as Node, [...path, String(index)]);
			});
		}
	};
	visit(doc.contents, []);
	return { legacy, platform };
}

export interface ExtensionsMigrationStats {
	sketchRenamed: number;
	outlineRenamed: number;
	nodesTouched: number;
}

/**
 * Rename legacy sketch-family keys to `platform.sketch` inside one parsed
 * document. The original sketch map node is kept as the `platform.sketch`
 * value (map identity preserves its comments and flow markers); an outline
 * pair is moved into it according to its source-relative order. When only an
 * outline exists a fresh container is created. `platform` replaces the first
 * legacy key in place, preserving sibling order.
 */
export function renameExtensionsInDocument(
	doc: Document,
): ExtensionsMigrationStats {
	const stats: ExtensionsMigrationStats = {
		sketchRenamed: 0,
		outlineRenamed: 0,
		nodesTouched: 0,
	};
	for (const ext of collectExtensionMaps(doc.contents)) {
		const sketchIdx = ext.items.findIndex(
			(it) => (it.key as Scalar | undefined)?.value === 'sketch',
		);
		const outlineIdx = ext.items.findIndex(
			(it) => (it.key as Scalar | undefined)?.value === 'outline',
		);
		if (sketchIdx < 0 && outlineIdx < 0) continue;
		stats.nodesTouched++;

		const sketchPair = sketchIdx >= 0 ? ext.items[sketchIdx] : undefined;
		const outlinePair = outlineIdx >= 0 ? ext.items[outlineIdx] : undefined;
		const outlineFirst = sketchIdx < 0 || outlineIdx < sketchIdx;

		let platformSketch: YAMLMap;
		if (sketchPair && isMap(sketchPair.value)) {
			platformSketch = sketchPair.value;
			if (outlinePair) {
				if (outlineFirst) platformSketch.items.unshift(outlinePair);
				else platformSketch.items.push(outlinePair);
			}
		} else {
			platformSketch = new YAMLMap();
			if (sketchPair) platformSketch.items.push(sketchPair);
			if (outlinePair) platformSketch.items.push(outlinePair);
		}
		const platformPair = new Pair(new Scalar('platform'), new YAMLMap());
		(platformPair.value as YAMLMap).items.push(
			new Pair(new Scalar('sketch'), platformSketch),
		);

		const anchorIdx = Math.min(
			...[sketchIdx, outlineIdx].filter((x): x is number => x >= 0),
		);
		const removed = new Set([sketchIdx, outlineIdx].filter((x) => x >= 0));
		ext.items.splice(anchorIdx, 1, platformPair);
		for (let i = ext.items.length - 1; i >= 0; i--) {
			if (removed.has(i) && i !== anchorIdx) ext.items.splice(i, 1);
		}
		if (sketchIdx >= 0) stats.sketchRenamed++;
		if (outlineIdx >= 0) stats.outlineRenamed++;
	}
	return stats;
}

export type ExtensionsMigrationStatus =
	| 'clean'
	| 'mixed'
	| 'unsupported'
	| 'migrated';

export interface ExtensionsMigrationResult {
	status: ExtensionsMigrationStatus;
	sketchRenamed: number;
	outlineRenamed: number;
	/** Present for `mixed` / `unsupported`; user-facing detail. */
	message?: string;
	/** New file content; present only for `migrated`. */
	content?: string;
}

const MAX_LISTED_PATHS = 5;

/** Classify and (when clean) migrate one file's source text. */
export function migrateExtensionsSource(
	source: string,
): ExtensionsMigrationResult {
	const doc = parseDocument(source);
	const { legacy, platform } = extensionNodePaths(doc);

	// Already migrated (or never legacy): idempotent no-op regardless of
	// new-form keys present.
	if (legacy.length === 0) {
		return { status: 'clean', sketchRenamed: 0, outlineRenamed: 0 };
	}

	if (legacy.length > 0 && platform.length > 0) {
		const listed = [...legacy, ...platform]
			.slice(0, MAX_LISTED_PATHS)
			.map((p) => `  - ${p}`)
			.join('\n');
		return {
			status: 'mixed',
			sketchRenamed: 0,
			outlineRenamed: 0,
			message: `file mixes legacy (sketch/outline) and new (platform.sketch) extensions; migrate-extensions does not guess — unify the file manually\n${listed}`,
		};
	}

	const options = detectWriteOptions(source);
	if (options === undefined) {
		return {
			status: 'unsupported',
			sketchRenamed: 0,
			outlineRenamed: 0,
			message:
				'file format does not round-trip byte-identically (folded block scalars, mixed flow conventions, or irregular whitespace); migrate this file manually',
		};
	}

	const stats = renameExtensionsInDocument(doc);
	return {
		status: 'migrated',
		...stats,
		content: doc.toString(options),
	};
}

export class MigrationEntryError extends Error {
	readonly code: 'ENTRY_NOT_FOUND' | 'ENTRY_NOT_MAIN';
	constructor(code: 'ENTRY_NOT_FOUND' | 'ENTRY_NOT_MAIN', message: string) {
		super(message);
		this.code = code;
	}
}

export interface ExtensionsMigrationFileReport {
	/** Display path relative to the workspace entry's directory. */
	file: string;
	status: ExtensionsMigrationStatus;
	sketchRenamed: number;
	outlineRenamed: number;
	message?: string;
}

export interface ExtensionsMigrationReport {
	files: ExtensionsMigrationFileReport[];
	write: boolean;
	migrated: number;
	clean: number;
	mixed: number;
	unsupported: number;
}

async function resolveMigrationTargets(
	entry: string,
): Promise<{ dir: string; files: string[] }> {
	const absolute = path.resolve(entry);
	if (path.basename(absolute) !== 'main.yaml') {
		throw new MigrationEntryError(
			'ENTRY_NOT_MAIN',
			`migration entry must be a main.yaml file, got "${entry}"`,
		);
	}
	let entryStat: Stats;
	try {
		entryStat = await fs.stat(absolute);
	} catch {
		throw new MigrationEntryError(
			'ENTRY_NOT_FOUND',
			`main.yaml not found at "${entry}"`,
		);
	}
	if (!entryStat.isFile()) {
		throw new MigrationEntryError(
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
			if (name.endsWith('.yaml')) files.push(path.join(profilesDir, name));
		}
	} catch {
		// No profiles directory: single-file workspace.
	}
	return { dir, files };
}

/**
 * Walk a workspace (main.yaml + profiles/*.yaml) and classify every file.
 * With `write`, migration is all-or-nothing: if any file is mixed-form or
 * unsupported, nothing is written; otherwise every migratable file is
 * rewritten surgically. Without `write` this is a dry-run report.
 */
export async function migrateExtensionsWorkspace(
	entry: string,
	write: boolean,
): Promise<ExtensionsMigrationReport> {
	const { dir, files } = await resolveMigrationTargets(entry);
	const report: ExtensionsMigrationReport = {
		files: [],
		write,
		migrated: 0,
		clean: 0,
		mixed: 0,
		unsupported: 0,
	};

	const plans: Array<{
		file: string;
		result: ExtensionsMigrationResult;
	}> = [];
	for (const file of files) {
		const source = await fs.readFile(file, 'utf8');
		const result = migrateExtensionsSource(source);
		plans.push({ file, result });
		const status = result.status;
		report.files.push({
			file: path.relative(dir, file),
			status,
			sketchRenamed: result.sketchRenamed,
			outlineRenamed: result.outlineRenamed,
			message: result.message,
		});
		report[status]++;
	}

	const blocked = report.mixed + report.unsupported;
	if (write && blocked === 0) {
		for (const plan of plans) {
			if (
				plan.result.status === 'migrated' &&
				plan.result.content !== undefined
			) {
				await fs.writeFile(plan.file, plan.result.content, 'utf8');
			}
		}
	}

	return report;
}
