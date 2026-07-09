import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
	discoverProfiles,
	normalizeProfileName,
	parseProfileDocument,
	resolveProfilesToBuild,
} from '../src/core/pipeline/profile-resolver.ts';

const rootDir = path.resolve(import.meta.dir, '..');
const fixtureDir = path.join(rootDir, 'tests/fixtures/themes/profile-model');

describe('profile resolver', () => {
	test('normalizes profile filenames', () => {
		expect(normalizeProfileName('Mobile Web')).toBe('mobile_web');
		expect(normalizeProfileName('mobile-web')).toBe('mobile-web');
		expect(normalizeProfileName('mobile_web')).toBe('mobile_web');
	});

	test('rejects invalid profile stems with dots', () => {
		expect(() => normalizeProfileName('mobile.web')).toThrow(
			'Invalid profile name "mobile.web"',
		);
	});

	test('rejects nested profile directories', async () => {
		await expect(
			discoverProfiles(path.join(fixtureDir, 'nested-invalid')),
		).rejects.toThrow('Nested profile directories are not supported');
	});

	test('rejects $config.theme in named profiles', async () => {
		const invalidDir = path.join(fixtureDir, 'theme-in-profile-invalid');
		const profiles = await discoverProfiles(invalidDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const mobile = profiles.find((profile) => profile.name === 'mobile')!;
		const base = await parseProfileDocument(main, { baseDir: invalidDir });

		await expect(
			parseProfileDocument(mobile, {
				baseParsed: base.parsed,
				baseDir: invalidDir,
			}),
		).rejects.toThrow('$config.theme is only supported in main.yaml');
	});

	test('discovers main and named profiles without variants', async () => {
		const profiles = await discoverProfiles(fixtureDir);

		expect(profiles.map((profile) => profile.name)).toEqual(['main', 'mobile']);
		expect(profiles.find((profile) => profile.name === 'main')?.isDefault).toBe(
			true,
		);
		expect(
			profiles
				.find((profile) => profile.name === 'mobile')
				?.path.endsWith('profiles/mobile.yaml'),
		).toBe(true);
	});

	test('default build selects only main', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const selected = resolveProfilesToBuild(profiles, { night: false });

		expect(selected.map((profile) => profile.name)).toEqual(['main']);
	});

	test('profile build selects one named profile', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const selected = resolveProfilesToBuild(profiles, {
			night: false,
			profile: 'mobile',
		});

		expect(selected.map((profile) => profile.name)).toEqual(['mobile']);
	});

	test('profiles all selects main then named profiles', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const selected = resolveProfilesToBuild(profiles, {
			night: false,
			profiles: 'all',
		});

		expect(selected.map((profile) => profile.name)).toEqual(['main', 'mobile']);
	});

	test('default profile with local config does not duplicate loaded resources', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const loadedThemefileConfig = {
			THEME: 'profile-model',
			PARAMETER: {},
			resources: [
				{ kind: 'palette', ref: 'tailwindcss' },
				{ kind: 'dimension', ref: 'wave' },
			],
			groups: [],
		};

		const document = await parseProfileDocument(main, {
			defaultParsed: loadedThemefileConfig,
			baseDir: fixtureDir,
		});

		expect(document.parsed.resources).toEqual([
			{ kind: 'palette', ref: 'tailwindcss' },
			{ kind: 'dimension', ref: 'wave' },
		]);
	});

	test('profile-local custom resources are normalized to absolute refs', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const mobile = profiles.find((profile) => profile.name === 'mobile')!;
		const base = await parseProfileDocument(main, { baseDir: fixtureDir });
		const document = await parseProfileDocument(mobile, {
			baseParsed: base.parsed,
			baseDir: fixtureDir,
		});

		expect(
			document.parsed.resources.some(
				(resource) =>
					resource.kind === 'custom' &&
					path.isAbsolute(resource.ref) &&
					resource.ref.endsWith('resources/mobile-resource.yaml'),
			),
		).toBe(true);
	});

	test('profile parameterGroup merges same-name groups by field', async () => {
		const groupFixtureDir = path.join(fixtureDir, 'group-merge');
		const profiles = await discoverProfiles(groupFixtureDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const mobile = profiles.find((profile) => profile.name === 'mobile')!;
		const base = await parseProfileDocument(main, { baseDir: groupFixtureDir });
		const document = await parseProfileDocument(mobile, {
			baseParsed: base.parsed,
			baseDir: groupFixtureDir,
		});

		expect(document.parsed.groups).toHaveLength(1);
		expect(document.parsed.groups[0]).toMatchObject({
			name: 'css',
			PARAMETER: {
				platform: 'css',
			},
		});
		expect(document.parsed.groups[0]!.PARAMETER.output).toContain(
			'profiles/mobile-css-dist',
		);
	});
});
