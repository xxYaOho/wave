import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { ParseError } from '../../types/index.ts';
import { restoreResourceCache } from '../resources/manager.ts';
import { resourceCachePath } from '../resources/paths.ts';
import { validateGenericResource } from '../schema/resource.ts';
import { getResourcesDir } from './index.ts';

export interface LoadedResource {
	namespace: string;
	data: Record<string, unknown>;
	content: string;
	path: string;
	kind: string;
}

function isBareName(ref: string): boolean {
	return !ref.includes('/') && !ref.startsWith('./') && !ref.startsWith('../');
}

async function resolveResourcePath(
	kind: string,
	ref: string,
	themeDir: string,
): Promise<{ path: string; source: 'builtin' | 'cache' | 'user' }> {
	if (path.isAbsolute(ref)) {
		return { path: ref, source: 'user' };
	}

	if (kind === 'custom') {
		return { path: path.join(themeDir, ref), source: 'user' };
	}

	if (isBareName(ref)) {
		const cachePath = resourceCachePath(ref);
		if (await Bun.file(cachePath).exists()) {
			return { path: cachePath, source: 'cache' };
		}
		const restored = await restoreResourceCache(ref);
		if (restored) {
			return { path: restored, source: 'cache' };
		}
		const typeDir =
			kind === 'palette'
				? 'palettes'
				: kind === 'dimension'
					? 'dimensions'
					: 'brands';
		return {
			path: path.join(getResourcesDir(), typeDir, `${ref}.yaml`),
			source: 'builtin',
		};
	}

	return { path: path.join(themeDir, ref), source: 'user' };
}

export async function loadResource(
	kind: string,
	ref: string,
	themeDir: string,
): Promise<LoadedResource | ParseError> {
	const { path: filePath } = await resolveResourcePath(kind, ref, themeDir);

	let content: string;
	try {
		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			return {
				line: 1,
				message: `Resource not found: ${filePath}`,
			};
		}
		content = await file.text();
	} catch (err) {
		return {
			line: 1,
			message: `Failed to read resource: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	let parsed: unknown;
	try {
		parsed = yaml.load(content);
	} catch (err) {
		if (err instanceof yaml.YAMLException) {
			return {
				line: err.mark?.line ? err.mark.line + 1 : 1,
				message: `YAML/JSON parse error: ${err.message}`,
			};
		}
		return {
			line: 1,
			message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {
			line: 1,
			message: 'Resource root must be an object',
		};
	}

	const generic = validateGenericResource(
		parsed as Record<string, unknown>,
		filePath,
	);
	if (!generic.success) {
		return generic.error;
	}

	const crossRefError = findCrossDependencyReferences(
		generic.data,
		generic.namespace,
	);
	if (crossRefError) {
		return {
			line: 1,
			message: crossRefError,
		};
	}

	return {
		namespace: generic.namespace,
		data: generic.data,
		content,
		path: filePath,
		kind,
	};
}

const REF_PATTERN = /\{([a-zA-Z][a-zA-Z0-9-]*)\./g;

function findCrossDependencyReferences(
	data: unknown,
	ownNamespace: string,
	path: string = '',
): string | null {
	if (typeof data === 'string') {
		const matches = data.matchAll(REF_PATTERN);
		for (const match of matches) {
			const ns = match[1];
			if (ns && ns !== ownNamespace) {
				return `Cross-dependency reference detected at ${path || 'root'}: {${ns}...} references another dependency namespace`;
			}
		}
		return null;
	}

	if (Array.isArray(data)) {
		for (let i = 0; i < data.length; i++) {
			const err = findCrossDependencyReferences(
				data[i],
				ownNamespace,
				`${path}[${i}]`,
			);
			if (err) return err;
		}
		return null;
	}

	if (typeof data === 'object' && data !== null) {
		for (const [key, val] of Object.entries(data)) {
			if (key === '$ref' && typeof val === 'string') {
				const segments = val.split('/');
				if (segments.length > 1 && segments[0] === '#') {
					const ns = segments[1];
					if (ns && ns !== 'theme' && ns !== ownNamespace) {
						return `Cross-dependency reference detected at ${path || 'root'}: $ref "${val}" references another dependency namespace`;
					}
				}
			}
			const childPath = path ? `${path}.${key}` : key;
			const err = findCrossDependencyReferences(val, ownNamespace, childPath);
			if (err) return err;
		}
		return null;
	}

	return null;
}
