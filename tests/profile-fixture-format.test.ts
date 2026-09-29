import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const themesDir = path.resolve(import.meta.dir, 'fixtures/themes');
// M1-1: identity-only legacy scenarios migrate with ids/doctor behavior in M4.
const deferredToM4 = new Set(['identity-ladder', 'identity-conflict']);

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function auditNewTokens(
	node: Record<string, unknown>,
	inheritedType?: string,
): void {
	const type = typeof node.$type === 'string' ? node.$type : inheritedType;
	if (Object.hasOwn(node, '$value')) {
		expect(typeof type).toBe('string');
		expect(type?.trim().length).toBeGreaterThan(0);
		return;
	}
	for (const [key, child] of Object.entries(node)) {
		if (key.startsWith('$')) continue;
		expect(record(child), `new token/group ${key}`).toBe(true);
		if (record(child)) auditNewTokens(child, type);
	}
}

describe('every day profile fixture uses the new delta format', () => {
	test('parses all files, verifies base identity, exact overrides and local token types', async () => {
		let checked = 0;
		let deferred = 0;
		for await (const relative of new Bun.Glob('**/profiles/**/*.yaml').scan(
			themesDir,
		)) {
			if (path.basename(relative).includes('@night')) continue;
			const fixtureRoot = relative.split(`${path.sep}profiles${path.sep}`)[0]!;
			if (deferredToM4.has(fixtureRoot)) {
				deferred++;
				continue;
			}
			const profilePath = path.join(themesDir, relative);
			const profile = yaml.load(await Bun.file(profilePath).text());
			const main = yaml.load(
				await Bun.file(path.join(themesDir, fixtureRoot, 'main.yaml')).text(),
			);
			expect(record(profile), profilePath).toBe(true);
			expect(record(main), profilePath).toBe(true);
			if (!record(profile) || !record(main)) continue;
			expect(record(profile.$config), profilePath).toBe(true);
			if (!record(profile.$config)) continue;
			expect(typeof profile.$config.base, profilePath).toBe('string');
			expect(
				(profile.$config.base as string).trim().length,
				profilePath,
			).toBeGreaterThan(0);
			expect(profile.$config.base, profilePath).toBe(main.$id);
			const ids = new Set<string>();
			function auditBase(node: Record<string, unknown>): void {
				if (Object.hasOwn(node, '$value')) {
					expect(typeof node.$id, profilePath).toBe('string');
					expect(
						(node.$id as string).trim().length,
						profilePath,
					).toBeGreaterThan(0);
					ids.add(node.$id as string);
					return;
				}
				for (const [key, child] of Object.entries(node)) {
					if (!key.startsWith('$') && record(child)) auditBase(child);
				}
			}
			auditBase(main);
			if (Object.hasOwn(profile, '$override')) {
				expect(record(profile.$override), profilePath).toBe(true);
				if (record(profile.$override))
					for (const [id, entry] of Object.entries(profile.$override)) {
						expect(id.trim().length, profilePath).toBeGreaterThan(0);
						expect(ids.has(id), profilePath).toBe(true);
						expect(record(entry), profilePath).toBe(true);
						if (record(entry))
							expect(Object.keys(entry), profilePath).toEqual(['$value']);
					}
			}
			auditNewTokens(
				Object.fromEntries(
					Object.entries(profile).filter(([key]) => !key.startsWith('$')),
				),
			);
			checked++;
		}
		expect(deferred).toBe(2);
		expect(checked).toBe(22); // 21 existing profiles (including nested-invalid) plus the minimal fixture.
	});
});
