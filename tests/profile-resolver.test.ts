import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
	discoverProfiles,
	mergeNightOverlay,
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
				baseConfig: base.config,
				baseDir: invalidDir,
			}),
		).rejects.toThrow('$config.theme is only supported in main.yaml');
	});

	test('discovers main and named profiles without variants', async () => {
		const profiles = await discoverProfiles(fixtureDir);

		expect(profiles.map((profile) => profile.name)).toEqual([
			'main',
			'bad-ref',
			'mobile',
		]);
		expect(profiles.find((profile) => profile.name === 'main')?.isDefault).toBe(
			true,
		);
		expect(
			profiles
				.find((profile) => profile.name === 'mobile')
				?.path.endsWith('profiles/mobile.yaml'),
		).toBe(true);
	});

	test('discovers default night path without treating it as a profile', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const main = profiles.find((profile) => profile.name === 'main');

		expect(profiles.map((profile) => profile.name)).toEqual([
			'main',
			'bad-ref',
			'mobile',
		]);
		expect(main?.nightPath?.endsWith('main@night.yaml')).toBe(true);
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

		expect(selected.map((profile) => profile.name)).toEqual([
			'main',
			'bad-ref',
			'mobile',
		]);
	});

	test('default profile with local config does not duplicate loaded resources', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const defaultConfig = {
			theme: 'profile-model',
			parameter: {},
			resources: [
				{ kind: 'palette', ref: 'tailwindcss' },
				{ kind: 'dimension', ref: 'wave' },
			],
			parameterGroups: [],
		};

		const document = await parseProfileDocument(main, {
			defaultConfig,
			baseDir: fixtureDir,
		});

		expect(document.config.resources).toEqual([
			{ kind: 'palette', ref: 'tailwindcss' },
			{ kind: 'dimension', ref: 'wave' },
		]);
	});

	test('default profile without local config uses defaultConfig', async () => {
		const noConfigDir = path.join(fixtureDir, 'no-config-main');
		const profiles = await discoverProfiles(noConfigDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const defaultConfig = {
			theme: 'config-owner',
			parameter: { platform: 'json', output: './dist' },
			resources: [
				{ kind: 'palette', ref: 'tailwindcss' },
				{ kind: 'dimension', ref: 'wave' },
			],
			parameterGroups: [],
		};

		const document = await parseProfileDocument(main, {
			defaultConfig,
			baseDir: noConfigDir,
		});

		expect(document.config.theme).toBe('config-owner');
		expect(document.config.parameter.platform).toBe('json');
		expect(document.config.resources).toEqual(defaultConfig.resources);
	});

	test('profile-local custom resources are normalized to absolute refs', async () => {
		const profiles = await discoverProfiles(fixtureDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const mobile = profiles.find((profile) => profile.name === 'mobile')!;
		const base = await parseProfileDocument(main, { baseDir: fixtureDir });
		const document = await parseProfileDocument(mobile, {
			baseConfig: base.config,
			baseDir: fixtureDir,
		});

		expect(
			document.config.resources.some(
				(resource) =>
					resource.kind === 'custom' &&
					path.isAbsolute(resource.ref) &&
					resource.ref.endsWith('resources/mobile-resource.yaml'),
			),
		).toBe(true);
	});

	test('profile-local non-custom resources are normalized to absolute refs', async () => {
		const absoluteFixtureDir = path.join(fixtureDir, 'absolute-resource');
		const profiles = await discoverProfiles(absoluteFixtureDir);
		const main = profiles.find((profile) => profile.name === 'main')!;
		const mobile = profiles.find((profile) => profile.name === 'mobile')!;
		const base = await parseProfileDocument(main, {
			baseDir: absoluteFixtureDir,
		});
		const document = await parseProfileDocument(mobile, {
			baseConfig: base.config,
			baseDir: absoluteFixtureDir,
		});

		expect(
			document.config.resources.some(
				(resource) =>
					resource.kind === 'palette' &&
					path.isAbsolute(resource.ref) &&
					resource.ref.endsWith('resources/palette.yaml'),
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
			baseConfig: base.config,
			baseDir: groupFixtureDir,
		});

		expect(document.config.parameterGroups).toHaveLength(1);
		expect(document.config.parameterGroups[0]).toMatchObject({
			name: 'css',
			parameter: {
				platform: 'css',
			},
		});
		expect(document.config.parameterGroups[0]!.parameter.output).toContain(
			'profiles/mobile-css-dist',
		);
	});

	test('night overlay can override existing color paths', () => {
		const day = {
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000000' },
				},
			},
		};
		const night = {
			theme: {
				color: {
					primary: { $value: '#ffffff' },
				},
			},
		};

		const result = mergeNightOverlay(day, night);

		expect(result.ok).toBe(true);
		if (result.ok) {
			const primary = (
				result.tree as {
					theme: { color: { primary: { $type: string; $value: string } } };
				}
			).theme.color.primary;
			expect(primary.$type).toBe('color');
			expect(primary.$value).toBe('#ffffff');
		}
	});

	test('night overlay rejects unsupported roots without throwing', () => {
		const day = {
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000000' },
				},
			},
		};
		const night = {
			theme: {
				radius: {
					md: { $type: 'dimension', $value: 8 },
				},
			},
		};

		const result = mergeNightOverlay(day, night);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toBe('Night Mode unavailable/invalid and skipped');
		}
	});

	test('night overlay rejects $config content', () => {
		const day = {
			theme: {
				color: {
					primary: { $type: 'color', $value: '#000000' },
				},
			},
		};
		const night = {
			$config: {
				parameter: {
					platform: ['sketch'],
				},
			},
			theme: {
				color: {
					primary: { $value: '#ffffff' },
				},
			},
		};

		const result = mergeNightOverlay(day, night);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.message).toBe('Night Mode unavailable/invalid and skipped');
		}
	});
});
