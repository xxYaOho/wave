import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import type { DoctorFinding } from '../../types/index.ts';
import { isDtcgRefValue } from '../../types/index.ts';
import { REFERENCE_PATTERN } from '../resolver/reference-utils.ts';

/**
 * Source-side token identity health (M1 contract). Doctor scans raw theme
 * trees across every theme file (multi-pass), which is data a single-pass
 * build never sees: cross-file id conflicts and whole-workspace reports.
 */

export interface IdentityFileInput {
	/** Display label, e.g. "main.yaml" or "profiles/mobile.yaml". */
	file: string;
	tree: Record<string, unknown>;
	/**
	 * Night overlay scan mode: overlay tokens are not independent
	 * registrations. Only non-empty ids that differ from the base tree's id at
	 * the same path participate in conflict detection; inherited or absent ids
	 * are skipped.
	 */
	baseTree?: Record<string, unknown>;
}

export interface IdentityOccurrence {
	file: string;
	path: string;
}

export type IdentityConflictKind =
	/**
	 * The same non-empty id registered at two or more distinct paths
	 * (cross-file or within a single file).
	 */
	| 'duplicate-id'
	/**
	 * The same path registered with two or more different non-empty ids
	 * across files (profiles and night overlays included).
	 */
	| 'divergent-id';

export interface IdentityConflict {
	kind: IdentityConflictKind;
	/** duplicate-id: the shared id. divergent-id: the first registered id. */
	id: string;
	occurrences: IdentityOccurrence[];
	crossFile: boolean;
	/** divergent-id only: every non-empty id registered at the path. */
	ids?: string[];
}

export interface ThemeIdentityReport {
	/** Root identity slots for main and day-profile documents. */
	documents: Array<{
		file: string;
		path: '(theme)';
		state: 'registered' | 'empty' | 'unregistered';
		id?: string;
	}>;
	/** Tokens carrying a non-empty `$id` identity. */
	registered: number;
	/** Tokens without an `$id` key (not yet registered). */
	unregistered: IdentityOccurrence[];
	/** Tokens whose `$id` is null/empty/whitespace (pre-declared empty slot). */
	emptySlots: IdentityOccurrence[];
	/** Non-empty ids not in the wave generated form (32 lowercase hex). */
	nonCanonical: Array<IdentityOccurrence & { id: string }>;
	/**
	 * DTCG §5.2.2 strict health: tokens whose type cannot be determined via
	 * `$type`, group inheritance, a resolvable typed reference target, the
	 * `color` root-name channel, or pending `$extends` expansion. Doctor
	 * errors: build keeps tolerance, doctor does not.
	 */
	undecidableTypes: IdentityOccurrence[];
	/** Object nodes with no `$value` and no child nodes (suspected typos). */
	typoEmptyNodes: IdentityOccurrence[];
	conflicts: IdentityConflict[];
}

/** Wave generated identity form: 32 lowercase hex characters. */
const GENERATED_ID_PATTERN = /^[0-9a-f]{32}$/;

function isEmptySlot(value: unknown): boolean {
	if (value === null) return true;
	if (typeof value !== 'string') return false;
	return value.trim() === '';
}

function isReferenceValue(value: unknown): boolean {
	return (
		(typeof value === 'string' && REFERENCE_PATTERN.test(value)) ||
		isDtcgRefValue(value)
	);
}

/** Dotted path segments of a curly alias or DTCG `#/...` $ref value. */
function referenceTargetSegments(value: unknown): string[] | undefined {
	if (typeof value === 'string') {
		const match = value.match(REFERENCE_PATTERN);
		return match ? match[1]!.split('.') : undefined;
	}
	if (isDtcgRefValue(value)) {
		const ref = value.$ref;
		if (!ref.startsWith('#/')) return undefined;
		const segments = ref
			.slice(2)
			.split('/')
			.map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
		return segments.length > 0 ? segments : undefined;
	}
	return undefined;
}

/**
 * DTCG §5.2.2 "reference resolves to a type" channel: a reference value is
 * decidable only when its target is visible in the scanned trees and carries
 * a determinable type (explicit `$type`, group inheritance, or a further
 * reference chain, cycle-guarded). Targets outside the scanned trees (builtin
 * resource namespaces) cannot be verified here and stay undecidable — build
 * keeps tolerance, doctor reports them.
 */
function resolvableReferenceType(
	value: unknown,
	trees: Array<Record<string, unknown>>,
	seen: Set<string> = new Set(),
): string | undefined {
	const segments = referenceTargetSegments(value);
	if (!segments) return undefined;
	const targetKey = segments.join('.');
	if (seen.has(targetKey)) return undefined;
	seen.add(targetKey);
	for (const tree of trees) {
		let current: unknown = tree;
		let inheritedType: string | undefined;
		let found = true;
		for (const segment of segments) {
			if (!isRecord(current)) {
				found = false;
				break;
			}
			if (typeof current.$type === 'string') {
				inheritedType = current.$type;
			}
			const next: unknown = current[segment];
			if (next === undefined) {
				found = false;
				break;
			}
			current = next;
		}
		if (!found || !isRecord(current) || !('$value' in current)) continue;
		const explicitType =
			typeof current.$type === 'string' ? (current.$type as string) : undefined;
		if (explicitType !== undefined) return explicitType;
		if (inheritedType !== undefined) return inheritedType;
		return resolvableReferenceType(current.$value, trees, seen);
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childKeysOf(node: Record<string, unknown>): string[] {
	return Object.keys(node).filter((key) => !key.startsWith('$'));
}

function emptyReport(): ThemeIdentityReport {
	return {
		documents: [],
		registered: 0,
		unregistered: [],
		emptySlots: [],
		nonCanonical: [],
		undecidableTypes: [],
		typoEmptyNodes: [],
		conflicts: [],
	};
}

function nodeAt(
	tree: Record<string, unknown>,
	path: string,
): Record<string, unknown> | undefined {
	let current: unknown = tree;
	for (const segment of path.split('.')) {
		if (!isRecord(current)) return undefined;
		current = current[segment];
	}
	return isRecord(current) ? current : undefined;
}

interface IdRegistration {
	file: string;
	path: string;
	id: string;
}

/**
 * Scan raw theme trees for token identity health. Files are reported under
 * their display label; night overlays and profiles participate like main,
 * except overlay tokens only contribute conflicting ids (see
 * `IdentityFileInput.baseTree`).
 *
 * Cross-file conflict semantics (three-way):
 * - same id at different paths (across files) = conflict;
 * - same path with different ids (across files) = conflict;
 * - same path with the same id (across files) = consistent (the healthy
 *   post-sync state; night overlay same-id inheritance likewise registers
 *   once, never a conflict).
 */
export function collectThemeIdentityReport(
	files: IdentityFileInput[],
): ThemeIdentityReport {
	const report = emptyReport();
	const idRegistrations = new Map<string, IdRegistration[]>();
	const pathRegistrations = new Map<string, IdRegistration[]>();
	const scanTrees = files.map((file) => file.tree);

	function register(occurrence: IdRegistration): void {
		const byId = idRegistrations.get(occurrence.id) ?? [];
		byId.push(occurrence);
		idRegistrations.set(occurrence.id, byId);
		const byPath = pathRegistrations.get(occurrence.path) ?? [];
		byPath.push(occurrence);
		pathRegistrations.set(occurrence.path, byPath);
	}

	function walkOverlay(
		node: unknown,
		path: string,
		file: string,
		baseTree: Record<string, unknown>,
	): void {
		if (!isRecord(node)) return;
		if ('$value' in node) {
			const id = node.$id;
			if (typeof id !== 'string' || id.trim() === '') return;
			const base = nodeAt(baseTree, path);
			const baseId = base?.$id;
			if (baseId === id) return; // inherited identity, single registration
			register({ file, path, id });
			return;
		}
		for (const [key, child] of Object.entries(node)) {
			if (key.startsWith('$') || key === 'doctor') continue;
			walkOverlay(child, path ? `${path}.${key}` : key, file, baseTree);
		}
	}

	function walk(
		node: unknown,
		path: string,
		file: string,
		inheritedType: string | undefined,
		chainHasExtends: boolean,
	): void {
		if (!isRecord(node)) return;

		if ('$value' in node) {
			const occurrence: IdentityOccurrence = { file, path };
			const id = node.$id;
			if (!('$id' in node)) {
				report.unregistered.push(occurrence);
			} else if (isEmptySlot(id)) {
				report.emptySlots.push(occurrence);
			} else {
				report.registered += 1;
				register({ file, path, id: id as string });
				if (typeof id === 'string' && !GENERATED_ID_PATTERN.test(id)) {
					report.nonCanonical.push({ ...occurrence, id });
				}
			}

			// Type decidability mirrors the raw-phase view of the transformer:
			// explicit $type, group inheritance, the `color` root-name channel,
			// a resolvable typed reference target, and pending $extends
			// expansion decide the type; anything else would require guessing.
			const value = node.$value;
			const explicitType =
				typeof node.$type === 'string' ? (node.$type as string) : undefined;
			const referenceTyped =
				isReferenceValue(value) &&
				resolvableReferenceType(value, scanTrees) !== undefined;
			const colorRootTyped = path.split('.').slice(0, -1).pop() === 'color';
			if (
				explicitType === undefined &&
				inheritedType === undefined &&
				!referenceTyped &&
				!colorRootTyped &&
				!chainHasExtends &&
				value !== null &&
				value !== undefined
			) {
				report.undecidableTypes.push(occurrence);
			}
			return;
		}

		if (childKeysOf(node).length === 0) {
			report.typoEmptyNodes.push({ file, path });
			return;
		}

		const groupType =
			typeof node.$type === 'string' ? (node.$type as string) : inheritedType;
		const nextChainHasExtends = chainHasExtends || '$extends' in node;
		for (const [key, child] of Object.entries(node)) {
			if (key.startsWith('$')) continue;
			walk(
				child,
				path ? `${path}.${key}` : key,
				file,
				groupType,
				nextChainHasExtends,
			);
		}
	}

	for (const { file, tree, baseTree } of files) {
		if (
			!baseTree &&
			!file.endsWith('@night.yaml') &&
			!file.endsWith('@night.yml')
		) {
			const id = tree.$id;
			if (!('$id' in tree)) {
				report.documents.push({ file, path: '(theme)', state: 'unregistered' });
			} else if (typeof id !== 'string' || id.trim() === '') {
				report.documents.push({ file, path: '(theme)', state: 'empty' });
			} else {
				report.documents.push({
					file,
					path: '(theme)',
					state: 'registered',
					id,
				});
			}
		}
		if (baseTree) {
			walkOverlay(tree, '', file, baseTree);
			continue;
		}
		for (const [key, child] of Object.entries(tree)) {
			if (key.startsWith('$')) continue;
			if (key === 'doctor') continue; // validated separately
			walk(child, key, file, undefined, false);
		}
	}

	// Rule 1: same id at distinct paths (dedupe same-path re-registrations —
	// ids synced across files are one logical registration, not a conflict).
	for (const [id, occurrences] of idRegistrations) {
		const distinctPaths = new Map<string, IdentityOccurrence>();
		for (const occurrence of occurrences) {
			if (!distinctPaths.has(occurrence.path)) {
				distinctPaths.set(occurrence.path, occurrence);
			}
		}
		if (distinctPaths.size < 2) continue;
		const distinct = [...distinctPaths.values()];
		report.conflicts.push({
			kind: 'duplicate-id',
			id,
			occurrences: distinct,
			crossFile: new Set(distinct.map((item) => item.file)).size > 1,
		});
	}

	// Rule 2: same path registered with different ids across files.
	for (const [path, registrations] of pathRegistrations) {
		const ids = [...new Set(registrations.map((item) => item.id))];
		if (ids.length < 2) continue;
		report.conflicts.push({
			kind: 'divergent-id',
			id: registrations[0]!.id,
			occurrences: registrations.map((item) => ({ file: item.file, path })),
			crossFile: new Set(registrations.map((item) => item.file)).size > 1,
			ids,
		});
	}

	report.conflicts.sort(
		(a, b) =>
			a.id.localeCompare(b.id) ||
			(a.occurrences[0]?.path ?? '').localeCompare(
				b.occurrences[0]?.path ?? '',
			),
	);

	return report;
}

/**
 * Single source for identity conflict message text. Doctor findings prefix
 * it with `Cross-file token`; the CLI identity report prefixes it with the
 * cross-file/within-file label, keeping one wording for both renderers.
 */
export function describeIdentityConflict(conflict: IdentityConflict): string {
	if (conflict.kind === 'duplicate-id') {
		return `$id conflict "${conflict.id}": ${conflict.occurrences
			.map((occurrence) => `${occurrence.file}:${occurrence.path}`)
			.join(', ')}`;
	}
	return `$id conflict at "${conflict.occurrences[0]?.path ?? ''}": ${conflict.occurrences
		.map((occurrence) => occurrence.file)
		.join(', ')} (${(conflict.ids ?? []).map((id) => `"${id}"`).join(' vs ')})`;
}

/**
 * Blocking findings: cross-file id conflicts and DTCG §5.2.2 undecidable
 * token types are doctor errors (build keeps tolerance).
 */
export function identityBlockingFindings(
	report: ThemeIdentityReport,
): DoctorFinding[] {
	const conflictFindings = report.conflicts
		.filter((conflict) => conflict.crossFile)
		.map((conflict): DoctorFinding => {
			return {
				level: 'error' as const,
				message: `Cross-file token ${describeIdentityConflict(conflict)}`,
			};
		});
	const typeFindings = report.undecidableTypes.map(
		(occurrence): DoctorFinding => ({
			level: 'error' as const,
			message: `Token type cannot be determined (DTCG §5.2.2): ${occurrence.file}:${occurrence.path}`,
		}),
	);
	return [...conflictFindings, ...typeFindings];
}

/**
 * Read and parse the theme files for an identity scan. Files that cannot be
 * read or parsed are skipped; their health is covered by other checks.
 * Night overlay files declare the label of their day base; when the base is
 * present the overlay is scanned in night-overlay mode.
 */
export async function loadIdentityInputs(
	files: Array<{ label: string; path: string; baseLabel?: string }>,
): Promise<IdentityFileInput[]> {
	const trees = new Map<string, Record<string, unknown>>();
	for (const file of files) {
		try {
			const content = await fs.readFile(file.path, 'utf8');
			const parsed = yaml.load(content);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				continue;
			}
			trees.set(file.label, parsed as Record<string, unknown>);
		} catch {
			// Unreadable files fail loudly in build/doctor context checks.
		}
	}

	const inputs: IdentityFileInput[] = [];
	for (const file of files) {
		const tree = trees.get(file.label);
		if (!tree) continue;
		const baseTree = file.baseLabel ? trees.get(file.baseLabel) : undefined;
		inputs.push(
			baseTree
				? { file: file.label, tree, baseTree }
				: { file: file.label, tree },
		);
	}
	return inputs;
}
