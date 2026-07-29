import type {
	DtcgTokenGroup,
	ReferenceDataSources,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import {
	inferRootKeys,
	parseDtcgRef,
	REFERENCE_PATTERN,
} from '../resolver/reference-utils.ts';

export interface ReferenceProvenance {
	consumerPath: string;
	reference: string;
	targetPath: string;
	targetValueKind: 'array' | 'object' | 'scalar';
}

export type ReferenceProvenanceMap = Map<string, ReferenceProvenance>;

export class DtcgReferenceTypeError extends Error {
	constructor(message: string) {
		super(`DTCG reference type validation failed: ${message}`);
		this.name = 'DtcgReferenceTypeError';
	}
}

interface ReferenceTarget {
	reference: string;
	source: string;
	path: string[];
}

interface TokenInfo {
	path: string;
	type?: string;
	value: unknown;
}

const COMPOSITE_FIELD_TYPES: Record<string, Record<string, string>> = {
	color: { alpha: 'number' },
	border: { color: 'color', width: 'dimension', style: 'strokeStyle' },
	transition: {
		duration: 'duration',
		delay: 'duration',
		timingFunction: 'cubicBezier',
	},
	shadow: {
		color: 'color',
		offsetX: 'dimension',
		offsetY: 'dimension',
		blur: 'dimension',
		spread: 'dimension',
	},
	typography: {
		fontFamily: 'fontFamily',
		fontSize: 'dimension',
		fontWeight: 'fontWeight',
		letterSpacing: 'dimension',
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueKind(value: unknown): ReferenceProvenance['targetValueKind'] {
	if (Array.isArray(value)) return 'array';
	if (isRecord(value)) return 'object';
	return 'scalar';
}

export function recordReferenceProvenance(
	provenance: ReferenceProvenanceMap | undefined,
	consumerPath: string,
	reference: string,
	targetPath: string,
	targetValue: unknown,
): void {
	provenance?.set(consumerPath, {
		consumerPath,
		reference,
		targetPath,
		targetValueKind: valueKind(targetValue),
	});
}

function parseReference(value: unknown): ReferenceTarget | undefined {
	if (typeof value === 'string') {
		const match = value.match(REFERENCE_PATTERN);
		const referencePath = match?.[1];
		if (!referencePath) return undefined;
		const [source, ...path] = referencePath.split('.');
		if (!source || path.length === 0) return undefined;
		return { reference: value, source, path };
	}
	if (!isRecord(value) || typeof value.$ref !== 'string') return undefined;
	const parsed = parseDtcgRef(value.$ref);
	if (!parsed) return undefined;
	return {
		reference: value.$ref,
		source: parsed.source,
		path: parsed.path,
	};
}

function findToken(
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
	target: ReferenceTarget,
	seen: Set<string> = new Set(),
): TokenInfo | undefined {
	const targetKey = [target.source, ...target.path].join('.');
	if (seen.has(targetKey)) return undefined;
	seen.add(targetKey);
	const internal = rootKeys.has(target.source);
	const root: unknown = internal ? tree : sources[target.source];
	const path = internal ? [target.source, ...target.path] : target.path;
	if (!isRecord(root)) return undefined;

	let current: unknown = root;
	let inheritedType: string | undefined;
	for (const segment of path) {
		if (!isRecord(current)) return undefined;
		if (typeof current.$type === 'string') inheritedType = current.$type;
		current = current[segment];
	}
	if (!isRecord(current) || !('$value' in current)) return undefined;
	let type = typeof current.$type === 'string' ? current.$type : inheritedType;
	if (!type) {
		const aliasTarget = parseReference(current.$value);
		if (aliasTarget) {
			type = findToken(tree, sources, rootKeys, aliasTarget, seen)?.type;
		}
	}
	return {
		path: [target.source, ...target.path].join('.'),
		type,
		value: current.$value,
	};
}

function assertReferenceType(
	value: unknown,
	expectedType: string | undefined,
	consumerPath: string,
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
): void {
	if (!expectedType) return;
	const reference = parseReference(value);
	if (!reference) return;
	const target = findToken(tree, sources, rootKeys, reference);
	// Untyped legacy targets remain shape-validated after resolution.
	if (!target?.type || target.type === expectedType) return;
	throw new DtcgReferenceTypeError(
		`${consumerPath} expected type "${expectedType}" but target "${target.path}" has type "${target.type}"`,
	);
}

function validateNestedReferences(
	value: unknown,
	tokenType: string | undefined,
	path: string,
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
): void {
	assertReferenceType(value, tokenType, path, tree, sources, rootKeys);
	if (parseReference(value)) return;

	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			const item = value[index];
			const itemPath = `${path}[${index}]`;
			const expected =
				tokenType === 'shadow' || tokenType === 'gradient'
					? tokenType
					: undefined;
			assertReferenceType(item, expected, itemPath, tree, sources, rootKeys);
			if (!parseReference(item)) {
				validateCompositeFields(
					item,
					tokenType,
					itemPath,
					tree,
					sources,
					rootKeys,
				);
			}
		}
		return;
	}
	validateCompositeFields(value, tokenType, path, tree, sources, rootKeys);
}

function validateCompositeFields(
	value: unknown,
	tokenType: string | undefined,
	path: string,
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
): void {
	if (!isRecord(value) || !tokenType) return;
	const fieldTypes = COMPOSITE_FIELD_TYPES[tokenType];
	if (fieldTypes) {
		for (const [field, expectedType] of Object.entries(fieldTypes)) {
			if (!(field in value)) continue;
			assertReferenceType(
				value[field],
				expectedType,
				`${path}.${field}`,
				tree,
				sources,
				rootKeys,
			);
		}
	}
	if (tokenType === 'gradient' && 'color' in value) {
		assertReferenceType(
			value.color,
			'color',
			`${path}.color`,
			tree,
			sources,
			rootKeys,
		);
	}
}

function walkGroup(
	group: Record<string, unknown>,
	path: string,
	inheritedType: string | undefined,
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
): void {
	const groupType =
		typeof group.$type === 'string' ? group.$type : inheritedType;
	for (const [key, node] of Object.entries(group)) {
		if (key.startsWith('$') || !isRecord(node)) continue;
		const nodePath = path ? `${path}.${key}` : key;
		if ('$value' in node) {
			const tokenType = typeof node.$type === 'string' ? node.$type : groupType;
			validateNestedReferences(
				node.$value,
				tokenType,
				`${nodePath}.$value`,
				tree,
				sources,
				rootKeys,
			);
		} else {
			walkGroup(node, nodePath, groupType, tree, sources, rootKeys);
		}
	}
}

export function validateCompleteTokenReferenceTypes(
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
): void {
	const rootKeys = inferRootKeys(tree);
	walkGroup(
		tree as Record<string, unknown>,
		'',
		undefined,
		tree,
		sources,
		rootKeys,
	);
}

function getResolvedTokenType(
	tree: ResolvedTokenGroup,
	tokenPath: string[],
): string | undefined {
	let current: unknown = tree;
	let inheritedType: string | undefined;
	for (const segment of tokenPath) {
		if (!isRecord(current)) return undefined;
		if (typeof current.$type === 'string') inheritedType = current.$type;
		current = current[segment];
	}
	if (!isRecord(current) || !('$value' in current)) return undefined;
	return typeof current.$type === 'string' ? current.$type : inheritedType;
}

export function validateResolvedCompositeReferences(
	tree: ResolvedTokenGroup,
	provenance: ReferenceProvenanceMap,
): void {
	for (const entry of provenance.values()) {
		if (entry.targetValueKind !== 'array') continue;
		const valueMarker = entry.consumerPath.indexOf('.$value');
		if (valueMarker < 0) continue;
		const tokenPath = entry.consumerPath.slice(0, valueMarker).split('.');
		const tokenType = getResolvedTokenType(tree, tokenPath);
		if (
			(tokenType === 'shadow' || tokenType === 'gradient') &&
			/^\.\$value\[\d+\]/.test(entry.consumerPath.slice(valueMarker))
		) {
			throw new DtcgReferenceTypeError(
				`${entry.consumerPath} references "${entry.targetPath}" whose value is an array; composite member references are not flattened`,
			);
		}
	}
}
