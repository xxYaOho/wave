import type {
	DtcgValue,
	ResolvedDtcgToken,
	ResolvedTokenGroup,
} from '../../types/index.ts';
import { isDtcgRefValue } from '../../types/index.ts';
import { parseDtcgRef, REFERENCE_PATTERN } from './reference-utils.ts';

export type NestedDtcgValue =
	| DtcgValue
	| NestedDtcgValue[]
	| { [key: string]: NestedDtcgValue };

function hasInternalReferences(
	value: NestedDtcgValue,
	rootKeys: Set<string>,
): boolean {
	// 检查 $ref 对象
	if (isDtcgRefValue(value)) {
		const parsed = parseDtcgRef(value.$ref);
		return parsed !== null && rootKeys.has(parsed.source);
	}

	if (typeof value === 'string') {
		const match = value.match(REFERENCE_PATTERN);
		if (match?.[1]) {
			const prefix = match[1].split('.')[0]!;
			return rootKeys.has(prefix);
		}
		return false;
	}

	// 处理数组
	if (Array.isArray(value)) {
		return value.some((item) => hasInternalReferences(item, rootKeys));
	}

	// 处理对象
	if (typeof value === 'object' && value !== null) {
		for (const [, val] of Object.entries(value)) {
			if (val === undefined) {
				continue;
			}
			if (hasInternalReferences(val, rootKeys)) {
				return true;
			}
		}
	}

	return false;
}

function tokenHasInternalReferences(
	token: ResolvedDtcgToken,
	rootKeys: Set<string>,
): boolean {
	return (
		hasInternalReferences(token.$value, rootKeys) ||
		(token.$extensions !== undefined &&
			hasInternalReferences(
				token.$extensions as unknown as NestedDtcgValue,
				rootKeys,
			))
	);
}

export function groupHasInternalReferences(
	group: ResolvedTokenGroup,
	rootKeys: Set<string>,
): boolean {
	for (const [key, value] of Object.entries(group)) {
		if (key === '$type' || key === '$description') {
			continue;
		}

		if (typeof value === 'object' && value !== null && '$value' in value) {
			if (tokenHasInternalReferences(value as ResolvedDtcgToken, rootKeys)) {
				return true;
			}
		} else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value)
		) {
			if (groupHasInternalReferences(value as ResolvedTokenGroup, rootKeys)) {
				return true;
			}
		}
	}

	return false;
}

// CQ-006: Collect remaining internal references when iteration is exhausted
export function collectInternalReferences(
	group: ResolvedTokenGroup,
	rootKeys: Set<string>,
): string[] {
	const refs: string[] = [];

	function collectFromValue(value: unknown, path: string): void {
		// Check $ref objects
		if (isDtcgRefValue(value)) {
			const parsed = parseDtcgRef(value.$ref);
			if (parsed && rootKeys.has(parsed.source)) {
				refs.push(`${path}: ${value.$ref}`);
			}
			return;
		}

		// Check string values with {references}
		if (typeof value === 'string') {
			const matches = value.matchAll(/\{(\w+)\.([^}]+)\}/g);
			for (const match of matches) {
				if (match[1] && rootKeys.has(match[1])) {
					refs.push(`${path}: {${match[1]}.${match[2]}}`);
				}
			}
			return;
		}

		// Check arrays
		if (Array.isArray(value)) {
			value.forEach((item, index) => {
				collectFromValue(item, `${path}[${index}]`);
			});
			return;
		}

		// Check objects
		if (typeof value === 'object' && value !== null) {
			for (const [key, val] of Object.entries(value)) {
				if (key === '$type' || key === '$description') continue;
				collectFromValue(val, path ? `${path}.${key}` : key);
			}
		}
	}

	for (const [key, value] of Object.entries(group)) {
		if (key === '$type' || key === '$description') continue;

		if (typeof value === 'object' && value !== null && '$value' in value) {
			const token = value as ResolvedDtcgToken;
			collectFromValue(token.$value, key);
			if (token.$extensions !== undefined) {
				collectFromValue(token.$extensions as unknown as NestedDtcgValue, key);
			}
		} else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value)
		) {
			const nested = collectInternalReferences(
				value as ResolvedTokenGroup,
				rootKeys,
			);
			refs.push(...nested.map((r) => `${key}.${r}`));
		}
	}

	return refs;
}
