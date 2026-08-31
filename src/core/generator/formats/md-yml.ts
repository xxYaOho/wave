import * as yaml from 'js-yaml';
import type { WaveFormatFn, WaveToken } from '../../../types/index.ts';
import { formatFlatTokenValue } from './flat-value.ts';

interface DirectEntry {
	kind: 'direct';
	value: unknown;
	sourcePaths: string[];
}

interface CompositeEntry {
	kind: 'composite';
	groupPath: string;
	properties: Map<string, unknown>;
	propertySources: Map<string, string[]>;
	sourcePaths: string[];
}

type LocalEntry = DirectEntry | CompositeEntry;

interface NamespaceState {
	entries: Map<string, LocalEntry>;
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
	state.entries.set(localKey, {
		kind: 'direct',
		value,
		sourcePaths: [sourcePath],
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
	const composite = existing ?? {
		kind: 'composite' as const,
		groupPath: exactMarker,
		properties: new Map<string, unknown>(),
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
	composite.properties.set(property, value);
	composite.propertySources.set(property, [sourcePath]);
	composite.sourcePaths.push(sourcePath);
	if (!existing) state.entries.set(localKey, composite);
}

function mapToNullPrototypeRecord(
	namespaces: Map<string, NamespaceState>,
): Record<string, unknown> {
	const output = Object.create(null) as Record<string, unknown>;
	for (const [namespaceName, namespace] of namespaces) {
		const localOutput = Object.create(null) as Record<string, unknown>;
		for (const [localKey, entry] of namespace.entries) {
			if (entry.kind === 'direct') {
				localOutput[localKey] = entry.value;
				continue;
			}
			const compositeOutput = Object.create(null) as Record<string, unknown>;
			for (const [property, value] of entry.properties) {
				compositeOutput[property] = value;
			}
			localOutput[localKey] = compositeOutput;
		}
		output[namespaceName] = localOutput;
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
	for (const { token } of ordered) {
		if (token._composite !== undefined) {
			addCompositeChild(namespaces, token, filterLayer);
		} else {
			addDirectToken(namespaces, token, filterLayer);
		}
	}

	try {
		return yaml.dump(mapToNullPrototypeRecord(namespaces), {
			lineWidth: -1,
			noRefs: true,
			sortKeys: false,
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`md-yml platform serialization failed: ${reason}`);
	}
};
