import type {
	DtcgScalarValue,
	DtcgTokenGroup,
	DtcgValue,
} from '../../types/index.ts';

export const REFERENCE_PATTERN =
	/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/;

// JSON Pointer 解析（RFC 6901）
function parseJsonPointer(pointer: string): string[] | null {
	if (!pointer.startsWith('#')) {
		return null;
	}
	const path = pointer.slice(1);
	if (path === '') {
		return [];
	}
	if (!path.startsWith('/')) {
		return null;
	}
	return path.slice(1).split('/').map(decodeJsonPointerSegment);
}

// 解码 JSON Pointer 段（~1 -> /, ~0 -> ~）
function decodeJsonPointerSegment(segment: string): string {
	return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

// 解析后的 $ref 结构
export interface ParsedDtcgRef {
	source: string;
	path: string[];
	valuePath: string[];
}

// 解析 DTCG $ref 路径
export function parseDtcgRef(ref: string): ParsedDtcgRef | null {
	const segments = parseJsonPointer(ref);
	if (!segments || segments.length < 1) {
		return null;
	}
	const source = segments[0];
	if (!source) {
		return null;
	}
	const path = segments.slice(1);
	const valuePath: string[] = [];
	if (path.length > 0 && path[path.length - 1] === '$value') {
		valuePath.push('$value');
		return { source, path: path.slice(0, -1), valuePath };
	}
	return { source, path, valuePath };
}

export function getValueAtPath(obj: unknown, path: string[]): unknown {
	let current: unknown = obj;

	for (const key of path) {
		if (current === null || current === undefined) {
			return undefined;
		}

		if (typeof current === 'object' && key in current) {
			current = (current as Record<string, unknown>)[key];
		} else {
			return undefined;
		}
	}

	return current;
}

export function isDtcgScalarValue(value: unknown): value is DtcgScalarValue {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	);
}

export function isDtcgValue(value: unknown): value is DtcgValue {
	if (isDtcgScalarValue(value)) {
		return true;
	}

	if (Array.isArray(value)) {
		return value.every(isDtcgValue);
	}

	if (typeof value === 'object' && value !== null) {
		for (const [, val] of Object.entries(value)) {
			if (Array.isArray(val)) {
				if (!val.every(isDtcgValue)) {
					return false;
				}
			} else if (!isDtcgValue(val)) {
				return false;
			}
		}
		return true;
	}

	return false;
}

export function extractValue(found: unknown): DtcgValue | undefined {
	if (found === null || found === undefined) {
		return undefined;
	}

	if (typeof found === 'object' && found !== null && '$value' in found) {
		const token = found as { $value: unknown };
		if (isDtcgValue(token.$value)) {
			return token.$value;
		}
		return undefined;
	}

	if (isDtcgValue(found)) {
		return found;
	}

	return undefined;
}

function formatSwatchName(parts: string[]): string | undefined {
	if (parts.length === 0) return undefined;
	const first = parts[0];
	const rest = parts.slice(1);
	return (
		first + (rest.length > 0 ? `/${rest.join('-').replace(/\./g, '-')}` : '')
	);
}

export function deriveSwatchNameFromDtcgRef(ref: string): string | undefined {
	const parsed = parseDtcgRef(ref);
	if (!parsed) return undefined;
	const { path } = parsed;
	if (path.length === 0) return undefined;
	return formatSwatchName(path);
}

export function deriveSwatchNameFromStringRef(
	value: string,
): string | undefined {
	const match = value.match(
		/^\{([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\}$/,
	);
	if (!match) return undefined;
	const pathStr = match[1];
	if (!pathStr) return undefined;
	const parts = pathStr.split('.');
	parts.shift(); // 去掉 namespace
	return formatSwatchName(parts);
}

export function inferRootKeys(tree: DtcgTokenGroup): Set<string> {
	const keys = Object.keys(tree).filter((k) => !k.startsWith('$'));
	return new Set(keys.length > 0 ? keys : ['theme']);
}
