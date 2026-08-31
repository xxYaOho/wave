import * as yaml from 'js-yaml';
import type { WaveFormatFn, WaveToken } from '../../../types/index.ts';
import {
	getTokenReferenceLineage,
	type TokenReferenceLineage,
} from '../../transformer/reference-lineage.ts';
import { formatFlatTokenValue } from './flat-value.ts';

interface BaseEntry {
	sourcePath: readonly string[];
	value: unknown;
	references: readonly TokenReferenceLineage[];
}

interface DirectEntry {
	kind: 'direct';
	base: BaseEntry;
	projectedPath: string;
	sourcePaths: string[];
}

interface CompositeEntry {
	kind: 'composite';
	groupPath: string;
	properties: Map<string, BaseEntry>;
	propertySources: Map<string, string[]>;
	sourcePaths: string[];
}

type LocalEntry = DirectEntry | CompositeEntry;

interface NamespaceState {
	entries: Map<string, LocalEntry>;
}

interface TargetEntry {
	base: BaseEntry;
	namespace: string;
	localKey: string;
	projectedPath: string;
}

function mdYamlError(tokenPath: string, reason: string): Error {
	return new Error(`md-yml platform error at ${tokenPath}: ${reason}`);
}

function assertFilterLayer(filterLayer: number): void {
	if (
		!Number.isFinite(filterLayer) ||
		!Number.isInteger(filterLayer) ||
		filterLayer < 0
	) {
		throw new Error(
			'md-yml platform filterLayer must be a non-negative finite integer',
		);
	}
}

function describeOwnKey(key: PropertyKey): string {
	return typeof key === 'symbol' ? key.toString() : JSON.stringify(key);
}

function childValuePath(valuePath: string, key: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
		? `${valuePath}.${key}`
		: `${valuePath}[${JSON.stringify(key)}]`;
}

function unsafeValueError(
	tokenPath: string,
	valuePath: string,
	reason: string,
): Error {
	return mdYamlError(
		tokenPath,
		`value at ${valuePath} cannot be represented safely in YAML: ${reason}`,
	);
}

function assertMdYamlSafeValue(
	value: unknown,
	tokenPath: string,
	valuePath = '$',
	ancestors = new Set<object>(),
): void {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return;
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw unsafeValueError(tokenPath, valuePath, 'number must be finite');
		}
		return;
	}
	if (typeof value !== 'object') {
		throw unsafeValueError(
			tokenPath,
			valuePath,
			`${typeof value} values are unsupported`,
		);
	}
	if (ancestors.has(value)) {
		throw unsafeValueError(tokenPath, valuePath, 'cycle detected');
	}

	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			const allowedKeys = new Set<string>(['length']);
			for (let index = 0; index < value.length; index++) {
				allowedKeys.add(String(index));
			}
			for (const key of Reflect.ownKeys(value)) {
				if (typeof key === 'symbol' || !allowedKeys.has(key)) {
					throw unsafeValueError(
						tokenPath,
						valuePath,
						`array has unsupported own key ${describeOwnKey(key)}`,
					);
				}
			}
			for (let index = 0; index < value.length; index++) {
				const descriptor = Object.getOwnPropertyDescriptor(
					value,
					String(index),
				);
				const itemPath = `${valuePath}[${index}]`;
				if (!descriptor) {
					throw unsafeValueError(
						tokenPath,
						itemPath,
						'array hole is unsupported',
					);
				}
				if (!descriptor.enumerable || !('value' in descriptor)) {
					throw unsafeValueError(
						tokenPath,
						itemPath,
						'array element must be an enumerable data property',
					);
				}
				assertMdYamlSafeValue(descriptor.value, tokenPath, itemPath, ancestors);
			}
			return;
		}

		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw unsafeValueError(
				tokenPath,
				valuePath,
				'only plain or null-prototype objects are supported',
			);
		}
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key === 'symbol') {
				throw unsafeValueError(
					tokenPath,
					valuePath,
					`object has unsupported symbol key ${describeOwnKey(key)}`,
				);
			}
			const propertyPath = childValuePath(valuePath, key);
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor) {
				throw unsafeValueError(
					tokenPath,
					propertyPath,
					'property descriptor is missing',
				);
			}
			if (!descriptor.enumerable) {
				throw unsafeValueError(
					tokenPath,
					propertyPath,
					'non-enumerable property is unsupported',
				);
			}
			if (!('value' in descriptor)) {
				throw unsafeValueError(
					tokenPath,
					propertyPath,
					'accessor property is unsupported',
				);
			}
			assertMdYamlSafeValue(
				descriptor.value,
				tokenPath,
				propertyPath,
				ancestors,
			);
		}
	} finally {
		ancestors.delete(value);
	}
}

function assertPathSegments(segments: string[], tokenPath: string): void {
	for (const segment of segments) {
		if (segment.length === 0) {
			throw mdYamlError(tokenPath, 'output path contains an empty segment');
		}
		if (segment.includes('.')) {
			throw mdYamlError(
				tokenPath,
				`source segment ${JSON.stringify(segment)} contains "." and cannot be referenced unambiguously`,
			);
		}
	}
}

function projectPath(
	actualPath: string[],
	sourcePath: string,
	filterLayer: number,
): { namespace: string; localKey: string } {
	const filtered = actualPath.slice(filterLayer);
	if (filtered.length < 2) {
		throw mdYamlError(
			sourcePath,
			`filterLayer ${filterLayer} must leave a namespace and local key`,
		);
	}
	assertPathSegments(filtered, sourcePath);
	return {
		namespace: filtered[0]!,
		localKey: filtered.slice(1).join('-'),
	};
}

function collisionError(target: string, sourcePaths: string[]): Error {
	return new Error(
		`md-yml platform collision at ${target}: ${sourcePaths.join(', ')}`,
	);
}

function canonicalPath(path: readonly (string | number)[]): string {
	return JSON.stringify(path);
}

function defineDataProperty(target: object, key: string, value: unknown): void {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}

function ownEnumerableDataValue(
	value: object,
	key: string,
): { found: true; value: unknown } | { found: false } {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (!descriptor?.enumerable || !('value' in descriptor)) {
		return { found: false };
	}
	return { found: true, value: descriptor.value };
}

function valueAtPath(
	root: unknown,
	path: readonly (string | number)[],
): { found: true; value: unknown } | { found: false } {
	let current = root;
	for (const segment of path) {
		if (typeof current !== 'object' || current === null) {
			return { found: false };
		}
		if (typeof segment === 'number') {
			if (
				!Array.isArray(current) ||
				!Number.isInteger(segment) ||
				segment < 0
			) {
				return { found: false };
			}
		} else if (Array.isArray(current)) {
			return { found: false };
		}
		const child = ownEnumerableDataValue(current, String(segment));
		if (!child.found) return child;
		current = child.value;
	}
	return { found: true, value: current };
}

function semanticEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (
		typeof left !== 'object' ||
		left === null ||
		typeof right !== 'object' ||
		right === null
	) {
		return false;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) return false;
		if (left.length !== right.length) return false;
		for (let index = 0; index < left.length; index++) {
			const leftItem = ownEnumerableDataValue(left, String(index));
			const rightItem = ownEnumerableDataValue(right, String(index));
			if (
				!leftItem.found ||
				!rightItem.found ||
				!semanticEqual(leftItem.value, rightItem.value)
			) {
				return false;
			}
		}
		return true;
	}
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	const rightKeySet = new Set(rightKeys);
	for (const key of leftKeys) {
		if (!rightKeySet.has(key)) return false;
		const leftItem = ownEnumerableDataValue(left, key);
		const rightItem = ownEnumerableDataValue(right, key);
		if (
			!leftItem.found ||
			!rightItem.found ||
			!semanticEqual(leftItem.value, rightItem.value)
		) {
			return false;
		}
	}
	return true;
}

function normalizedClone(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	if (Array.isArray(value)) {
		const clone: unknown[] = [];
		for (let index = 0; index < value.length; index++) {
			const item = ownEnumerableDataValue(value, String(index));
			if (!item.found)
				throw new Error('md-yml internal clone invariant failed');
			clone.push(normalizedClone(item.value));
		}
		return clone;
	}
	const clone = Object.create(Object.getPrototypeOf(value)) as object;
	for (const key of Object.keys(value)) {
		const item = ownEnumerableDataValue(value, key);
		if (!item.found) throw new Error('md-yml internal clone invariant failed');
		defineDataProperty(clone, key, normalizedClone(item.value));
	}
	return clone;
}

function writeValueAtPath(
	root: unknown,
	path: readonly (string | number)[],
	value: unknown,
): unknown {
	if (path.length === 0) return value;
	const clone = normalizedClone(root);
	let current = clone;
	for (let index = 0; index < path.length - 1; index++) {
		const segment = path[index]!;
		if (typeof current !== 'object' || current === null) {
			throw new Error('md-yml internal overlay invariant failed');
		}
		const child = ownEnumerableDataValue(current, String(segment));
		if (!child.found)
			throw new Error('md-yml internal overlay invariant failed');
		current = child.value;
	}
	if (typeof current !== 'object' || current === null) {
		throw new Error('md-yml internal overlay invariant failed');
	}
	defineDataProperty(current, String(path[path.length - 1]!), value);
	return clone;
}

function hasPathPrefix(
	path: readonly (string | number)[],
	prefix: readonly (string | number)[],
): boolean {
	return (
		path.length >= prefix.length &&
		prefix.every((segment, index) => Object.is(segment, path[index]))
	);
}

function normalizedReferences(
	base: BaseEntry,
): readonly TokenReferenceLineage[] {
	const sorted = [...base.references].sort((left, right) => {
		const lengthOrder = left.valuePath.length - right.valuePath.length;
		if (lengthOrder) return lengthOrder;
		const pathOrder = canonicalPath(left.valuePath).localeCompare(
			canonicalPath(right.valuePath),
		);
		return (
			pathOrder ||
			canonicalPath(left.targetPath).localeCompare(
				canonicalPath(right.targetPath),
			)
		);
	});
	const byValuePath = new Map<string, TokenReferenceLineage>();
	for (const candidate of sorted) {
		const key = canonicalPath(candidate.valuePath);
		const existing = byValuePath.get(key);
		if (!existing) {
			byValuePath.set(key, candidate);
			continue;
		}
		if (
			canonicalPath(existing.targetPath) !== canonicalPath(candidate.targetPath)
		) {
			throw mdYamlError(
				base.sourcePath.join('.'),
				`reference lineage contradiction at value path ${key}: ${existing.targetPath.join('.')} and ${candidate.targetPath.join('.')}`,
			);
		}
	}
	return [...byValuePath.values()];
}

function overlayReferences(
	base: BaseEntry,
	targets: ReadonlyMap<string, TargetEntry>,
	generatedTargets: Set<TargetEntry>,
): unknown {
	let output = base.value;
	const covered: Array<readonly (string | number)[]> = [];
	for (const reference of normalizedReferences(base)) {
		if (
			covered.some((ancestor) => hasPathPrefix(reference.valuePath, ancestor))
		) {
			continue;
		}
		const target = targets.get(canonicalPath(reference.targetPath));
		if (!target) continue;
		const consumerSlot = valueAtPath(base.value, reference.valuePath);
		if (
			!consumerSlot.found ||
			!semanticEqual(consumerSlot.value, target.base.value)
		) {
			continue;
		}
		const renderedReference = `{${target.projectedPath}}`;
		output = writeValueAtPath(output, reference.valuePath, renderedReference);
		covered.push(reference.valuePath);
		generatedTargets.add(target);
	}
	return output;
}

function namespaceFor(
	namespaces: Map<string, NamespaceState>,
	name: string,
): NamespaceState {
	let namespace = namespaces.get(name);
	if (!namespace) {
		namespace = { entries: new Map<string, LocalEntry>() };
		namespaces.set(name, namespace);
	}
	return namespace;
}

function addDirectToken(
	namespaces: Map<string, NamespaceState>,
	targets: Map<string, TargetEntry>,
	token: WaveToken,
	filterLayer: number,
): void {
	const sourcePath = token.path.join('.');
	const { namespace, localKey } = projectPath(
		token.path,
		sourcePath,
		filterLayer,
	);
	const value = formatFlatTokenValue(token);
	assertMdYamlSafeValue(value, sourcePath);
	const state = namespaceFor(namespaces, namespace);
	const existing = state.entries.get(localKey);
	if (existing) {
		throw collisionError(`${namespace}.${localKey}`, [
			...existing.sourcePaths,
			sourcePath,
		]);
	}
	const base: BaseEntry = {
		sourcePath: [...token.path],
		value,
		references: getTokenReferenceLineage(token),
	};
	state.entries.set(localKey, {
		kind: 'direct',
		base,
		projectedPath: `${namespace}.${localKey}`,
		sourcePaths: [sourcePath],
	});
	targets.set(canonicalPath(token.path), {
		base,
		namespace,
		localKey,
		projectedPath: `${namespace}.${localKey}`,
	});
}

function addCompositeChild(
	namespaces: Map<string, NamespaceState>,
	token: WaveToken,
	filterLayer: number,
): void {
	const sourcePath = token.path.join('.');
	const groupPath = token.path.slice(0, -1);
	const exactMarker = groupPath.join('.');
	if (token._composite !== exactMarker) {
		throw mdYamlError(
			sourcePath,
			`_composite marker ${JSON.stringify(token._composite)} does not match exact group path ${JSON.stringify(exactMarker)}`,
		);
	}
	const property = token.path[token.path.length - 1];
	if (property === undefined) {
		throw mdYamlError(sourcePath, 'explicit composite child has no property');
	}
	assertPathSegments([property], sourcePath);
	const { namespace, localKey } = projectPath(
		groupPath,
		sourcePath,
		filterLayer,
	);
	const value = formatFlatTokenValue(token);
	assertMdYamlSafeValue(value, sourcePath);
	const state = namespaceFor(namespaces, namespace);
	const existing = state.entries.get(localKey);
	if (existing?.kind === 'direct') {
		throw collisionError(`${namespace}.${localKey}`, [
			...existing.sourcePaths,
			sourcePath,
		]);
	}
	if (existing?.kind === 'composite' && existing.groupPath !== exactMarker) {
		throw collisionError(`${namespace}.${localKey}`, [
			...existing.sourcePaths,
			sourcePath,
		]);
	}
	const composite: CompositeEntry = existing ?? {
		kind: 'composite' as const,
		groupPath: exactMarker,
		properties: new Map<string, BaseEntry>(),
		propertySources: new Map<string, string[]>(),
		sourcePaths: [],
	};
	const previousSources = composite.propertySources.get(property);
	if (previousSources) {
		throw collisionError(`${namespace}.${localKey}.${property}`, [
			...previousSources,
			sourcePath,
		]);
	}
	composite.properties.set(property, {
		sourcePath: [...token.path],
		value,
		references: getTokenReferenceLineage(token),
	});
	composite.propertySources.set(property, [sourcePath]);
	composite.sourcePaths.push(sourcePath);
	if (!existing) state.entries.set(localKey, composite);
}

function mapToNullPrototypeRecord(
	namespaces: Map<string, NamespaceState>,
	targets: ReadonlyMap<string, TargetEntry>,
): Record<string, unknown> {
	const output = Object.create(null) as Record<string, unknown>;
	const generatedTargets = new Set<TargetEntry>();
	for (const [namespaceName, namespace] of namespaces) {
		const localOutput = Object.create(null) as Record<string, unknown>;
		for (const [localKey, entry] of namespace.entries) {
			if (entry.kind === 'direct') {
				defineDataProperty(
					localOutput,
					localKey,
					overlayReferences(entry.base, targets, generatedTargets),
				);
				continue;
			}
			const compositeOutput = Object.create(null) as Record<string, unknown>;
			for (const [property, base] of entry.properties) {
				defineDataProperty(
					compositeOutput,
					property,
					overlayReferences(base, targets, generatedTargets),
				);
			}
			defineDataProperty(localOutput, localKey, compositeOutput);
		}
		defineDataProperty(output, namespaceName, localOutput);
	}
	for (const target of generatedTargets) {
		const namespace = ownEnumerableDataValue(output, target.namespace);
		const emitted =
			namespace.found &&
			typeof namespace.value === 'object' &&
			namespace.value !== null &&
			ownEnumerableDataValue(namespace.value, target.localKey).found;
		if (!emitted) {
			throw new Error(
				`md-yml platform generated reference target ${target.projectedPath} is missing from payload`,
			);
		}
	}
	return output;
}

export const mdYamlFormat: WaveFormatFn = (
	tokens: WaveToken[],
	options?: Record<string, unknown>,
): string => {
	const filterLayer = (options?.filterLayer as number | undefined) ?? 0;
	assertFilterLayer(filterLayer);

	const ordered = tokens
		.map((token, inputIndex) => ({ token, inputIndex }))
		.sort(
			(a, b) => a.token._order - b.token._order || a.inputIndex - b.inputIndex,
		);
	const namespaces = new Map<string, NamespaceState>();
	const targets = new Map<string, TargetEntry>();
	for (const { token } of ordered) {
		if (token._composite !== undefined) {
			addCompositeChild(namespaces, token, filterLayer);
		} else {
			addDirectToken(namespaces, targets, token, filterLayer);
		}
	}

	try {
		return yaml.dump(mapToNullPrototypeRecord(namespaces, targets), {
			lineWidth: -1,
			noRefs: true,
			sortKeys: false,
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`md-yml platform serialization failed: ${reason}`);
	}
};
