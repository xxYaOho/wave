import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const themesDir = path.resolve(import.meta.dir, 'fixtures/themes');

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
		for await (const relative of new Bun.Glob('**/profiles/**/*.yaml').scan(
			themesDir,
		)) {
			if (path.basename(relative).includes('@night')) continue;
			const fixtureRoot = relative.split(`${path.sep}profiles${path.sep}`)[0]!;
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
					if (fixtureRoot !== 'identity-ladder') {
						expect(typeof node.$id, profilePath).toBe('string');
						expect(
							(node.$id as string).trim().length,
							profilePath,
						).toBeGreaterThan(0);
					}
					if (typeof node.$id === 'string' && node.$id.trim() !== '')
						ids.add(node.$id);
					return;
				}
				for (const [key, child] of Object.entries(node)) {
					if (!key.startsWith('$') && record(child)) auditBase(child);
				}
			}
			if (fixtureRoot === 'identity-ladder') {
				const theme = main.theme as Record<string, unknown>;
				const color = theme.color as Record<string, Record<string, unknown>>;
				expect(color.reserved?.$id).toBeNull();
				expect(color.blank?.$id).toBe('');
				expect(color.legacy).not.toHaveProperty('$id');
				expect(color.custom?.$id).toBe('brand-legacy-id');
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
		expect(checked).toBe(24); // All day profiles, including both migrated identity fixtures.
	});
});
