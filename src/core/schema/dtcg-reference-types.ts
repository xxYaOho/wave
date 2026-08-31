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

export type ReferencePathSegment = string | number;

export interface ReferenceLocation {
	label: string;
	segments: readonly ReferencePathSegment[];
}

export interface ReferenceProvenance {
	consumerPath: string;
	consumerSegments: readonly ReferencePathSegment[];
	reference: string;
	targetPath: string;
	targetSegments: readonly string[];
	resolvedTargetValueKind: 'array' | 'object' | 'scalar';
	scope: 'internal' | 'external';
	identity: boolean;
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

type ExpectedReferenceType = string | readonly string[];

const COMPOSITE_FIELD_TYPES: Record<
	string,
	Record<string, ExpectedReferenceType>
> = {
	color: { alpha: 'number' },
	border: { color: 'color', width: 'dimension', style: 'strokeStyle' },
	gradient: { color: 'color', position: 'number' },
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
		lineHeight: ['number', 'dimension'],
		color: 'color',
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueKind(
	value: unknown,
): ReferenceProvenance['resolvedTargetValueKind'] {
	if (Array.isArray(value)) return 'array';
	if (isRecord(value)) return 'object';
	return 'scalar';
}

export function recordReferenceProvenance(
	provenance: ReferenceProvenanceMap | undefined,
	consumer: ReferenceLocation,
	reference: string,
	targetSegments: readonly string[],
	targetValue: unknown,
	scope: ReferenceProvenance['scope'],
	identity: boolean,
): void {
	if (!provenance) return;
	const canonicalKey = JSON.stringify(consumer.segments);
	const existing = provenance.get(canonicalKey);
	const resolvedTargetValueKind = valueKind(targetValue);

	if (existing) {
		const upgradedIdentity = existing.identity && identity;
		provenance.set(canonicalKey, {
			...existing,
			resolvedTargetValueKind,
			identity: upgradedIdentity,
		});
		if (!upgradedIdentity) {
			deleteProvenanceDescendants(provenance, consumer.segments);
		}
		return;
	}

	if (hasComputedAncestor(provenance, consumer.segments)) return;

	provenance.set(canonicalKey, {
		consumerPath: consumer.label,
		consumerSegments: [...consumer.segments],
		reference,
		targetPath: targetSegments.join('.'),
		targetSegments: [...targetSegments],
		resolvedTargetValueKind,
		scope,
		identity,
	});
	if (!identity) {
		deleteProvenanceDescendants(provenance, consumer.segments);
	}
}

function isSegmentPrefix(
	prefix: readonly ReferencePathSegment[],
	path: readonly ReferencePathSegment[],
): boolean {
	return (
		prefix.length <= path.length &&
		prefix.every((segment, index) => Object.is(segment, path[index]))
	);
}

function hasComputedAncestor(
	provenance: ReferenceProvenanceMap,
	segments: readonly ReferencePathSegment[],
): boolean {
	for (const entry of provenance.values()) {
		if (!entry.identity && isSegmentPrefix(entry.consumerSegments, segments)) {
			return true;
		}
	}
	return false;
}

function deleteProvenanceDescendants(
	provenance: ReferenceProvenanceMap,
	segments: readonly ReferencePathSegment[],
): void {
	for (const [key, entry] of provenance) {
		if (
			entry.consumerSegments.length > segments.length &&
			isSegmentPrefix(segments, entry.consumerSegments)
		) {
			provenance.delete(key);
		}
	}
}

export function appendReferenceLocation(
	location: ReferenceLocation,
	segment: ReferencePathSegment,
): ReferenceLocation {
	return {
		label:
			typeof segment === 'number'
				? `${location.label}[${segment}]`
				: location.label
					? `${location.label}.${segment}`
					: segment,
		segments: [...location.segments, segment],
	};
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
	expectedType: ExpectedReferenceType | undefined,
	consumerPath: string,
	tree: DtcgTokenGroup,
	sources: ReferenceDataSources,
	rootKeys: Set<string>,
): void {
	if (!expectedType) return;
	const reference = parseReference(value);
	if (!reference) return;
	const target = findToken(tree, sources, rootKeys, reference);
	const expectedTypes = Array.isArray(expectedType)
		? expectedType
		: [expectedType];
	// Untyped legacy targets remain shape-validated after resolution.
	if (!target?.type || expectedTypes.includes(target.type)) return;
	const expectedLabel = expectedTypes.map((type) => `"${type}"`).join(' or ');
	throw new DtcgReferenceTypeError(
		`${consumerPath} expected type ${expectedLabel} but target "${target.path}" has type "${target.type}"`,
	);
}

function includesExpectedType(
	expectedType: ExpectedReferenceType,
	type: string,
): boolean {
	return Array.isArray(expectedType)
		? expectedType.includes(type)
		: expectedType === type;
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
	if (parseReference(value)) {
		validateCompositeFields(value, tokenType, path, tree, sources, rootKeys);
		return;
	}

	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			const item = value[index];
			const itemPath = `${path}[${index}]`;
			const expected =
				tokenType === 'shadow' || tokenType === 'gradient'
					? tokenType
					: undefined;
			assertReferenceType(item, expected, itemPath, tree, sources, rootKeys);
			validateCompositeFields(
				item,
				tokenType,
				itemPath,
				tree,
				sources,
				rootKeys,
			);
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
			const nestedType = includesExpectedType(expectedType, 'color')
				? 'color'
				: includesExpectedType(expectedType, 'strokeStyle')
					? 'strokeStyle'
					: undefined;
			if (nestedType !== undefined) {
				validateCompositeFields(
					value[field],
					nestedType,
					`${path}.${field}`,
					tree,
					sources,
					rootKeys,
				);
			}
		}
	}
	if (tokenType === 'strokeStyle' && Array.isArray(value.dashArray)) {
		for (let index = 0; index < value.dashArray.length; index++) {
			assertReferenceType(
				value.dashArray[index],
				'dimension',
				`${path}.dashArray[${index}]`,
				tree,
				sources,
				rootKeys,
			);
		}
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
		if (entry.resolvedTargetValueKind !== 'array') continue;
		const valueMarker = entry.consumerSegments.indexOf('$value');
		if (valueMarker < 0) continue;
		const tokenPath = entry.consumerSegments.slice(0, valueMarker);
		if (
			!tokenPath.every(
				(segment): segment is string => typeof segment === 'string',
			)
		) {
			continue;
		}
		const tokenType = getResolvedTokenType(tree, tokenPath);
		if (
			(tokenType === 'shadow' || tokenType === 'gradient') &&
			typeof entry.consumerSegments[valueMarker + 1] === 'number'
		) {
			throw new DtcgReferenceTypeError(
				`${entry.consumerPath} references "${entry.targetPath}" whose value is an array; composite member references are not flattened`,
			);
		}
	}
}
