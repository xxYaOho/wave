import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

/**
 * Milestone-1 audit (Task-5): enumerate every theme fixture YAML file
 * (non-sampling) and assert the source-side contracts that the identity
 * milestone relies on:
 * 1. no token mixes `$value` with authored child nodes (DTCG §6.1);
 * 2. no token type stays undecidable through $type, group inheritance,
 *    references, the `color` root-name channel, or pending `$extends`
 *    expansion (DTCG §5.2.2, doctor-strict view).
 */
const themesDir = path.resolve(import.meta.dir, 'fixtures/themes');

interface Violation {
	file: string;
	path: string;
	kind: 'mixed-body' | 'undecidable-type';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReferenceValue(value: unknown): boolean {
	return (
		(typeof value === 'string' &&
			/^\{[a-zA-Z][a-zA-Z0-9-./]*\}$/.test(value)) ||
		(isRecord(value) && typeof value.$ref === 'string')
	);
}

function walk(
	node: unknown,
	relFile: string,
	nodePath: string,
	inheritedType: string | undefined,
	chainHasExtends: boolean,
	violations: Violation[],
): void {
	if (!isRecord(node)) return;

	if ('$value' in node) {
		const authoredChildren = Object.keys(node).filter(
			(key) => !key.startsWith('$') && !key.startsWith('_'),
		);
		if (authoredChildren.length > 0) {
			violations.push({
				file: relFile,
				path: nodePath,
				kind: 'mixed-body',
			});
		}

		const value = node.$value;
		const explicitType =
			typeof node.$type === 'string' ? node.$type : undefined;
		const colorRootTyped = nodePath.split('.').slice(0, -1).pop() === 'color';
		if (
			explicitType === undefined &&
			inheritedType === undefined &&
			!isReferenceValue(value) &&
			!colorRootTyped &&
			!chainHasExtends &&
			value !== null &&
			value !== undefined
		) {
			violations.push({
				file: relFile,
				path: nodePath,
				kind: 'undecidable-type',
			});
		}
		return;
	}

	const groupType = typeof node.$type === 'string' ? node.$type : inheritedType;
	const nextChainHasExtends = chainHasExtends || '$extends' in node;
	for (const [key, child] of Object.entries(node)) {
		if (key.startsWith('$')) continue;
		walk(
			child,
			relFile,
			nodePath ? `${nodePath}.${key}` : key,
			groupType,
			nextChainHasExtends,
			violations,
		);
	}
}

function listYamlFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listYamlFiles(full));
		} else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
			files.push(full);
		}
	}
	return files;
}

describe('theme fixture identity audit (all files, non-sampling)', () => {
	const files = listYamlFiles(themesDir).sort();

	test('enumerates the fixture corpus', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	test('no mixed bodies and no type-undecidable nodes in any fixture', () => {
		const violations: Violation[] = [];
		let scanned = 0;

		for (const file of files) {
			const relFile = path.relative(themesDir, file);
			let parsed: unknown;
			try {
				parsed = yaml.load(fs.readFileSync(file, 'utf8'));
			} catch {
				continue; // malformed fixtures assert parse failures elsewhere
			}
			if (!isRecord(parsed)) continue;
			scanned += 1;

			for (const [key, child] of Object.entries(parsed)) {
				if (key.startsWith('$')) continue;
				if (key === 'doctor') continue; // doctor config, not token data
				walk(child, relFile, key, undefined, false, violations);
			}
		}

		expect(scanned).toBeGreaterThan(50);
		expect(violations).toEqual([]);
	});
});
